import importlib.util
import argparse
import sys
import tempfile
import unittest
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsWbUpdateTaskMarkerTests(unittest.TestCase):
    def test_require_explicit_session_for_write_commands(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_require_session_test", script_path)

        no_scope_args = argparse.Namespace(
            session=None,
            file=None,
            all_wb=False,
            report=None,
        )
        with self.assertRaises(ValueError):
            wb_update.require_explicit_session(no_scope_args, "task")

        explicit_session_args = argparse.Namespace(
            session="260224_1030_scripts-lean-efficiency",
            file=None,
            all_wb=False,
            report=None,
        )
        wb_update.require_explicit_session(explicit_session_args, "task")

        file_scoped_args = argparse.Namespace(
            session=None,
            file=".agents/wb/260224_1030_scripts-lean-efficiency/260224_1030_scripts-lean-efficiency_plan_01.md",
            all_wb=False,
            report=None,
        )
        wb_update.require_explicit_session(file_scoped_args, "touch")

        report_scoped_args = argparse.Namespace(
            session=None,
            file=None,
            all_wb=False,
            report=".agents/wb/260224_1030_scripts-lean-efficiency/260224_1030_scripts-lean-efficiency_report_01.md",
        )
        wb_update.require_explicit_session(report_scoped_args, "files-changed")

    def test_update_task_marker_does_not_break_checkbox_format(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            task_file = Path(td) / "task.md"
            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Tasks\n\n"
                "## Task List\n"
                "- [ ] T-01 Fix auth\n\n"
                "## State Board\n"
                "| Task | Checklist | State | Owner | Notes |\n"
                "|------|----------:|-------|-------|-------|\n"
                "| T-01 | - [ ] | pending | build | note |\n"
            )

            wb_update.update_task_markers(task_file, "T-01", "x", "done")
            content = task_file.read_text()

            self.assertIn("- [x] T-01 Fix auth", content)
            self.assertNotIn("- [ [x] T-01", content)
            self.assertIn("| T-01 | - [x] | done |", content)


if __name__ == "__main__":
    unittest.main()
