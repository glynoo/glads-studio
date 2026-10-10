import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app
import material_pool


class PoolTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.previous = app.DATABASE, app.UPLOAD_DIR
        app.DATABASE = Path(self.folder.name) / "pool.sqlite3"
        app.UPLOAD_DIR = Path(self.folder.name) / "uploads"
        app.init_db()
        self.owner = app.register_user({"displayName": "Owner", "email": "pool@example.com", "password": "pool-password"})
        self.other = app.register_user({"displayName": "Other", "email": "other@example.com", "password": "pool-password"})

    def tearDown(self):
        app.DATABASE, app.UPLOAD_DIR = self.previous
        self.folder.cleanup()

    def upload(self, user=None, **fields):
        return app.save_upload(user or self.owner, {"cave": "第 285 窟", "mural": "西壁", "source": "采集", **fields}, "mural.png", b"\x89PNG\r\n\x1a\nimage-data")

    def test_empty_cave_persists_and_rename_moves_images_and_slices(self):
        app.POOL.save_cave(self.owner, {"name": "第 285 窟", "period": "北魏", "note": "原备注"})
        self.assertEqual(len(app.POOL.state(self.owner)["caves"]), 1)
        root = self.upload()
        child = self.upload(parentId=root["id"])
        state = app.POOL.save_cave(self.owner, {"previous": "第 285 窟", "name": "第 286 窟", "period": "隋", "note": "更正"})
        self.assertEqual(state["caves"][0]["period"], "隋")
        self.assertEqual(app.get_upload(root["id"])["cave"], "第 286 窟")
        self.assertEqual(app.get_upload(child["id"])["cave"], "第 286 窟")
        with self.assertRaises(PermissionError):
            app.POOL.save_cave(self.other, {"previous": "第 286 窟", "name": "其他", "period": "隋"})
        with self.assertRaises(ValueError):
            app.POOL.save_cave(self.owner, {"name": "第 286 窟", "period": "隋"})

    def test_cave_cannot_rename_other_peoples_images(self):
        app.POOL.save_cave(self.owner, {"name": "第 285 窟", "period": "北魏"})
        root = self.upload(self.other)
        with self.assertRaises(PermissionError):
            app.POOL.save_cave(self.owner, {"previous": "第 285 窟", "name": "第 1 窟", "period": "唐"})
        self.assertEqual(app.get_upload(root["id"])["cave"], "第 285 窟")

    def test_tags_category_validation_and_atomic_metadata_update(self):
        root = self.upload(tags=json.dumps(["飞天", "飞天"]), category="clean")
        self.assertEqual(root["tags"], ["飞天"])
        self.assertEqual(root["category"], "clean")
        with self.assertRaises(ValueError):
            app.update_upload_metadata(self.owner, root["id"], {"source": "更改", "note": "", "tags": [""]})
        self.assertEqual(app.get_upload(root["id"])["source"], "采集")
        with self.assertRaises(ValueError):
            app.update_upload_metadata(self.owner, root["id"], {"source": "更改", "note": "", "category": {}})
        with self.assertRaises(PermissionError):
            app.update_upload_metadata(self.other, root["id"], {"source": "更改", "note": "", "tags": ["壁画"]})
        updated = app.update_upload_metadata(self.owner, root["id"], {"source": "更改", "note": "记录", "tags": ["壁画"], "category": "validation"})
        self.assertEqual(updated["tags"], ["壁画"])
        self.assertEqual(updated["category"], "validation")

    def test_favorites_projects_tags_persist_and_are_private(self):
        root = self.upload()
        app.POOL.change_preferences(self.owner, {"action": "favorite", "assetId": root["id"], "enabled": True})
        state = app.POOL.change_preferences(self.owner, {"action": "project", "name": "飞天专题"})
        project = state["projects"][0]
        app.POOL.change_preferences(self.owner, {"action": "projectMember", "projectId": project["id"], "assetId": root["id"], "enabled": True})
        app.POOL.change_preferences(self.owner, {"action": "tag", "name": "飞天"})
        state = app.POOL.state(self.owner)
        self.assertEqual(state["favorites"], [root["id"]])
        self.assertEqual(state["projects"][0]["assetIds"], [root["id"]])
        self.assertEqual(state["tags"], ["飞天"])
        self.assertFalse(app.POOL.state(self.other)["favorites"])
        with self.assertRaises(LookupError):
            app.POOL.change_preferences(self.other, {"action": "projectMember", "projectId": project["id"], "assetId": root["id"], "enabled": True})
        app.POOL.change_preferences(self.owner, {"action": "favorite", "assetId": root["id"], "enabled": False})
        self.assertFalse(app.POOL.state(self.owner)["favorites"])

    def test_delete_cascades_and_cleans_other_users_favorites(self):
        root = self.upload()
        child = self.upload(parentId=root["id"])
        state = app.POOL.change_preferences(self.other, {"action": "project", "name": "收藏集"})
        app.POOL.change_preferences(self.other, {"action": "favorite", "assetId": child["id"], "enabled": True})
        app.POOL.change_preferences(self.other, {"action": "projectMember", "projectId": state["projects"][0]["id"], "assetId": root["id"], "enabled": True})
        with self.assertRaises(PermissionError):
            app.POOL.delete_asset(self.other, root["id"], app.UPLOAD_DIR)
        result = app.POOL.delete_asset(self.owner, root["id"], app.UPLOAD_DIR)
        self.assertEqual(set(result["deleted"]), {root["id"], child["id"]})
        self.assertFalse(app.list_uploads())
        self.assertFalse(list(app.UPLOAD_DIR.iterdir()))
        state = app.POOL.state(self.other)
        self.assertFalse(state["favorites"])
        self.assertFalse(state["projects"][0]["assetIds"])

    def test_delete_does_not_remove_someone_elses_slice(self):
        root = self.upload()
        child = self.upload(self.other, parentId=root["id"])
        with self.assertRaises(PermissionError):
            app.POOL.delete_asset(self.owner, root["id"], app.UPLOAD_DIR)
        self.assertIsNotNone(app.get_upload(child["id"]))

    def test_existing_database_migration_preserves_uploads(self):
        root = self.upload()
        app.init_db()
        self.assertEqual(app.get_upload(root["id"])["id"], root["id"])
        self.assertEqual(app.get_upload(root["id"])["category"], "original")

    def test_catalog_pagination_file_access_and_path_containment(self):
        root = Path(self.folder.name) / "catalog"
        root.mkdir()
        (root / "image.png").write_bytes(b"image")
        (root.parent / "outside.png").write_bytes(b"outside")
        items = [{"id": str(i), "name": f"asset-{i}", "category": "掩码", "path": "image.png", "uri": "./assets/glads/image.png"} for i in range(25)]
        items.append({"id": "escape", "name": "escape", "category": "掩码", "path": "../outside.png", "uri": "./assets/glads/../outside.png"})
        (root / "catalog.json").write_text(json.dumps({"items": {"mask": items, "model": [{"id": "model", "name": "weights", "uri": None}]}}), encoding="utf-8")
        with patch.dict(os.environ, {"GLADS_MATERIAL_POOL_DIR": str(root)}):
            result = material_pool.catalog_page({"page": ["2"]})
            self.assertEqual(result["total"], 26)
            self.assertEqual(len(result["items"]), 2)
            self.assertIsNone(result["items"][-1]["fileUrl"])
            self.assertEqual(material_pool.catalog_file("0").read_bytes(), b"image")
            with self.assertRaises(LookupError):
                material_pool.catalog_file("escape")
            with self.assertRaises(LookupError):
                material_pool.catalog_file("model")
            result = material_pool.catalog_page({"query": ["asset-24"], "page": ["99"]})
            self.assertEqual(result["page"], 1)
            self.assertEqual(result["total"], 1)
