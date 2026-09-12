import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from announcement_classifier import classify_announcement
from classification_index import build_classification_index
from classification_taxonomy import ALIASES, CLASSIFICATION_VERSION, MAIN_CATEGORIES


class ClassificationV1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = ROOT / "tests" / "fixtures" / "classification_v1_cases.json"
        cls.items = json.loads(cls.fixture.read_text(encoding="utf-8"))["items"]
        cls.rows = [classify_announcement(item) for item in cls.items]

    def test_fourteen_representative_cases(self):
        expected = [
            ("academic_exam", "midterm"),
            ("academic_exam", "midterm"),
            ("course_selection", "multiple_elective"),
            ("admission", "stars"),
            ("scholarship", "external_scholarship"),
            ("club", "club_transfer"),
            ("academic_exam", "make_up_exam"),
            ("academic_exam", "mock_exam"),
            ("administration", "calendar"),
            ("rules_policy", "school_rule"),
            ("honor_roll", "student_honor"),
            ("administration", "general_notice"),
            ("academic_exam", "exam_schedule_room"),
            ("event_learning", "training"),
        ]
        self.assertEqual(expected, [(row["main_category"], row["sub_category"]) for row in self.rows])
        self.assertEqual("cygsh", self.rows[12]["school"])
        self.assertEqual("fjsh", self.rows[13]["school"])

    def test_audience_alias_year_and_requested_fields(self):
        self.assertIn("grade_1", self.rows[1]["audience"])
        self.assertEqual(115, self.rows[1]["academic_year"])
        self.assertIn("二段", self.rows[12]["matched_aliases"])
        self.assertIn("date", self.rows[6]["requested_fields"])
        self.assertIn("location", self.rows[6]["requested_fields"])

    def test_output_matches_preview_contract(self):
        required = {
            "announcement_id", "title", "school", "main_category", "sub_category", "event_types",
            "audience", "topics", "actions", "requested_fields", "available_fields", "academic_year",
            "semester", "dates", "department", "location", "reference_value",
            "classification_confidence", "classification_sources", "classification_version",
            "classification_source_hash", "matched_aliases", "unresolved_terms",
        }
        for row in self.rows:
            self.assertEqual(required, set(row))
            self.assertEqual(CLASSIFICATION_VERSION, row["classification_version"])
            self.assertIn(row["main_category"], MAIN_CATEGORIES)
            self.assertEqual(64, len(row["classification_source_hash"]))
            self.assertNotIn("classification_override", row)

    def test_source_hash_is_deterministic(self):
        self.assertEqual(
            classify_announcement(self.items[0])["classification_source_hash"],
            classify_announcement(self.items[0])["classification_source_hash"],
        )

    def test_known_existing_category_has_priority(self):
        row = classify_announcement({
            "id": "priority-1", "school": "cysh", "category": "社團", "title": "講座報名資訊",
        })
        self.assertEqual(("club", "club_notice"), (row["main_category"], row["sub_category"]))
        self.assertEqual("existing_category", row["classification_sources"][0])

    def test_unknown_terms_do_not_mutate_alias_dictionary(self):
        before = dict(ALIASES)
        row = classify_announcement({"id": "unknown-1", "school": "cysh", "title": "XYZQ新制說明", "unresolved_terms": ["XYZQ"]})
        self.assertEqual(before, ALIASES)
        self.assertEqual(["XYZQ"], row["unresolved_terms"])

    def test_index_contains_only_contract_fields(self):
        entries = build_classification_index(self.rows[1])
        self.assertTrue(any(row["dimension"] == "school" and row["token"] == "cysh" for row in entries))
        self.assertTrue(any(row["dimension"] == "audience" and row["token"] == "grade_1" for row in entries))
        self.assertTrue(any(row["dimension"] == "academic_year" and row["token"] == "115" for row in entries))
        for entry in entries:
            self.assertEqual({"dimension", "token", "announcement_id", "classification_version"}, set(entry))

    def test_backfill_cli_defaults_to_dry_run(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "backfill_announcement_classifications.py"), str(self.fixture), "--batch-size", "5"],
            cwd=ROOT, check=True, capture_output=True, text=True,
        )
        summary = json.loads(result.stdout)
        self.assertEqual("DRY_RUN", summary["mode"])
        self.assertEqual(14, summary["record_count"])
        self.assertEqual(3, summary["batch_count"])

    def test_migration_preserves_manual_override_columns(self):
        migration = (ROOT / "supabase" / "migrations" / "20260912061752_announcement_classification_v1_recovery.sql").read_text(encoding="utf-8")
        update_clause = migration.split("on conflict(announcement_id) do update set", 1)[1].split("get diagnostics", 1)[0]
        self.assertNotIn("classification_override=", update_clause)
        self.assertNotIn("override_by=", update_clause)
        self.assertNotIn("override_at=", update_clause)
        self.assertIn("security definer", migration.lower())
        self.assertIn("public.is_app_admin()", migration)


if __name__ == "__main__":
    unittest.main()
