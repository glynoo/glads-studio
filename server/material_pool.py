"""Persistent collection tools and an optional, read-only imported asset catalog."""
import json
import os
import re
import uuid
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote


def tags(value):
    if not isinstance(value, list) or len(value) > 30 or any(not isinstance(t, str) or not t.strip() or len(t) > 40 for t in value):
        raise ValueError("最多填写 30 个标签，每个标签为 1 至 40 字")
    return list(dict.fromkeys(t.strip() for t in value))


def text(value, maximum, label):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"{label}须为 1 至 {maximum} 字")
    return value.strip()


class PoolStore:
    def __init__(self, connection, lock):
        self.connection, self.lock = connection, lock

    def init(self):
        with self.connection() as con:
            con.executescript("""
            CREATE TABLE IF NOT EXISTS pool_caves (
                name TEXT PRIMARY KEY, period TEXT NOT NULL, note TEXT NOT NULL,
                owner_id INTEGER NOT NULL REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS pool_preferences (
                user_id INTEGER PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL
            );
            """)

    def preferences(self, con, user_id):
        row = con.execute("SELECT value FROM pool_preferences WHERE user_id=?", (user_id,)).fetchone()
        return json.loads(row["value"]) if row else {"favorites": [], "projects": [], "tags": []}

    def state(self, user):
        with self.connection() as con:
            explicit = {r["name"]: dict(r) for r in con.execute("SELECT * FROM pool_caves ORDER BY name")}
            for row in con.execute("SELECT cave, MIN(uploaded_by) AS owner, COUNT(DISTINCT uploaded_by) AS owners FROM uploads GROUP BY cave"):
                explicit.setdefault(row["cave"], {"name": row["cave"], "period": "", "note": "", "owner_id": row["owner"] if row["owners"] == 1 else None})
            return {**self.preferences(con, user["id"]), "caves": [
                {"name": row["name"], "period": row["period"], "note": row["note"], "canEdit": row["owner_id"] == user["id"]}
                for row in sorted(explicit.values(), key=lambda r: r["name"])
            ]}

    def save_cave(self, user, payload):
        name = text(payload.get("name"), 100, "洞窟名称")
        period = text(payload.get("period"), 100, "时代")
        note = payload.get("note", "")
        if not isinstance(note, str) or len(note) > 1000:
            raise ValueError("洞窟备注不超过 1000 字")
        previous = payload.get("previous")
        with self.lock, self.connection() as con:
            if previous:
                text(previous, 100, "原洞窟名称")
                row = con.execute("SELECT owner_id FROM pool_caves WHERE name=?", (previous,)).fetchone()
                owners = {r[0] for r in con.execute("SELECT DISTINCT uploaded_by FROM uploads WHERE cave=?", (previous,))}
                if not row and not owners:
                    raise LookupError("洞窟不存在")
                if (row and row["owner_id"] != user["id"]) or (not row and owners != {user["id"]}):
                    raise PermissionError("仅洞窟创建人可以编辑")
                if name != previous and owners - {user["id"]}:
                    raise PermissionError("洞窟已有其他人的素材，不能更改名称")
            if name != previous and (con.execute("SELECT 1 FROM pool_caves WHERE name=?", (name,)).fetchone() or con.execute("SELECT 1 FROM uploads WHERE cave=?", (name,)).fetchone()):
                raise ValueError("该洞窟已存在")
            if previous:
                con.execute("DELETE FROM pool_caves WHERE name=?", (previous,))
                con.execute("UPDATE uploads SET cave=? WHERE cave=?", (name, previous))
            con.execute("INSERT INTO pool_caves VALUES(?,?,?,?)", (name, period, note.strip(), user["id"]))
        return self.state(user)

    def change_preferences(self, user, payload):
        with self.lock, self.connection() as con:
            state = self.preferences(con, user["id"])
            action = payload.get("action")
            if action in {"favorite", "projectMember"}:
                asset_id = payload.get("assetId")
                if not isinstance(payload.get("enabled"), bool):
                    raise ValueError("请指定选择状态")
                if not isinstance(asset_id, str) or not con.execute("SELECT 1 FROM uploads WHERE id=?", (asset_id,)).fetchone():
                    raise LookupError("素材不存在")
                if action == "favorite":
                    target = state["favorites"]
                else:
                    project = next((p for p in state["projects"] if p["id"] == payload.get("projectId")), None)
                    if not project:
                        raise LookupError("项目不存在")
                    target = project["assetIds"]
                if asset_id in target:
                    target.remove(asset_id)
                if payload["enabled"]:
                    target.append(asset_id)
            elif action == "project":
                name = text(payload.get("name"), 30, "项目名称")
                if len(state["projects"]) >= 50 or any(p["name"] == name for p in state["projects"]):
                    raise ValueError("项目名称重复或已达到 50 个项目上限")
                state["projects"].append({"id": uuid.uuid4().hex, "name": name, "assetIds": []})
            elif action == "tag":
                name = text(payload.get("name"), 40, "标签")
                if name not in state["tags"]:
                    if len(state["tags"]) >= 128:
                        raise ValueError("已达到 128 个自定义标签上限")
                    state["tags"].append(name)
            else:
                raise ValueError("未知素材池操作")
            con.execute("INSERT INTO pool_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value", (user["id"], json.dumps(state, ensure_ascii=False)))
        return self.state(user)

    def delete_asset(self, user, asset_id, directory):
        with self.lock, self.connection() as con:
            row = con.execute("SELECT * FROM uploads WHERE id=?", (asset_id,)).fetchone()
            if not row:
                raise LookupError("素材不存在")
            rows = [row, *con.execute("SELECT * FROM uploads WHERE parent_id=?", (asset_id,)).fetchall()]
            if any(r["uploaded_by"] != user["id"] for r in rows):
                raise PermissionError("仅上传人可以删除；含其他人切片的图片不能删除")
            ids = {r["id"] for r in rows}
            con.execute("DELETE FROM uploads WHERE parent_id=?", (asset_id,))
            con.execute("DELETE FROM uploads WHERE id=?", (asset_id,))
            for pref in con.execute("SELECT * FROM pool_preferences").fetchall():
                state = json.loads(pref["value"])
                state["favorites"] = [i for i in state["favorites"] if i not in ids]
                for project in state["projects"]:
                    project["assetIds"] = [i for i in project["assetIds"] if i not in ids]
                con.execute("UPDATE pool_preferences SET value=? WHERE user_id=?", (json.dumps(state, ensure_ascii=False), pref["user_id"]))
        for row in rows:
            path = (directory / row["storage_name"]).resolve()
            if path.parent == directory.resolve():
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    # Removed database entries already make the files inaccessible.
                    pass
        return {"deleted": list(ids)}


def catalog_root():
    value = os.environ.get("GLADS_MATERIAL_POOL_DIR")
    return Path(value).resolve() if value else None


@lru_cache(maxsize=2)
def load_catalog(path, modified):
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(data.get("items"), dict):
        raise ValueError("资产清单格式不正确")
    return data


def catalog_data():
    root = catalog_root()
    path = root / "catalog.json" if root else None
    if not path or not path.is_file():
        raise LookupError("未连接原版资产目录，请配置 GLADS_MATERIAL_POOL_DIR 指向含 catalog.json 的目录")
    return load_catalog(str(path), path.stat().st_mtime_ns)


def asset_path(item):
    root = catalog_root()
    uri = item.get("uri")
    prefix = "./assets/glads/"
    if not root or not isinstance(uri, str) or not uri.startswith(prefix):
        return None
    path = (root / uri[len(prefix):]).resolve()
    return path if path.is_relative_to(root) and path.is_file() else None


def catalog_page(params):
    data = catalog_data()
    kind = params.get("kind", ["mask"])[0]
    if kind not in {"mask", "model", "evidence"}:
        raise ValueError("未知资产分类")
    query = params.get("query", [""])[0].strip().lower()
    category = params.get("category", [""])[0]
    source = data["items"].get(kind, [])
    result = [item for item in source if (not category or item.get("category") == category) and query in " ".join(str(item.get(key, "")) for key in ("name", "path", "caseId", "sourceImage")).lower()]
    pages = max(1, (len(result) + 23) // 24)
    page = min(pages, max(1, int(params.get("page", ["1"])[0])))
    items = []
    for item in result[(page - 1) * 24:page * 24]:
        url = f"/api/material-pool/file?id={quote(item['id'], safe='')}" if asset_path(item) else None
        items.append({**{k: v for k, v in item.items() if k != "uri"}, "fileUrl": url, "imageUrl": url if re.search(r"\.(png|jpe?g|webp)$", item.get("path", ""), re.I) else None})
    return {"items": items, "total": len(result), "sourceTotal": len(source), "page": page, "pages": pages, "categories": sorted({i.get("category", "") for i in source}), "modelPolicy": data.get("modelPolicy", "")}


def catalog_file(asset_id):
    for group in catalog_data()["items"].values():
        for item in group:
            if item.get("id") == asset_id:
                path = asset_path(item)
                if path:
                    return path
                raise LookupError("该资产仅登记元数据或文件不可用")
    raise LookupError("资产不存在")
