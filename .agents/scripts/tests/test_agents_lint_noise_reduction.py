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


class AgentsLintNoiseReductionTests(unittest.TestCase):
    def setUp(self):
        script_path = Path(".agents/scripts/agents-lint-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        self.lint_docs = load_module("agents_lint_docs_noise_test", script_path)

    def test_inline_code_checkbox_examples_do_not_trigger_warnings(self):
        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "doc.md"
            lines = ["Example markers: `- [X]`, `- [/]`, `- [ ]`."]

            linter = self.lint_docs.DocLinter(fix=False)
            linter.check_checkboxes(file_path, lines)

            self.assertEqual(linter.issues, [])

    def test_state_board_separator_row_is_ignored(self):
        """Test that State Board table separator row is ignored."""
        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "task.md"
            # New format: 4 columns (Task | State | Owner | Notes)
            lines = [
                "## State Board",
                "| Task | State | Owner | Notes |",
                "|------|-------|-------|-------|",
                "| T-01 | done | worker | ok |",
            ]

            linter = self.lint_docs.DocLinter(fix=False)
            linter.check_state_board(file_path, lines)

            self.assertEqual(linter.issues, [])

    def test_tool_doc_doc_type_is_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "tool.md"
            content = """---
doc_type: tool-doc
id: AGENT-999
status: active
created_at: 2026-02-24T00:00:00Z
updated_at: 2026-02-24T00:00:00Z
---

# Tool
"""

            linter = self.lint_docs.DocLinter(fix=False)
            linter.check_frontmatter(file_path, content)

            unknown_doc_type_warnings = [
                issue
                for issue in linter.issues
                if "Unknown doc_type" in issue.message
            ]
            self.assertEqual(unknown_doc_type_warnings, [])


if __name__ == "__main__":
    unittest.main()
