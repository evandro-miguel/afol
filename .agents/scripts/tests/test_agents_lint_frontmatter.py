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


class AgentsLintFrontmatterTests(unittest.TestCase):
    def test_frontmatter_with_triple_dash_in_scalar_is_valid(self):
        script_path = Path(__file__).resolve().parent.parent / "agents-lint-docs.py"
        sys.path.insert(0, str(script_path.parent))
        lint_docs = load_module("agents_lint_docs_frontmatter_test", script_path)

        content = """---
doc_type: standard
id: "STD-001"
status: "active"
related_lessons:
  - "general-lessons.md#2026-02-23---avoid-workbench-folder-sprawl"
---

# Sample
"""

        with tempfile.TemporaryDirectory() as td:
            file_path = Path(td) / "sample.md"
            file_path.write_text(content)

            linter = lint_docs.DocLinter(fix=False)
            linter.check_frontmatter(file_path, content)

            errors = [issue for issue in linter.issues if issue.severity == "error"]
            self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
