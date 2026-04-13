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


SCRIPT_PATH = Path(".agents/scripts/agents-bootstrap.py").resolve()


class BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bootstrap = load_module("agents_bootstrap_tests", SCRIPT_PATH)

    def test_mandatory_files_list_is_non_empty(self):
        """Bootstrap must declare a non-empty list of mandatory files."""
        self.assertGreater(len(self.bootstrap.MANDATORY_FILES_TO_COPY), 0)

    def test_mandatory_files_include_agents_wrapper(self):
        """The agents CLI wrapper must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/agents", mandatory)

    def test_mandatory_files_include_agents_config(self):
        """The agents config must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/agents.config", mandatory)

    def test_mandatory_files_include_opencode_json(self):
        """opencode.json must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn("opencode.json", mandatory)

    def test_mandatory_dirs_list_is_non_empty(self):
        """Bootstrap must declare mandatory directories."""
        self.assertGreater(len(self.bootstrap.MANDATORY_DIRS_TO_COPY), 0)

    def test_mandatory_dirs_include_runtime_package(self):
        """The runtime package must be part of the bootstrap surface."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_DIRS_TO_COPY}
        self.assertIn(".agents/runtime", mandatory)

    def test_ensure_dirs_list_is_non_empty(self):
        """Bootstrap must declare directories to ensure exist."""
        self.assertGreater(len(self.bootstrap.ENSURE_DIRS), 0)

    def test_template_root_points_to_src_project_template(self):
        """Bootstrap should read the export source from src/project-template."""
        self.assertEqual(self.bootstrap.TEMPLATE_ROOT, self.bootstrap.ROOT_DIR / "src" / "project-template")

    def test_makefile_wrapper_contains_include_marker(self):
        """The Makefile wrapper must contain the include marker."""
        self.assertIn(self.bootstrap.MAKEFILE_INCLUDE_MARKER, self.bootstrap.MAKEFILE_WRAPPER)

    def test_ensure_makefile_creates_wrapper_when_missing(self):
        """ensure_makefile must create the wrapper when Makefile is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            self.bootstrap.ensure_makefile(target, dry_run=False)
            makefile = target / "Makefile"
            self.assertTrue(makefile.exists())
            content = makefile.read_text()
            self.assertIn(self.bootstrap.MAKEFILE_INCLUDE_MARKER, content)

    def test_ensure_makefile_skips_when_marker_present(self):
        """ensure_makefile must not modify Makefile when marker is already present."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            makefile = target / "Makefile"
            makefile.write_text("# existing\ninclude docs/standards/Makefile\n")
            with mock.patch.object(self.bootstrap, "print_action") as mock_print:
                self.bootstrap.ensure_makefile(target, dry_run=False)
            actions = [call[0][0] for call in mock_print.call_args_list]
            self.assertNotIn("append include", actions)
            self.assertNotIn("create", actions)

    def test_generated_baseline_content_includes_roadmap(self):
        """Generated baseline must include the roadmap file."""
        generated = self.bootstrap.generated_baseline_content("2026-01-01T00:00:00Z")
        generated_paths = {str(p) for p in generated}
        self.assertTrue(
            any("GENERAL-ROADMAP.md" in p for p in generated_paths),
            f"Roadmap not found in generated content: {generated_paths}",
        )

    def test_roadmap_specs_for_mode_returns_full_specs(self):
        """Full install mode should return full starter parent specs."""
        specs = self.bootstrap.roadmap_specs_for_mode(self.bootstrap.INSTALL_MODE_FULL)
        self.assertGreater(len(specs), 0)

    def test_roadmap_specs_for_mode_returns_partial_specs(self):
        """Partial install mode should return partial starter parent specs."""
        specs = self.bootstrap.roadmap_specs_for_mode(self.bootstrap.INSTALL_MODE_PARTIAL)
        self.assertGreater(len(specs), 0)

    def test_parse_args_returns_target(self):
        """parse_args must accept a target directory argument."""
        with mock.patch.object(
            self.bootstrap.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(target="/tmp/test", dry_run=True, mode="full", partial=False),
        ):
            args = self.bootstrap.parse_args()
            self.assertEqual(args.target, "/tmp/test")
