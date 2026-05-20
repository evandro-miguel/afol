import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(".agents/scripts/agents-repo-map.py").resolve()


class RepoMapResolveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rm = load_module("agents_repo_map_resolve_tests", SCRIPT_PATH)

    def test_resolve_repo_existing_dir(self):
        """_resolve_repo returns Path for existing directory."""
        with tempfile.TemporaryDirectory() as td:
            result = self.rm._resolve_repo(td)
            self.assertIsInstance(result, Path)
            self.assertTrue(result.is_dir())

    def test_resolve_repo_missing_raises(self):
        """_resolve_repo raises for missing path."""
        with self.assertRaises(FileNotFoundError):
            self.rm._resolve_repo("/nonexistent/path")

    def test_resolve_output_explicit(self):
        """_resolve_output uses explicit output path."""
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            out = Path(td) / "output"
            result = self.rm._resolve_output(repo, str(out))
            self.assertEqual(result, out.resolve())

    def test_resolve_output_relative(self):
        """_resolve_output resolves relative path against repo root."""
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            result = self.rm._resolve_output(repo, "docs/map")
            self.assertEqual(result, (repo / "docs/map").resolve())

    def test_resolve_output_default(self):
        """_resolve_output uses default when no output_arg."""
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            repo.mkdir()
            result = self.rm._resolve_output(repo, None)
            self.assertTrue("docs/map" in str(result) or "map" in str(result))

    def test_resolve_runner_from_cli(self):
        """_resolve_runner finds runner from CLI arg."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False) as f:
            f.write("#!/bin/bash\n")
            f.flush()
            result = self.rm._resolve_runner(f.name)
            self.assertTrue(result.exists())

    def test_resolve_runner_missing_raises(self):
        """_resolve_runner raises when no runner found."""
        with mock.patch.object(self.rm, "_runner_candidates", return_value=iter([])):
            with self.assertRaises(FileNotFoundError):
                self.rm._resolve_runner(None)

    def test_runner_requires_standard_host_tools_default(self):
        """_runner_requires_standard_host_tools returns True for default runner."""
        result = self.rm._runner_requires_standard_host_tools(self.rm.DEFAULT_RUNNER_HINT)
        self.assertTrue(result)

    def test_runner_requires_standard_host_tools_custom(self):
        """_runner_requires_standard_host_tools returns False for custom runner."""
        with tempfile.NamedTemporaryFile(suffix=".sh", delete=False, mode="w") as f:
            f.write("#!/bin/bash\n")
            result = self.rm._runner_requires_standard_host_tools(Path(f.name))
        self.assertFalse(result)


class RepoMapValidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rm = load_module("agents_repo_map_validate_tests", SCRIPT_PATH)

    def test_validate_generated_docs_success(self):
        """All required docs present returns generated list."""
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "README.md").write_text("# readme")
            (out / "ARCHITECTURE.md").write_text("# arch")
            result = self.rm._validate_generated_docs(out, ["README.md", "ARCHITECTURE.md"])
        self.assertEqual(len(result), 2)

    def test_validate_generated_docs_missing_raises(self):
        """Missing required doc raises RuntimeError."""
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "README.md").write_text("# readme")
            with self.assertRaises(RuntimeError):
                self.rm._validate_generated_docs(out, ["README.md", "MISSING.md"])


class RepoMapSectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rm = load_module("agents_repo_map_section_tests", SCRIPT_PATH)

    def test_extract_section_body_found(self):
        """Extract body of a section heading."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Title\n## Section A\nline1\nline2\n## Section B\nother\n")
            f.flush()
            result = self.rm._extract_section_body(Path(f.name), "## Section A")
        self.assertIn("line1", result)
        self.assertNotIn("other", result)

    def test_extract_section_body_not_found(self):
        """Returns empty when section not found."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Title\n## Other\ncontent\n")
            f.flush()
            result = self.rm._extract_section_body(Path(f.name), "## Missing")
        self.assertEqual(result, "")

    def test_extract_section_body_missing_file(self):
        """Returns empty for missing file."""
        result = self.rm._extract_section_body(Path("/nonexistent"), "## Heading")
        self.assertEqual(result, "")

    def test_replace_section(self):
        """Replace section body in file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Title\n## Section A\nold line\n## Section B\nother\n")
            f.flush()
            path = Path(f.name)
            self.rm._replace_section(path, "## Section A", ["new line 1", "new line 2"])
        content = path.read_text()
        self.assertIn("new line 1", content)
        self.assertNotIn("old line", content)
        self.assertIn("other", content)

    def test_replace_section_missing_file(self):
        """Does nothing for missing file."""
        self.rm._replace_section(Path("/nonexistent"), "## Heading", ["line"])  # should not raise

    def test_replace_first_line_with_prefix(self):
        """Replace first line matching prefix."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Title\nprefix: old value\nother\n")
            f.flush()
            path = Path(f.name)
            self.rm._replace_first_line_with_prefix(path, "prefix:", "prefix: new value")
        content = path.read_text()
        self.assertIn("prefix: new value", content)
        self.assertNotIn("old value", content)

    def test_replace_first_line_no_match(self):
        """No match leaves file unchanged."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write("# Title\nother\n")
            f.flush()
            path = Path(f.name)
            self.rm._replace_first_line_with_prefix(path, "missing:", "replacement")
        content = path.read_text()
        self.assertNotIn("replacement", content)


class RepoMapEnsurePrerequisitesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rm = load_module("agents_repo_map_prereq_tests", SCRIPT_PATH)

    def test_ensure_host_prerequisites_missing_tools(self):
        """Missing ctags or docker raises RuntimeError."""
        with mock.patch("shutil.which", return_value=None):
            with self.assertRaises(RuntimeError):
                self.rm._ensure_host_prerequisites(self.rm.DEFAULT_RUNNER_HINT)

    def test_ensure_host_prerequisites_all_present(self):
        """All tools present does not raise."""
        with mock.patch("shutil.which", return_value="/usr/bin/tool"):
            self.rm._ensure_host_prerequisites(self.rm.DEFAULT_RUNNER_HINT)

    def test_ensure_host_prerequisites_custom_runner_skips(self):
        """Custom runner skips prerequisite check."""
        with tempfile.NamedTemporaryFile(suffix=".sh", delete=False, mode="w") as f:
            f.write("#!/bin/bash\n")
            self.rm._ensure_host_prerequisites(Path(f.name))  # should not raise


class RepoMapMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rm = load_module("agents_repo_map_main_tests", SCRIPT_PATH)

    def test_main_dry_run(self):
        """Dry run prints command without executing."""
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(self.rm, "parse_args") as mock_args:
                mock_args.return_value = mock.Mock(
                    path=td, output=None, runner=None, dry_run=True, image="test:latest"
                )
                with mock.patch("builtins.print"):
                    result = self.rm.main()
            self.assertIsInstance(result, int)
