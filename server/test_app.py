import tempfile
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
        app.DATABASE = Path(self.folder.name) / "reviews.sqlite3"
        app.init_db()

    def tearDown(self):
        app.DATABASE = self.previous_database
        self.folder.cleanup()

    def test_catalog_has_real_cases_and_marks_missing_images(self):
        self.assertEqual(len(self.catalog.cases), 20)
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
