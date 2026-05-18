import importlib.util
import sys
import tempfile
import unittest
import types
from unittest import mock
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ensure_yaml_module():
    try:
        import yaml  # noqa: F401
        return
    except ImportError:
        pass

    def safe_load(text: str):
        lines = text.splitlines()
        prefixes = []
        in_lint = False
        in_prefixes = False
        for raw in lines:
            line = raw.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            indent = len(line) - len(line.lstrip(" "))
            if stripped == "lint:":
                in_lint = True
                in_prefixes = False
                continue
            if in_lint and stripped == "excluded_path_prefixes:":
                in_prefixes = True
                continue
            if in_prefixes:
                if indent <= 2 and not stripped.startswith("- "):
                    break
                if stripped.startswith("- "):
                    prefixes.append(stripped[2:].strip())
        return {"lint": {"excluded_path_prefixes": prefixes}}

    yaml_stub = types.ModuleType("yaml")
    yaml_stub.safe_load = safe_load
    sys.modules["yaml"] = yaml_stub


class AgentsLintNoiseReductionTests(unittest.TestCase):
    def setUp(self):
        ensure_yaml_module()
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

    def test_tmp_folders_are_excluded_from_lint_scope(self):
        with tempfile.TemporaryDirectory() as td:
            repo_root = Path(td)
            agents_dir = repo_root / ".agents"
            tmp_file = agents_dir / "tmp" / "imported" / "README.md"
            tmp_file.parent.mkdir(parents=True, exist_ok=True)
            tmp_file.write_text("# imported\n", encoding="utf-8")

            with (
                mock.patch.object(self.lint_docs, "AGENTS_DIR", agents_dir),
                mock.patch.object(self.lint_docs, "EXCLUDED_PATH_PREFIXES", (".agents/tmp/", "tmp/")),
            ):
                linter = self.lint_docs.DocLinter(fix=False)
                self.assertTrue(linter.should_skip_file(tmp_file))

    def test_uv_cache_folders_are_excluded_from_lint_scope(self):
        with tempfile.TemporaryDirectory() as td:
            repo_root = Path(td)
            agents_dir = repo_root / ".agents"
            uv_cache_file = agents_dir / "cache" / "uv" / "artifacts" / "README.md"
            uv_cache_file.parent.mkdir(parents=True, exist_ok=True)
            uv_cache_file.write_text("# cached\n", encoding="utf-8")

            with mock.patch.object(self.lint_docs, "AGENTS_DIR", agents_dir):
                linter = self.lint_docs.DocLinter(fix=False)
                self.assertIn(".agents/cache/uv/", self.lint_docs.EXCLUDED_PATH_PREFIXES)
                self.assertTrue(linter.should_skip_file(uv_cache_file))


if __name__ == "__main__":
    unittest.main()
