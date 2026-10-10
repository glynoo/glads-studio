"""Local Golden20 review API. Reads the verified reference archive; never runs algorithms."""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("GLADS_GOLDEN20_ZIP", ROOT / "GLADS_v1.0交付包" / "GLADS-03-Golden20-Reference-v1.0_20260810.zip"))
DATABASE = Path(os.environ.get("GLADS_REVIEW_DB", APP_ROOT / "data" / "reviews.sqlite3"))
UPLOAD_DIR = Path(os.environ.get("GLADS_UPLOAD_DIR", APP_ROOT / "data" / "uploads"))
ZIP_PREFIX = "GLADS-Student-Release/"
MANIFEST = ZIP_PREFIX + "reference_baseline/golden20/lama_rescue_manifest.jsonl"
ARCHIVE_SHA256 = "d12309225db879b3147d4e51186eedd4379ef3357a8d9605fde36fe9d3467890"
DECISIONS = {"approve", "reject", "secondary_repair_required", "defer_expert"}
CANDIDATES = {"R3": 3, "R7": 7, "R12": 12}
CASE_ID = re.compile(r"^case_(\d{4})$")
UPLOAD_ID = re.compile(r"^upload_[0-9a-f]{32}$")
DB_LOCK = threading.Lock()
SESSION_SECONDS = 7 * 24 * 60 * 60
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def verify_archive(path=ARCHIVE):
    if not path.is_file():
        raise FileNotFoundError(f"Golden20 archive not found: {path}")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != ARCHIVE_SHA256:
        raise ValueError("Golden20 SHA256 does not match the delivery index")


class ArchiveCatalog:
    def __init__(self, path=ARCHIVE):
        self.path = Path(path)
        with zipfile.ZipFile(self.path) as archive:
            self.names = set(archive.namelist())
            rows = [json.loads(line) for line in archive.read(MANIFEST).splitlines() if line.strip()]
        self.cases = {}
        for row in rows:
            case_id = f"case_{row['case']:04d}"
            stem = row["image_name"].rsplit(".", 1)[0]
            case_dir = f"{ZIP_PREFIX}reference_baseline/golden20/cases/{case_id}_{stem}/"
            def available(name):
                path = case_dir + name
                return name if path in self.names else None
            variants = {}
            for variant in row["variants"]:
                key = f"R{variant['radius_px']}"
                requested = variant.get("candidate_path")
                path = ZIP_PREFIX + requested if requested else None
                variants[key] = {
                    "image": f"/api/cases/{case_id}/images/{key}" if path in self.names else None,
                    "mask": f"/api/cases/{case_id}/images/{key}_mask" if variant.get("mask_path") and ZIP_PREFIX + variant["mask_path"] in self.names else None,
                    "sha256": variant.get("candidate_sha256") if path in self.names else None,
                    "outsideMaskChangedPixels": variant.get("outside_changed_pixels") if path in self.names else None,
                    "lowTextureWarning": bool(variant.get("texture", {}).get("low_texture_warning")) if path in self.names else None,
                }
            self.cases[case_id] = {
                "id": case_id,
                "imageName": row["image_name"],
                "originalSha256": self._original_sha256(case_dir),
                "categories": row.get("categories", []),
                "riskReasons": row.get("risk_reasons", []),
                "semanticRisk": bool(row.get("semantic_risk")),
                "referenceOnly": True,
                "assets": {
                    "original": f"/api/cases/{case_id}/images/original" if available("original.png") else None,
                    "exactMask": f"/api/cases/{case_id}/images/exact_mask" if available("fused_exact_mask.png") else None,
                    "maskOverlay": f"/api/cases/{case_id}/images/mask_overlay" if available("fused_mask_overlay.png") else None,
                },
                "variants": variants,
            }
            image_map = {
                "original": case_dir + "original.png",
                "exact_mask": case_dir + "fused_exact_mask.png",
                "mask_overlay": case_dir + "fused_mask_overlay.png",
            }
            for variant in row["variants"]:
                key = f"R{variant['radius_px']}"
                if variant.get("candidate_path"):
                    image_map[key] = ZIP_PREFIX + variant["candidate_path"]
                if variant.get("mask_path"):
                    image_map[key + "_mask"] = ZIP_PREFIX + variant["mask_path"]
            self.cases[case_id]["_images"] = {key: path for key, path in image_map.items() if path in self.names}

    def _original_sha256(self, case_dir):
        path = case_dir + "original.png"
        if path not in self.names:
            return None
        with zipfile.ZipFile(self.path) as archive:
            return hashlib.sha256(archive.read(path)).hexdigest()

    def public_case(self, case_id):
        case = self.cases.get(case_id)
        return {k: v for k, v in case.items() if not k.startswith("_")} if case else None

    def image(self, case_id, image_id):
        case = self.cases.get(case_id)
        if not case or image_id not in case["_images"]:
            return None
        with zipfile.ZipFile(self.path) as archive:
            return archive.read(case["_images"][image_id])


@contextmanager
def connection():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATABASE)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db():
    with connection() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, display_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE, password_salt BLOB NOT NULL,
            password_hash BLOB NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS uploads (
            id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL,
            size INTEGER NOT NULL, sha256 TEXT NOT NULL, cave TEXT NOT NULL,
            mural TEXT NOT NULL, source TEXT NOT NULL, note TEXT NOT NULL,
            uploaded_by INTEGER NOT NULL, created_at TEXT NOT NULL,
            storage_name TEXT NOT NULL, parent_id TEXT, confirmed_at TEXT,
            FOREIGN KEY(uploaded_by) REFERENCES users(id),
            FOREIGN KEY(parent_id) REFERENCES uploads(id)
        );
        CREATE TABLE IF NOT EXISTS annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, candidate TEXT NOT NULL,
            x REAL NOT NULL, y REAL NOT NULL, category TEXT NOT NULL, text TEXT NOT NULL,
            reviewer TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS review_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL, candidate TEXT,
            decision TEXT NOT NULL, reviewer TEXT NOT NULL, notes TEXT NOT NULL,
            created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Golden20 Big-LaMa reference'
        );
        CREATE INDEX IF NOT EXISTS idx_annotations_case ON annotations(case_id);
        CREATE INDEX IF NOT EXISTS idx_review_events_case ON review_events(case_id);
        CREATE INDEX IF NOT EXISTS idx_uploads_created ON uploads(created_at);
        """)
        for table, column, definition in (
            ("annotations", "candidate_sha256", "TEXT"),
            ("annotations", "reviewer_user_id", "INTEGER"),
            ("review_events", "candidate_sha256", "TEXT"),
            ("review_events", "reviewer_user_id", "INTEGER"),
            ("uploads", "parent_id", "TEXT"),
            ("uploads", "confirmed_at", "TEXT"),
        ):
            existing = {row["name"] for row in con.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def public_user(row):
    return {"id": row["id"], "displayName": row["display_name"], "email": row["email"]}


def register_user(payload):
    name = str(payload.get("displayName", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = payload.get("password")
    if not 2 <= len(name) <= 80 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 254:
        raise ValueError("请填写姓名和有效邮箱")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ValueError("密码须为 8 至 128 个字符")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 260000)
    now = datetime.now(timezone.utc).isoformat()
    try:
        with DB_LOCK, connection() as con:
            cursor = con.execute(
                "INSERT INTO users(display_name,email,password_salt,password_hash,created_at) VALUES(?,?,?,?,?)",
                (name, email, salt, digest, now),
            )
            row = con.execute("SELECT * FROM users WHERE id=?", (cursor.lastrowid,)).fetchone()
    except sqlite3.IntegrityError:
        raise ValueError("该邮箱已注册") from None
    return public_user(row)


def login_user(payload):
    email = str(payload.get("email", "")).strip().lower()
    password = payload.get("password")
    with connection() as con:
        row = con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not row or not isinstance(password, str):
        raise ValueError("邮箱或密码不正确")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), row["password_salt"], 260000)
    if not hmac.compare_digest(digest, row["password_hash"]):
        raise ValueError("邮箱或密码不正确")
    return public_user(row)


def update_profile(user, payload):
    name = str(payload.get("displayName", "")).strip()
    if not 2 <= len(name) <= 80:
        raise ValueError("显示名称须为 2 至 80 个字符")
    with DB_LOCK, connection() as con:
        con.execute("UPDATE users SET display_name=? WHERE id=?", (name, user["id"]))
        row = con.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    return public_user(row)


def change_password(user, payload):
    current = payload.get("currentPassword")
    replacement = payload.get("newPassword")
    if not isinstance(current, str) or not isinstance(replacement, str) or not 8 <= len(replacement) <= 128:
        raise ValueError("新密码须为 8 至 128 个字符")
    with DB_LOCK, connection() as con:
        row = con.execute("SELECT password_salt,password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
        current_hash = hashlib.pbkdf2_hmac("sha256", current.encode("utf-8"), row["password_salt"], 260000)
        if not hmac.compare_digest(current_hash, row["password_hash"]):
            raise ValueError("当前密码不正确")
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", replacement.encode("utf-8"), salt, 260000)
        con.execute("UPDATE users SET password_salt=?,password_hash=? WHERE id=?", (salt, digest, user["id"]))


def account_activity(user):
    with connection() as con:
        rows = con.execute("""SELECT case_id,candidate,decision,created_at FROM review_events
                              WHERE reviewer_user_id=? ORDER BY id DESC LIMIT 8""", (user["id"],)).fetchall()
    return [dict(row) for row in rows]


def new_session(user_id):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
    with DB_LOCK, connection() as con:
        con.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
                    (token_hash, user_id, int(time.time()) + SESSION_SECONDS))
    return token


def session_token(cookie_header):
    try:
        cookies = SimpleCookie()
        cookies.load(cookie_header or "")
        return cookies["glads_session"].value if "glads_session" in cookies else None
    except Exception:
        return None


def user_from_cookie(cookie_header):
    token = session_token(cookie_header)
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with connection() as con:
        row = con.execute("""SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
                             WHERE sessions.token_hash=? AND sessions.expires_at>?""",
                          (token_hash, int(time.time()))).fetchone()
    return public_user(row) if row else None


def clear_session(cookie_header):
    token = session_token(cookie_header)
    if token:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with DB_LOCK, connection() as con:
            con.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))


def image_type(blob):
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if blob.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if len(blob) >= 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "image/webp", ".webp"
    raise ValueError("请上传 JPG、PNG 或 WebP 图片")


def save_upload(user, fields, filename, blob):
    if not blob or len(blob) > MAX_UPLOAD_BYTES:
        raise ValueError("图片大小须在 20 MB 以内")
    mime, suffix = image_type(blob)
    filename = Path(str(filename or "image").replace("\\", "/")).name[:180]
    values = {key: str(fields.get(key, "")).strip() for key in ("cave", "mural", "source", "note", "parentId")}
    parent_id = values["parentId"] or None
    if parent_id:
        if not UPLOAD_ID.fullmatch(parent_id):
            raise ValueError("关联图片不存在")
        with connection() as con:
            parent = con.execute("SELECT cave,mural,source,parent_id FROM uploads WHERE id=?", (parent_id,)).fetchone()
        if not parent or parent["parent_id"]:
            raise ValueError("关联图片不存在")
        values["cave"], values["mural"] = parent["cave"], parent["mural"]
        if not values["source"]:
            values["source"] = parent["source"]
    if not values["cave"] or not values["mural"] or not values["source"]:
        raise ValueError("请填写洞窟、壁画位置和图像来源")
    if any(len(values[key]) > limit for key, limit in (("cave", 100), ("mural", 100), ("source", 300), ("note", 1000))):
        raise ValueError("素材信息过长")
    asset_id = "upload_" + uuid.uuid4().hex
    storage_name = asset_id + suffix
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    path = UPLOAD_DIR / storage_name
    temporary = UPLOAD_DIR / (storage_name + ".tmp")
    temporary.write_bytes(blob)
    temporary.replace(path)
    now = datetime.now(timezone.utc).isoformat()
    digest = hashlib.sha256(blob).hexdigest()
    try:
        with DB_LOCK, connection() as con:
            con.execute("""INSERT INTO uploads(id,filename,mime,size,sha256,cave,mural,source,note,uploaded_by,created_at,storage_name,parent_id)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (asset_id, filename, mime, len(blob), digest, values["cave"], values["mural"],
                         values["source"], values["note"], user["id"], now, storage_name, parent_id))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return get_upload(asset_id)


def upload_dict(row):
    return {
        "id": row["id"], "filename": row["filename"], "mime": row["mime"], "size": row["size"],
        "sha256": row["sha256"], "cave": row["cave"], "mural": row["mural"], "source": row["source"],
        "note": row["note"], "uploadedAt": row["created_at"], "uploadedBy": row["display_name"],
        "parentId": row["parent_id"], "confirmedAt": row["confirmed_at"],
        "uploadedById": row["uploaded_by"],
        "imageUrl": f"/api/uploads/{row['id']}/image",
    }


def get_upload(asset_id):
    with connection() as con:
        row = con.execute("""SELECT uploads.*, users.display_name FROM uploads JOIN users ON users.id=uploads.uploaded_by
                             WHERE uploads.id=?""", (asset_id,)).fetchone()
    return upload_dict(row) if row else None


def list_uploads(user_id=None):
    with connection() as con:
        rows = con.execute("""SELECT uploads.*, users.display_name FROM uploads JOIN users ON users.id=uploads.uploaded_by
                              WHERE (? IS NULL OR uploads.uploaded_by=?) ORDER BY uploads.created_at DESC""",
                           (user_id, user_id)).fetchall()
    return [upload_dict(row) for row in rows]


def update_upload_metadata(user, asset_id, payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("source"), str) or not isinstance(payload.get("note"), str):
        raise ValueError("请填写图像来源和备注")
    source, note = payload["source"].strip(), payload["note"].strip()
    if not source or len(source) > 300 or len(note) > 1000:
        raise ValueError("来源须为 1 至 300 字，备注不超过 1000 字")
    with DB_LOCK, connection() as con:
        row = con.execute("SELECT uploaded_by FROM uploads WHERE id=?", (asset_id,)).fetchone()
        if not row:
            raise LookupError("素材不存在")
        if row["uploaded_by"] != user["id"]:
            raise PermissionError("仅上传人可以修改素材信息")
        con.execute("UPDATE uploads SET source=?, note=? WHERE id=?", (source, note, asset_id))
    return get_upload(asset_id)


def confirm_upload(user, asset_id, confirmed):
    if not isinstance(confirmed, bool):
        raise ValueError("请指定素材核对状态")
    now = datetime.now(timezone.utc).isoformat() if confirmed else None
    with DB_LOCK, connection() as con:
        row = con.execute("SELECT uploaded_by FROM uploads WHERE id=?", (asset_id,)).fetchone()
        if not row or row["uploaded_by"] != user["id"]:
            raise ValueError("素材不存在或不属于当前账号")
        con.execute("UPDATE uploads SET confirmed_at=? WHERE id=?", (now, asset_id))
    return get_upload(asset_id)


def records(case_id):
    with connection() as con:
        notes = [dict(row) for row in con.execute("SELECT * FROM annotations WHERE case_id=? ORDER BY id", (case_id,))]
        reviews = [dict(row) for row in con.execute("SELECT * FROM review_events WHERE case_id=? ORDER BY id", (case_id,))]
    return {"annotations": notes, "reviews": reviews}


def add_annotation(case_id, payload):
    candidate = payload.get("candidate")
    if not isinstance(candidate, str) or candidate not in CANDIDATES:
        raise ValueError("Choose R3, R7 or R12")
    for key in ("x", "y"):
        value = payload.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
            raise ValueError("Annotation coordinates must be within the image")
    category = str(payload.get("category", "")).strip()
    text = str(payload.get("text", "")).strip()
    reviewer = str(payload.get("reviewer", "")).strip()
    if not category or not text or not reviewer or any(len(v) > 2000 for v in (category, text, reviewer)):
        raise ValueError("Category, note and reviewer are required")
    now = datetime.now(timezone.utc).isoformat()
    with DB_LOCK, connection() as con:
        cursor = con.execute("""INSERT INTO annotations(case_id,candidate,x,y,category,text,reviewer,created_at,candidate_sha256,reviewer_user_id)
                                VALUES(?,?,?,?,?,?,?,?,?,?)""",
                             (case_id, candidate, payload["x"], payload["y"], category, text, reviewer, now,
                              payload.get("_candidate_sha256"), payload.get("_reviewer_user_id")))
        row = con.execute("SELECT * FROM annotations WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


def add_review(case, payload):
    decision = payload.get("decision")
    candidate = payload.get("candidate")
    reviewer = str(payload.get("reviewer", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    if not isinstance(decision, str) or decision not in DECISIONS or not reviewer or not notes or len(reviewer) > 120 or len(notes) > 2000:
        raise ValueError("Decision, reviewer and reason are required")
    if candidate is not None and (not isinstance(candidate, str) or candidate not in CANDIDATES):
        raise ValueError("Unknown candidate")
    if decision == "approve":
        if candidate not in CANDIDATES or not case["variants"][candidate]["image"]:
            raise ValueError("Approval requires an available candidate")
        if case["semanticRisk"] or case["riskReasons"]:
            raise ValueError("Risk cases cannot be approved in this first-stage workflow; defer or reject them")
    now = datetime.now(timezone.utc).isoformat()
    candidate_sha256 = case["variants"].get(candidate, {}).get("sha256") if candidate else None
    with DB_LOCK, connection() as con:
        cursor = con.execute("""INSERT INTO review_events(case_id,candidate,decision,reviewer,notes,created_at,candidate_sha256,reviewer_user_id)
                                VALUES(?,?,?,?,?,?,?,?)""",
                             (case["id"], candidate, decision, reviewer, notes, now,
                              candidate_sha256, payload.get("_reviewer_user_id")))
        row = con.execute("SELECT * FROM review_events WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


class Handler(BaseHTTPRequestHandler):
    catalog: ArchiveCatalog

    def json(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def current_user(self):
        return user_from_cookie(self.headers.get("Cookie"))

    def login_cookie(self, token):
        return f"glads_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_SECONDS}"

    def body(self):
        if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
            raise ValueError("Content-Type must be application/json")
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 10000:
            raise ValueError("Invalid request size")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise ValueError("Expected a JSON object")
        return payload

    def multipart(self):
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("multipart/form-data;"):
            raise ValueError("请选择要上传的图片")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("无效的上传大小") from None
        if not 0 < length <= MAX_UPLOAD_BYTES + 1024 * 1024:
            raise ValueError("图片大小须在 20 MB 以内")
        raw = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode("ascii") + raw
        )
        if not message.is_multipart():
            raise ValueError("无法读取上传内容")
        fields = {}
        filename = None
        blob = None
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            data = part.get_payload(decode=True)
            if name == "file":
                filename = part.get_filename()
                blob = data
            elif name in {"cave", "mural", "source", "note", "parentId"} and data is not None:
                fields[name] = data.decode("utf-8", errors="replace")
        if blob is None:
            raise ValueError("请选择要上传的图片")
        return fields, filename, blob

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.json(200, {"ok": True, "source": "Golden20 Big-LaMa reference", "algorithmAvailable": False, "cases": len(self.catalog.cases)})
        if path == "/api/auth/me":
            return self.json(200, {"user": self.current_user()})
        user = self.current_user()
        if not user:
            return self.json(401, {"error": "请先登录"})
        if path == "/api/auth/activity":
            return self.json(200, {"items": account_activity(user)})
        if path == "/api/uploads":
            return self.json(200, {"items": list_uploads()})
        if path == "/api/my-uploads":
            return self.json(200, {"items": list_uploads(user["id"])})
        upload_match = re.fullmatch(r"/api/uploads/(upload_[0-9a-f]{32})/image", path)
        if upload_match:
            asset_id = upload_match.group(1)
            with connection() as con:
                row = con.execute("SELECT mime,storage_name FROM uploads WHERE id=?", (asset_id,)).fetchone()
            if not row:
                return self.json(404, {"error": "素材不存在"})
            image_path = UPLOAD_DIR / row["storage_name"]
            if image_path.resolve().parent != UPLOAD_DIR.resolve() or not image_path.is_file():
                return self.json(404, {"error": "图像文件不存在"})
            image = image_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", row["mime"])
            self.send_header("Content-Length", str(len(image)))
            self.send_header("Cache-Control", "private, max-age=3600")
            self.end_headers()
            return self.wfile.write(image)
        if path == "/api/cases":
            cases = []
            for case_id in self.catalog.cases:
                case = self.catalog.public_case(case_id)
                history = records(case_id)["reviews"]
                cases.append({**case, "latestReview": history[-1] if history else None})
            return self.json(200, {"items": cases, "total": len(cases)})
        if path == "/api/reviews.csv":
            with connection() as con:
                rows = [dict(row) for row in con.execute("SELECT * FROM review_events ORDER BY id")]
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=["id", "case_id", "candidate", "candidate_sha256", "decision", "reviewer", "reviewer_user_id", "notes", "created_at", "source"])
            writer.writeheader()
            writer.writerows(rows)
            body = output.getvalue().encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="golden20_reviews.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if path == "/api/export.zip":
            with connection() as con:
                reviews = [dict(row) for row in con.execute("SELECT * FROM review_events ORDER BY id")]
                annotations = [dict(row) for row in con.execute("SELECT * FROM annotations ORDER BY id")]
            def as_csv(rows, fields):
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
                return output.getvalue().encode("utf-8-sig")
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("reviews.csv", as_csv(reviews, ["id", "case_id", "candidate", "candidate_sha256", "decision", "reviewer", "reviewer_user_id", "notes", "created_at", "source"]))
                archive.writestr("annotations.csv", as_csv(annotations, ["id", "case_id", "candidate", "candidate_sha256", "x", "y", "category", "text", "reviewer", "reviewer_user_id", "created_at"]))
                archive.writestr("case_index.json", json.dumps([self.catalog.public_case(case_id) for case_id in self.catalog.cases], ensure_ascii=False, indent=2))
                archive.writestr("README.txt", "GLADS Golden20 reference review export. The images remain in the verified GLADS-03 archive. These decisions concern Big-LaMa reference candidates only; they are not student-model acceptance or historical ground truth.\n")
            body = stream.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Disposition", 'attachment; filename="golden20_review_records.zip"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        parts = path.split("/")
        if len(parts) >= 4 and parts[:3] == ["", "api", "cases"] and CASE_ID.fullmatch(parts[3]):
            case_id = parts[3]
            case = self.catalog.public_case(case_id)
            if not case:
                return self.json(404, {"error": "Case not found"})
            if len(parts) == 4:
                return self.json(200, {**case, **records(case_id)})
            if len(parts) == 6 and parts[4] == "images":
                image = self.catalog.image(case_id, parts[5])
                if image is None:
                    return self.json(404, {"error": "Image unavailable"})
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(image)))
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                return self.wfile.write(image)
        self.json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path in {"/api/auth/register", "/api/auth/login"}:
            try:
                payload = self.body()
                user = register_user(payload) if path.endswith("register") else login_user(payload)
                token = new_session(user["id"])
                return self.json(201 if path.endswith("register") else 200, {"user": user}, self.login_cookie(token))
            except (ValueError, json.JSONDecodeError) as error:
                return self.json(400, {"error": str(error)})
        if path == "/api/auth/logout":
            clear_session(self.headers.get("Cookie"))
            return self.json(200, {"ok": True}, "glads_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
        user = self.current_user()
        if not user:
            return self.json(401, {"error": "请先登录"})
        if path in {"/api/auth/profile", "/api/auth/password"}:
            try:
                payload = self.body()
                if path.endswith("profile"):
                    return self.json(200, {"user": update_profile(user, payload)})
                change_password(user, payload)
                return self.json(200, {"ok": True})
            except (ValueError, json.JSONDecodeError) as error:
                return self.json(400, {"error": str(error)})
        if path == "/api/uploads":
            try:
                fields, filename, blob = self.multipart()
                return self.json(201, save_upload(user, fields, filename, blob))
            except ValueError as error:
                return self.json(400, {"error": str(error)})
        metadata_match = re.fullmatch(r"/api/uploads/(upload_[0-9a-f]{32})/metadata", path)
        if metadata_match:
            try:
                return self.json(200, update_upload_metadata(user, metadata_match.group(1), self.body()))
            except PermissionError as error:
                return self.json(403, {"error": str(error)})
            except LookupError as error:
                return self.json(404, {"error": str(error)})
            except (ValueError, json.JSONDecodeError) as error:
                return self.json(400, {"error": str(error)})
        confirmation_match = re.fullmatch(r"/api/uploads/(upload_[0-9a-f]{32})/confirmation", path)
        if confirmation_match:
            try:
                payload = self.body()
                return self.json(200, confirm_upload(user, confirmation_match.group(1), payload.get("confirmed")))
            except (ValueError, json.JSONDecodeError) as error:
                return self.json(400, {"error": str(error)})
        parts = path.split("/")
        if len(parts) != 5 or parts[:3] != ["", "api", "cases"] or not CASE_ID.fullmatch(parts[3]):
            return self.json(404, {"error": "Not found"})
        case = self.catalog.public_case(parts[3])
        if not case:
            return self.json(404, {"error": "Case not found"})
        try:
            payload = self.body()
            payload["reviewer"] = user["displayName"]
            payload["_reviewer_user_id"] = user["id"]
            if parts[4] == "annotations":
                if not case["variants"].get(payload.get("candidate"), {}).get("image"):
                    raise ValueError("Candidate image unavailable")
                payload["_candidate_sha256"] = case["variants"][payload["candidate"]]["sha256"]
                return self.json(201, add_annotation(case["id"], payload))
            if parts[4] == "reviews":
                return self.json(201, add_review(case, payload))
        except (ValueError, json.JSONDecodeError) as error:
            return self.json(400, {"error": str(error)})
        self.json(404, {"error": "Not found"})


def serve(port=8765):
    verify_archive()
    catalog = ArchiveCatalog()
    init_db()
    Handler.catalog = catalog
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Golden20 review API ready: http://127.0.0.1:{port} ({len(catalog.cases)} cases)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    serve(int(os.environ.get("GLADS_API_PORT", "8765")))
