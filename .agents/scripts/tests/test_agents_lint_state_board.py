import importlib.util
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


class AgentsLintStateBoardTests(unittest.TestCase):
    def test_invalid_state_in_table_is_detected(self):
        """Test that invalid state in State Board table is detected."""
        script_path = Path(".agents/scripts/agents-lint-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        lint_docs = load_module("agents_lint_docs_state_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "task.md"
            # New format: 4 columns (Task | State | Owner | Notes)
            lines = [
                "# Tasks",
                "",
                "## State Board",
                "| Task | State | Owner | Notes |",
                "|------|-------|-------|-------|",
                "| T-01 | pendding | worker | typo |",
            ]

            linter = lint_docs.DocLinter(fix=False)
            linter.check_state_board(file_path, lines)

            messages = [issue.message for issue in linter.issues]
            self.assertTrue(any("Unknown state: 'pendding'" in msg for msg in messages))

    def test_valid_state_in_table_is_accepted(self):
        """Test that valid states in State Board table are accepted."""
        script_path = Path(".agents/scripts/agents-lint-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        lint_docs = load_module("agents_lint_docs_state_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "task.md"
            lines = [
                "# Tasks",
                "",
                "## State Board",
                "| Task | State | Owner | Notes |",
                "|------|-------|-------|-------|",
                "| T-01 | done | worker | completed |",
                "| T-02 | in_progress | worker | working |",
                "| T-03 | pending | worker | todo |",
                "| T-04 | blocked | worker | blocked |",
            ]

            linter = lint_docs.DocLinter(fix=False)
            linter.check_state_board(file_path, lines)

            # Should have no issues for valid states
            invalid_state_issues = [i for i in linter.issues if "Unknown state" in i.message]
            self.assertEqual(len(invalid_state_issues), 0)


if __name__ == "__main__":
    unittest.main()

