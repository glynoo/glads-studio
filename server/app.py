"""Local Golden20 review API. Reads the verified reference archive; never runs algorithms."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import threading
import zipfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(os.environ.get("GLADS_GOLDEN20_ZIP", ROOT / "GLADS_v1.0交付包" / "GLADS-03-Golden20-Reference-v1.0_20260810.zip"))
DATABASE = Path(os.environ.get("GLADS_REVIEW_DB", APP_ROOT / "data" / "reviews.sqlite3"))
ZIP_PREFIX = "GLADS-Student-Release/"
MANIFEST = ZIP_PREFIX + "reference_baseline/golden20/lama_rescue_manifest.jsonl"
ARCHIVE_SHA256 = "d12309225db879b3147d4e51186eedd4379ef3357a8d9605fde36fe9d3467890"
DECISIONS = {"approve", "reject", "secondary_repair_required", "defer_expert"}
CANDIDATES = {"R3": 3, "R7": 7, "R12": 12}
CASE_ID = re.compile(r"^case_(\d{4})$")
DB_LOCK = threading.Lock()


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

    def public_case(self, case_id):
        case = self.cases.get(case_id)
        return {k: v for k, v in case.items() if not k.startswith("_")} if case else None

    def image(self, case_id, image_id):
        case = self.cases.get(case_id)
        if not case or image_id not in case["_images"]:
            return None
        with zipfile.ZipFile(self.path) as archive:
            return archive.read(case["_images"][image_id])


def connection():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATABASE)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    with connection() as con:
        con.executescript("""
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
        """)


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
        cursor = con.execute("INSERT INTO annotations(case_id,candidate,x,y,category,text,reviewer,created_at) VALUES(?,?,?,?,?,?,?,?)",
                             (case_id, candidate, payload["x"], payload["y"], category, text, reviewer, now))
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
    with DB_LOCK, connection() as con:
        cursor = con.execute("INSERT INTO review_events(case_id,candidate,decision,reviewer,notes,created_at) VALUES(?,?,?,?,?,?)",
                             (case["id"], candidate, decision, reviewer, notes, now))
        row = con.execute("SELECT * FROM review_events WHERE id=?", (cursor.lastrowid,)).fetchone()
    return dict(row)


class Handler(BaseHTTPRequestHandler):
    catalog: ArchiveCatalog

    def json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

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

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.json(200, {"ok": True, "source": "Golden20 Big-LaMa reference", "algorithmAvailable": False, "cases": len(self.catalog.cases)})
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
            writer = csv.DictWriter(output, fieldnames=["id", "case_id", "candidate", "decision", "reviewer", "notes", "created_at", "source"])
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
                archive.writestr("reviews.csv", as_csv(reviews, ["id", "case_id", "candidate", "decision", "reviewer", "notes", "created_at", "source"]))
                archive.writestr("annotations.csv", as_csv(annotations, ["id", "case_id", "candidate", "x", "y", "category", "text", "reviewer", "created_at"]))
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
        parts = path.split("/")
        if len(parts) != 5 or parts[:3] != ["", "api", "cases"] or not CASE_ID.fullmatch(parts[3]):
            return self.json(404, {"error": "Not found"})
        case = self.catalog.public_case(parts[3])
        if not case:
            return self.json(404, {"error": "Case not found"})
        try:
            payload = self.body()
            if parts[4] == "annotations":
                if not case["variants"].get(payload.get("candidate"), {}).get("image"):
                    raise ValueError("Candidate image unavailable")
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
