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
        script_path = Path(".agents/scripts/agents-lint-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        lint_docs = load_module("agents_lint_docs_state_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "task.md"
            lines = [
                "# Tasks",
                "",
                "## State Board",
                "| Task | Checklist | State | Owner | Notes |",
                "|------|----------:|-------|-------|-------|",
                "| T-01 | - [ ] | pendding | build | typo |",
            ]

            linter = lint_docs.DocLinter(fix=False)
            linter.check_state_board(file_path, lines)

            messages = [issue.message for issue in linter.issues]
            self.assertTrue(any("Unknown state: 'pendding'" in msg for msg in messages))


if __name__ == "__main__":
    unittest.main()

