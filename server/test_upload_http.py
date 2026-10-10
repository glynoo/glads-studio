import http.cookiejar
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
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
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                app.DATABASE, app.UPLOAD_DIR = previous_database, previous_upload_dir
                app.Handler.catalog = previous_catalog
