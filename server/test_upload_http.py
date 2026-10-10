import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from pathlib import Path

import app


class UploadHttpTest(unittest.TestCase):
    def test_upload_edit_round_trip_and_http_permissions(self):
        previous_database, previous_upload_dir = app.DATABASE, app.UPLOAD_DIR
        previous_catalog = getattr(app.Handler, "catalog", None)
        with tempfile.TemporaryDirectory() as folder:
            app.DATABASE = Path(folder) / "http.sqlite3"
            app.UPLOAD_DIR = Path(folder) / "uploads"
            app.Handler.catalog = app.ArchiveCatalog()
            app.init_db()
            server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            owner = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

            def request(client, path, data=None, content_type="application/json"):
                if data is not None and not isinstance(data, bytes):
                    data = json.dumps(data).encode()
                req = urllib.request.Request(base + path, data=data, headers={"Content-Type": content_type})
                try:
                    response = client.open(req, timeout=5)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    return response.status, json.loads(response.read())

            try:
                status, _ = request(owner, "/api/auth/register", {"displayName": "上传人", "email": "owner@example.com", "password": "material-pool-123"})
                self.assertEqual(status, 201)
                image = app.Handler.catalog.image("case_0001", "original")
                boundary = "GLADS-test-boundary"
                body = b""
                for name, value in {"cave": "第 103 窟", "mural": "西壁", "source": "原始来源", "note": "原始备注"}.items():
                    body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
                body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="mural.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + image + f'\r\n--{boundary}--\r\n'.encode()
                status, asset = request(owner, "/api/uploads", body, f"multipart/form-data; boundary={boundary}")
                self.assertEqual(status, 201)
                path = f"/api/uploads/{asset['id']}/metadata"
                payload = {"source": "更正来源", "note": "修改后备注\n第二行"}
                self.assertEqual(request(owner, path, payload)[0], 200)
                self.assertEqual(request(owner, "/api/uploads")[1]["items"][0]["note"], payload["note"])
                self.assertEqual(request(owner, path, {"source": " ", "note": ""})[0], 400)
                self.assertEqual(request(owner, "/api/uploads/upload_" + "0" * 32 + "/metadata", payload)[0], 404)
                self.assertEqual(request(other, path, payload)[0], 401)
                request(other, "/api/auth/register", {"displayName": "其他人", "email": "other@example.com", "password": "material-pool-123"})
                self.assertEqual(request(other, path, payload)[0], 403)
                self.assertEqual(request(owner, "/api/uploads")[1]["items"][0]["note"], payload["note"])
                status, state = request(owner, "/api/material-pool/caves", {"name": "第 285 窟", "period": "北魏", "note": "采集记录"})
                self.assertEqual(status, 200)
                self.assertTrue(any(c["name"] == "第 285 窟" for c in state["caves"]))
                self.assertEqual(request(other, "/api/material-pool/caves", {"previous": "第 285 窟", "name": "第 286 窟", "period": "唐"})[0], 403)
                preferences = "/api/material-pool/preferences"
                self.assertEqual(request(owner, preferences, {"action": "favorite", "assetId": asset["id"], "enabled": True})[0], 200)
                self.assertEqual(request(owner, "/api/material-pool")[1]["favorites"], [asset["id"]])
                self.assertFalse(request(other, "/api/material-pool")[1]["favorites"])
                status, state = request(owner, preferences, {"action": "project", "name": "飞天"})
                self.assertEqual(status, 200)
                project_id = state["projects"][0]["id"]
                self.assertEqual(request(owner, preferences, {"action": "projectMember", "projectId": project_id, "assetId": asset["id"], "enabled": True})[0], 200)
                self.assertEqual(request(owner, "/api/material-pool")[1]["projects"][0]["assetIds"], [asset["id"]])
                self.assertEqual(request(owner, path, {**payload, "tags": ["飞天"], "category": "clean"})[0], 200)
                self.assertEqual(request(owner, "/api/uploads")[1]["items"][0]["tags"], ["飞天"])
                self.assertEqual(request(owner, path, {**payload, "category": {}})[0], 400)
                deletion = f"/api/uploads/{asset['id']}/delete"
                self.assertEqual(request(other, deletion, {"confirmed": True})[0], 403)
                self.assertEqual(request(owner, deletion, {"confirmed": False})[0], 400)
                self.assertEqual(request(owner, deletion, {"confirmed": True})[0], 200)
                self.assertFalse(request(owner, "/api/uploads")[1]["items"])
                self.assertFalse(request(owner, "/api/material-pool")[1]["favorites"])
                catalog_dir = Path(folder) / "catalog"
                catalog_dir.mkdir()
                (catalog_dir / "test.png").write_bytes(image)
                (catalog_dir / "catalog.json").write_text(json.dumps({"items": {"mask": [{"id": "test", "name": "test.png", "path": "test.png", "uri": "./assets/glads/test.png", "category": "测试掩码"}], "model": [], "evidence": []}}), encoding="utf-8")
                with patch.dict(os.environ, {"GLADS_MATERIAL_POOL_DIR": str(catalog_dir)}):
                    status, data = request(owner, "/api/material-pool/catalog?kind=mask")
                    self.assertEqual(status, 200)
                    self.assertEqual(data["total"], 1)
                    with owner.open(base + data["items"][0]["fileUrl"], timeout=5) as response:
                        self.assertEqual(response.read(), image)
                    self.assertEqual(request(owner, "/api/material-pool/catalog?kind=unknown")[0], 400)
                    self.assertEqual(request(owner, "/api/material-pool/file?id=missing")[0], 404)
                    self.assertEqual(request(urllib.request.build_opener(), "/api/material-pool/catalog?kind=mask")[0], 401)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                app.DATABASE, app.UPLOAD_DIR = previous_database, previous_upload_dir
                app.Handler.catalog = previous_catalog
