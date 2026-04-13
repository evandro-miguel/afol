import importlib.util
import unittest
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(".agents/scripts/agents-doctor.py").resolve()


class DoctorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doctor = load_module("agents_doctor_tests", SCRIPT_PATH)

    def test_required_folders_list_is_non_empty(self):
        """Doctor must declare required folders to check."""
        self.assertGreater(len(self.doctor.REQUIRED_FOLDERS), 0)

    def test_required_templates_list_is_non_empty(self):
        """Doctor must declare required templates to check."""
        self.assertGreater(len(self.doctor.REQUIRED_TEMPLATES), 0)

    def test_valid_doc_types_includes_plan_and_task(self):
        """Valid doc types must include core types."""
        doc_types = self.doctor.VALID_DOC_TYPES
        self.assertIn("plan", doc_types)
        self.assertIn("task", doc_types)
        self.assertIn("report", doc_types)

    def test_id_pattern_matches_valid_ids(self):
        """ID pattern must match valid workbench IDs."""
        pattern = self.doctor.ID_PATTERN
        self.assertTrue(pattern.match("260404_1555_test_plan_01"))
        self.assertTrue(pattern.match("260223_1825_tools-structure-hardening_task_01"))

    def test_id_pattern_rejects_invalid_ids(self):
        """ID pattern must reject malformed IDs."""
        pattern = self.doctor.ID_PATTERN
        self.assertFalse(pattern.match("invalid_id"))
        self.assertFalse(pattern.match("260404_plan_01"))
        self.assertFalse(pattern.match("260404_1555_test_invalid_01"))

    def test_timestamp_pattern_matches_valid_timestamps(self):
        """Timestamp pattern must match valid ISO 8601 timestamps."""
        pattern = self.doctor.TIMESTAMP_PATTERN
        self.assertTrue(pattern.match("2026-04-04T15:55:00Z"))
        self.assertTrue(pattern.match("2026-04-04T15:55:00-03:00"))
        self.assertTrue(pattern.match("2026-04-04T15:55:00+00:00"))

    def test_timestamp_pattern_rejects_invalid_timestamps(self):
        """Timestamp pattern must reject invalid timestamps."""
        pattern = self.doctor.TIMESTAMP_PATTERN
        self.assertFalse(pattern.match("2026-04-04"))
        self.assertFalse(pattern.match("April 4, 2026"))
        self.assertFalse(pattern.match("2026/04/04T15:55:00Z"))

    def test_issue_class_creation(self):
        """Issue class must store severity, path, and message."""
        issue = self.doctor.Issue("error", "/path/to/file.md", "Test message")
        self.assertEqual(issue.severity, "error")
        self.assertEqual(issue.path, "/path/to/file.md")
        self.assertEqual(issue.message, "Test message")

    def test_tight_checkbox_pattern_detects_missing_space(self):
        """Tight checkbox pattern must detect missing space after bracket."""
        pattern = self.doctor.TIGHT_CHECKBOX_PATTERN
        self.assertTrue(pattern.match("-[x] done"))
        self.assertTrue(pattern.match("  -[ ] pending"))

    def test_missing_sep_pattern_detects_missing_separator(self):
        """Missing separator pattern must detect tight checkboxes."""
        pattern = self.doctor.MISSING_SEP_PATTERN
        # Pattern requires `- [` prefix followed by non-whitespace
        self.assertTrue(pattern.search("- [x]done"))
        self.assertTrue(pattern.search("- [ ]pending"))
        self.assertFalse(pattern.search("- [x] done"))
