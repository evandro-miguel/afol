import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
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

    @staticmethod
    def _load_with_root(root: Path):
        module = load_module(f"agents_bootstrap_tests_{id(root)}", SCRIPT_PATH)
        module.ROOT_DIR = root
        module.TEMPLATE_ROOT = root / "src" / "project-template"
        return module

    def test_mandatory_files_list_is_non_empty(self):
        """Bootstrap must declare a non-empty list of mandatory files."""
        self.assertGreater(len(self.bootstrap.MANDATORY_FILES_TO_COPY), 0)

    def test_mandatory_files_include_agents_wrapper(self):
        """The agents CLI wrapper must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/agents", mandatory)

    def test_mandatory_files_include_agents_mcp_wrapper(self):
        """The MCP wrapper must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/agents-mcp", mandatory)

    def test_mandatory_files_include_agents_config(self):
        """The agents config must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/agents.config", mandatory)

    def test_mandatory_files_include_just_wrapper(self):
        """The Justfile wrapper must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn("Justfile", mandatory)

    def test_mandatory_files_exclude_opencode_json(self):
        """opencode.json should not be in the minimal root bootstrap surface."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertNotIn("opencode.json", mandatory)

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

    def test_ensure_justfile_creates_wrapper_when_missing(self):
        """ensure_justfile must create the wrapper when Justfile is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            self.bootstrap.ensure_justfile(target, dry_run=False)
            justfile = target / "Justfile"
            self.assertTrue(justfile.exists())
            content = justfile.read_text(encoding="utf-8")
            self.assertIn(self.bootstrap.JUSTFILE_MODULE_MARKER, content)

    def test_ensure_justfile_skips_when_scaffold_reference_present(self):
        """ensure_justfile must not modify Justfile when scaffold import/module exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            justfile = target / "Justfile"
            justfile.write_text("set shell := [\"bash\", \"-c\"]\nmod agents_scaffold 'docs/standards/Justfile'\n")
            with mock.patch.object(self.bootstrap, "print_action") as mock_print:
                self.bootstrap.ensure_justfile(target, dry_run=False)
            actions = [call[0][0] for call in mock_print.call_args_list]
            self.assertNotIn("append scaffold module", actions)
            self.assertNotIn("create", actions)

    def test_ensure_justfile_appends_module_when_missing_reference(self):
        """ensure_justfile must append namespaced scaffold module for existing Justfiles."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            justfile = target / "Justfile"
            justfile.write_text("default:\n  @echo custom\n", encoding="utf-8")
            self.bootstrap.ensure_justfile(target, dry_run=False)
            content = justfile.read_text(encoding="utf-8")
            self.assertIn("default:", content)
            self.assertIn(self.bootstrap.JUSTFILE_MODULE_MARKER, content)

    def test_ensure_justfile_ignores_comment_only_marker_mentions(self):
        """Comment-only marker mentions must not suppress scaffold module append."""
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            justfile = target / "Justfile"
            justfile.write_text(
                "# import 'docs/standards/Justfile'\n"
                "default:\n"
                "  @echo custom\n",
                encoding="utf-8",
            )
            self.bootstrap.ensure_justfile(target, dry_run=False)
            content = justfile.read_text(encoding="utf-8")
            self.assertIn("default:", content)
            self.assertIn(self.bootstrap.JUSTFILE_MODULE_MARKER, content)

    def test_generated_baseline_content_includes_roadmap(self):
        """Generated baseline must include the roadmap file."""
        generated = self.bootstrap.generated_baseline_content("2026-01-01T00:00:00Z")
        generated_paths = {str(p) for p in generated}
        self.assertTrue(
            any("GENERAL-ROADMAP.md" in p for p in generated_paths),
            f"Roadmap not found in generated content: {generated_paths}",
        )

    def test_current_timestamp_uses_agents_config_clock(self):
        """Bootstrap timestamp helper should use the shared timezone helper."""
        with mock.patch.object(self.bootstrap, "now_iso_with_offset", return_value="2026-01-01T00:00:00Z") as patched:
            self.assertEqual(self.bootstrap.current_timestamp(), "2026-01-01T00:00:00Z")
            patched.assert_called_once_with("Z")

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

    def test_prepare_sibling_universal_skills_checkout_dry_run_does_not_raise(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "project"
            target.mkdir()
            module = self._load_with_root(target)

            with io.StringIO() as buffer:
                with redirect_stdout(buffer):
                    module.prepare_sibling_universal_skills_checkout(target, dry_run=True)
                self.assertIn("prepare repo-local universal-skills source", buffer.getvalue())

    def test_prepare_sibling_universal_skills_checkout_raises_when_seed_fails(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "project"
            target.mkdir()
            module = self._load_with_root(target)

            with self.assertRaisesRegex(
                RuntimeError,
                "Failed to prepare repo-local universal-skills checkout",
            ):
                module.prepare_sibling_universal_skills_checkout(target, dry_run=False)
