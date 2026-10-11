import tempfile
import sqlite3
import hashlib
import unittest
from pathlib import Path
import app


class ReviewApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = app.ArchiveCatalog()

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.previous_database = app.DATABASE
        self.previous_upload_dir = app.UPLOAD_DIR
        app.DATABASE = Path(self.folder.name) / "reviews.sqlite3"
        app.UPLOAD_DIR = Path(self.folder.name) / "uploads"
        app.init_db()

    def tearDown(self):
        app.DATABASE = self.previous_database
        app.UPLOAD_DIR = self.previous_upload_dir
        self.folder.cleanup()

    def test_registration_login_session_and_logout(self):
        user = app.register_user({"displayName": "复核员甲", "email": "A@example.com", "password": "correct-horse-123"})
        self.assertEqual(user["email"], "a@example.com")
        self.assertNotIn("password", user)
        with self.assertRaises(ValueError):
            app.register_user({"displayName": "复核员乙", "email": "a@example.com", "password": "another-pass-123"})
        with self.assertRaises(ValueError):
            app.login_user({"email": "a@example.com", "password": "wrong-pass"})
        self.assertEqual(app.login_user({"email": "a@example.com", "password": "correct-horse-123"})["id"], user["id"])
        token = app.new_session(user["id"])
        cookie = f"glads_session={token}"
        self.assertEqual(app.user_from_cookie(cookie)["displayName"], "复核员甲")
        app.clear_session(cookie)
        self.assertIsNone(app.user_from_cookie(cookie))

    def test_connection_closes_and_rolls_back_failed_transaction(self):
        with self.assertRaises(RuntimeError):
            with app.connection() as con:
                con.execute("INSERT INTO users(display_name,email,password_salt,password_hash,created_at) VALUES(?,?,?,?,?)", ("回滚", "rollback@example.com", b"salt", b"hash", "now"))
                raise RuntimeError("Abort transaction")
        with self.assertRaises(sqlite3.ProgrammingError):
            con.execute("SELECT 1")
        with app.connection() as fresh:
            self.assertEqual(fresh.execute("SELECT COUNT(*) FROM users").fetchone()[0], 0)

    def test_upload_keeps_source_and_validates_file(self):
        user = app.register_user({"displayName": "资料员", "email": "asset@example.com", "password": "upload-pass-123"})
        image = self.catalog.image("case_0001", "original")
        fields = {"cave": "第 17 窟", "mural": "西壁", "source": "项目采集", "note": "局部图像"}
        item = app.save_upload(user, fields, "mural.png", image)
        self.assertEqual(item["cave"], "第 17 窟")
        self.assertEqual(item["uploadedBy"], "资料员")
        self.assertEqual(item["mime"], "image/png")
        self.assertIsNone(item["confirmedAt"])
        self.assertEqual(app.list_uploads()[0]["id"], item["id"])
        self.assertEqual([entry["id"] for entry in app.list_uploads(user["id"])], [item["id"]])
        self.assertEqual((app.UPLOAD_DIR / (item["id"] + ".png")).read_bytes(), image)
        slice_item = app.save_upload(user, {"parentId": item["id"], "note": "切片"}, "slice.png", image)
        self.assertEqual(slice_item["parentId"], item["id"])
        self.assertEqual(slice_item["cave"], item["cave"])
        self.assertEqual(len(app.list_uploads(user["id"])), 2)
        other = app.register_user({"displayName": "其他账号", "email": "other@example.com", "password": "other-pass-123"})
        self.assertEqual(app.list_uploads(other["id"]), [])
        with self.assertRaises(ValueError):
            app.confirm_upload(other, item["id"], True)
        confirmed = app.confirm_upload(user, item["id"], True)
        self.assertIsNotNone(confirmed["confirmedAt"])
        self.assertIsNone(app.confirm_upload(user, item["id"], False)["confirmedAt"])
        with self.assertRaises(ValueError):
            app.save_upload(user, {"parentId": slice_item["id"]}, "nested.png", image)
        with self.assertRaises(ValueError):
            app.save_upload(user, fields, "bad.png", b"not an image")
        with self.assertRaises(ValueError):
            app.save_upload(user, {**fields, "source": ""}, "mural.png", image)

    def test_upload_metadata_is_persisted_without_changing_image(self):
        user = app.register_user({"displayName": "资料员", "email": "notes@example.com", "password": "upload-pass-123"})
        image = self.catalog.image("case_0001", "original")
        item = app.save_upload(user, {"cave": "第 103 窟", "mural": "西壁", "source": "原始来源"}, "mural.png", image)
        updated = app.update_upload_metadata(user, item["id"], {"source": "  采集档案  ", "note": "  第一行\n第二行  "})
        reread = app.list_uploads()[0]
        self.assertEqual(reread["note"], "第一行\n第二行")
        self.assertEqual(reread["source"], "采集档案")
        self.assertEqual(reread["uploadedById"], user["id"])
        self.assertEqual(updated["sha256"], item["sha256"])
        self.assertEqual((app.UPLOAD_DIR / (item["id"] + ".png")).read_bytes(), image)
        self.assertEqual(app.update_upload_metadata(user, item["id"], {"source": "采集档案", "note": ""})["note"], "")

    def test_upload_metadata_checks_owner_and_invalid_fields(self):
        owner = app.register_user({"displayName": "上传人", "email": "owner@example.com", "password": "upload-pass-123"})
        other = app.register_user({"displayName": "其他成员", "email": "reader@example.com", "password": "upload-pass-123"})
        item = app.save_upload(owner, {"cave": "第 103 窟", "mural": "西壁", "source": "原始来源", "note": "保留"}, "mural.png", self.catalog.image("case_0001", "original"))
        with self.assertRaises(PermissionError):
            app.update_upload_metadata(other, item["id"], {"source": "修改来源", "note": "覆盖"})
        with self.assertRaises(LookupError):
            app.update_upload_metadata(owner, "upload_" + "0" * 32, {"source": "修改来源", "note": ""})
        for payload in (None, {}, {"source": " ", "note": ""}, {"source": "a" * 301, "note": ""}, {"source": "来源", "note": "a" * 1001}, {"source": "来源", "note": 123}):
            with self.assertRaises(ValueError):
                app.update_upload_metadata(owner, item["id"], payload)
        self.assertEqual(app.get_upload(item["id"])["note"], "保留")

    def test_account_profile_and_password_change(self):
        user = app.register_user({"displayName": "原名称", "email": "profile@example.com", "password": "original-pass-123"})
        updated = app.update_profile(user, {"displayName": "新名称"})
        self.assertEqual(updated["displayName"], "新名称")
        with self.assertRaises(ValueError):
            app.change_password(user, {"currentPassword": "incorrect", "newPassword": "changed-pass-123"})
        app.change_password(user, {"currentPassword": "original-pass-123", "newPassword": "changed-pass-123"})
        self.assertEqual(app.login_user({"email": user["email"], "password": "changed-pass-123"})["id"], user["id"])

    def test_catalog_has_real_cases_and_marks_missing_images(self):
        self.assertEqual(len(self.catalog.cases), 20)
        self.assertEqual(self.catalog.public_case("case_0001")["originalSha256"], hashlib.sha256(self.catalog.image("case_0001", "original")).hexdigest())
        self.assertIsNotNone(self.catalog.public_case("case_0001")["variants"]["R3"]["image"])
        self.assertIsNone(self.catalog.public_case("case_0006")["variants"]["R12"]["image"])
        self.assertIsNone(self.catalog.public_case("case_0009")["variants"]["R12"]["image"])
        self.assertIsNone(self.catalog.image("case_0006", "R12"))
        self.assertGreater(len(self.catalog.image("case_0001", "exact_mask")), 100)

    def test_annotations_and_reviews_persist_and_append(self):
        note = app.add_annotation("case_0001", {"candidate": "R3", "x": .2, "y": .4, "category": "边缘衔接", "text": "检查线条", "reviewer": "student_1"})
        self.assertEqual(note["candidate"], "R3")
        case = self.catalog.public_case("case_0001")
        first = app.add_review(case, {"candidate": "R3", "decision": "approve", "reviewer": "student_1", "notes": "已对照原图和掩码"})
        self.assertEqual(first["candidate_sha256"], case["variants"]["R3"]["sha256"])
        second = app.add_review(case, {"candidate": "R7", "decision": "reject", "reviewer": "student_1", "notes": "纹样延续不合理"})
        result = app.records("case_0001")
        self.assertEqual([row["id"] for row in result["reviews"]], [first["id"], second["id"]])
        self.assertEqual(len(result["annotations"]), 1)

    def test_rejects_missing_candidate_and_risky_approval(self):
        with self.assertRaises(ValueError):
            app.add_review(self.catalog.public_case("case_0006"), {"candidate": "R12", "decision": "approve", "reviewer": "student", "notes": "test"})
        with self.assertRaises(ValueError):
            app.add_review(self.catalog.public_case("case_0004"), {"candidate": "R3", "decision": "approve", "reviewer": "student", "notes": "test"})
        with self.assertRaises(ValueError):
            app.add_annotation("case_0001", {"candidate": "R3", "x": 1.2, "y": .4, "category": "test", "text": "test", "reviewer": "student"})
        self.assertEqual(app.records("case_0006")["reviews"], [])


if __name__ == "__main__":
    unittest.main()
