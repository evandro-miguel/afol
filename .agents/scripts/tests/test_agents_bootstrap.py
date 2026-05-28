import importlib.util
import io
import os
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

    def _skip_without_source_template(self):
        if not self.bootstrap.TEMPLATE_ROOT.exists():
            self.skipTest("source project template is only present in the source repo")

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

    def test_mandatory_files_include_lock_file(self):
        """The lock file must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/lock.json", mandatory)

    def test_mandatory_files_include_manifest_file(self):
        """The lock manifest must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn(".agents/manifest.json", mandatory)

    def test_mandatory_files_include_just_wrapper(self):
        """The Justfile wrapper must be in the mandatory files list."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn("Justfile", mandatory)

    def test_mandatory_files_include_front_door_wrapper(self):
        """The root front door wrapper must be part of bootstrap mandatory files."""
        mandatory = {str(p) for p in self.bootstrap.MANDATORY_FILES_TO_COPY}
        self.assertIn("a", mandatory)

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
        self._skip_without_source_template()
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
        self._skip_without_source_template()
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

            with mock.patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "Failed to prepare repo-local universal-skills checkout",
                ):
                    module.prepare_sibling_universal_skills_checkout(target, dry_run=False)

    def test_prepare_sibling_universal_skills_checkout_prefers_refreshed_external_source(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "scaffold"
            target = Path(td) / "project"
            external = Path(td) / "universal-skills"
            target.mkdir(parents=True)
            module = self._load_with_root(root)

            manifest = root / ".agents" / "skills-sync.manifest.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                '{"installs":[{"app":"all","skills":["agentic-folder-sys","agentic-scaffold-mcp"]}]}',
                encoding="utf-8",
            )

            external_skill = external / "skills" / "agentic-folder-sys"
            external_skill.mkdir(parents=True)
            (external_skill / "SKILL.md").write_text("external folder sys\n", encoding="utf-8")
            (external / "profiles").mkdir()
            (external / "profiles" / "core.json").write_text(
                '{"name":"core","skills":["agentic-folder-sys"]}',
                encoding="utf-8",
            )
            (external / "index.json").write_text('{"skills":[]}', encoding="utf-8")
            (external / ".git").mkdir()

            local_mcp = root / ".agents" / "source" / "universal-skills" / "skills" / "agentic-scaffold-mcp"
            local_mcp.mkdir(parents=True)
            (local_mcp / "SKILL.md").write_text("local scaffold mcp\n", encoding="utf-8")

            def fake_run(cmd, **kwargs):
                result = mock.Mock()
                result.returncode = 0
                result.stdout = "main\n" if cmd[:3] == ["git", "rev-parse", "--abbrev-ref"] else ""
                result.stderr = ""
                return result

            with mock.patch.object(module.subprocess, "run", side_effect=fake_run) as patched_run:
                module.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            checkout = target / ".agents" / "source" / "universal-skills"
            self.assertEqual(
                (checkout / "skills" / "agentic-folder-sys" / "SKILL.md").read_text(encoding="utf-8"),
                "external folder sys\n",
            )
            self.assertEqual(
                (checkout / "skills" / "agentic-scaffold-mcp" / "SKILL.md").read_text(encoding="utf-8"),
                "local scaffold mcp\n",
            )
            self.assertEqual(
                [entry[0][0] for entry in patched_run.call_args_list],
                [
                    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                    ["git", "pull", "--ff-only", "origin", "main"],
                ],
            )

    def test_seed_external_invalid_skill_directory_uses_local_fallback(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "scaffold"
            external = Path(td) / "universal-skills"
            checkout = Path(td) / "project" / ".agents" / "source" / "universal-skills"
            module = self._load_with_root(root)

            manifest = root / ".agents" / "skills-sync.manifest.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                '{"installs":[{"app":"all","skills":["agentic-folder-sys"]}]}',
                encoding="utf-8",
            )
            malformed_external_skill = external / "skills" / "agentic-folder-sys"
            malformed_external_skill.mkdir(parents=True)
            (malformed_external_skill / "README.md").write_text("missing skill doc\n", encoding="utf-8")

            local_skill = root / ".agents" / "source" / "universal-skills" / "skills" / "agentic-folder-sys"
            local_skill.mkdir(parents=True)
            (local_skill / "SKILL.md").write_text("local valid fallback\n", encoding="utf-8")

            self.assertTrue(module.seed_repo_local_universal_skills_from_source(external, checkout))
            self.assertEqual(
                (checkout / "skills" / "agentic-folder-sys" / "SKILL.md").read_text(encoding="utf-8"),
                "local valid fallback\n",
            )
            self.assertTrue(module.is_valid_universal_skills_checkout(checkout))

    def test_seed_external_partial_checkout_is_cleaned_before_local_fallback(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "scaffold"
            checkout = Path(td) / "project" / ".agents" / "source" / "universal-skills"
            module = self._load_with_root(root)

            manifest = root / ".agents" / "skills-sync.manifest.json"
            manifest.parent.mkdir(parents=True)
            manifest.write_text(
                '{"installs":[{"app":"all","skills":["agentic-folder-sys"]}]}',
                encoding="utf-8",
            )
            local_source = root / ".agents" / "source" / "universal-skills"
            local_skill = local_source / "skills" / "agentic-folder-sys"
            local_skill.mkdir(parents=True)
            (local_skill / "SKILL.md").write_text("local fallback\n", encoding="utf-8")
            (local_source / "profiles").mkdir()
            (local_source / "profiles" / "core.json").write_text(
                '{"name":"core","skills":["agentic-folder-sys"]}',
                encoding="utf-8",
            )
            (local_source / "index.json").write_text('{"skills":[]}', encoding="utf-8")

            def partial_seed(_source, partial_checkout):
                (partial_checkout / "skills").mkdir(parents=True)
                (partial_checkout / "partial.txt").write_text("partial\n", encoding="utf-8")
                return False

            with mock.patch.object(module, "refreshed_external_universal_skills_source", return_value=Path(td) / "external"):
                with mock.patch.object(module, "seed_repo_local_universal_skills_from_source", side_effect=partial_seed):
                    self.assertTrue(module.seed_repo_local_universal_skills_checkout(checkout))

            self.assertFalse((checkout / "partial.txt").exists())
            self.assertEqual(
                (checkout / "skills" / "agentic-folder-sys" / "SKILL.md").read_text(encoding="utf-8"),
                "local fallback\n",
            )

    def test_refresh_git_universal_skills_source_handles_missing_git_binary(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            source = Path(td) / "universal-skills"
            (source / ".git").mkdir(parents=True)
            module = self._load_with_root(Path(td) / "scaffold")

            with mock.patch.object(module.subprocess, "run", side_effect=OSError("git missing")):
                self.assertFalse(module.refresh_git_universal_skills_source(source))

    def test_bootstrap_manifest_can_roundtrip(self):
        """Managed file manifest should persist and reload with stable payload."""
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "target"
            target.mkdir()
            module = self._load_with_root(target)

            template = module.TEMPLATE_ROOT
            template.mkdir(parents=True, exist_ok=True)
            (template / "AGENTS.md").write_text("managed bootstrap fixture", encoding="utf-8")
            (template / ".agents").mkdir(parents=True, exist_ok=True)
            (template / ".agents/agents").write_text("bootstrap wrapper fixture\n", encoding="utf-8")

            with mock.patch.object(
                module,
                "MANDATORY_FILES_TO_COPY",
                [Path("AGENTS.md")],
            ), mock.patch.object(
                module,
                "MANDATORY_DIRS_TO_COPY",
                [Path(".agents")],
            ), mock.patch.object(module, "OPTIONAL_FILES_TO_COPY", []):
                manifest = module.bootstrap_manifest(target)
                self.assertIn("AGENTS.md", manifest.managed_files)
                self.assertIn(".agents/agents", manifest.managed_files)
                module.write_bootstrap_manifest(target, manifest)

                loaded = module._load_bootstrap_manifest(target)
                self.assertEqual(loaded.version, manifest.version)
                self.assertEqual(loaded.managed_files, manifest.managed_files)
                self.assertEqual(
                    loaded.managed_files["AGENTS.md"],
                    module.file_hash(template / "AGENTS.md"),
                )

    def test_bootstrap_reconcile_plan_reports_expected_actions(self):
        """Reconcile planning should classify create/update and preservation actions."""
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "target"
            target.mkdir()
            module = self._load_with_root(target)

            template = module.TEMPLATE_ROOT
            template.mkdir(parents=True, exist_ok=True)
            source_agents = template / "AGENTS.md"
            source_runtime = template / ".agents/agents"
            source_agents.parent.mkdir(parents=True, exist_ok=True)
            source_agents.write_text("source AGENTS\n", encoding="utf-8")
            source_runtime.parent.mkdir(parents=True, exist_ok=True)
            source_runtime.write_text("source agents wrapper\n", encoding="utf-8")

            (target / "AGENTS.md").write_text("source AGENTS\n", encoding="utf-8")
            (target / ".agents").mkdir(parents=True, exist_ok=True)
            (target / ".agents/agents").write_text("user edited wrapper\n", encoding="utf-8")
            (target / ".agents/local-note.md").write_text("user file\n", encoding="utf-8")
            (target / "local-only.txt").write_text("outside scoped file\n", encoding="utf-8")
            (target / ".agents/deprecated.txt").write_text("stale managed file\n", encoding="utf-8")

            prior_manifest = module.BootstrapManifest(
                version=module.BOOTSTRAP_MANIFEST_VERSION,
                generated_at="2026-01-01T00:00:00Z",
                managed_files={
                    "AGENTS.md": module.file_hash(source_agents),
                    ".agents/agents": module.file_hash(source_runtime),
                    ".agents/deprecated.txt": "stale",
                },
            )

            with mock.patch.object(
                module,
                "MANDATORY_FILES_TO_COPY",
                [Path("AGENTS.md"), Path(".agents/agents")],
            ), mock.patch.object(
                module,
                "MANDATORY_DIRS_TO_COPY",
                [],
            ), mock.patch.object(module, "OPTIONAL_FILES_TO_COPY", []):
                plan = module.bootstrap_reconcile_plan(target, manifest=prior_manifest)

            actions = {entry.action for entry in plan}
            paths_by_action = {action: sorted(str(item.path) for item in plan if item.action == action) for action in actions}

            self.assertIn(module.BootstrapAction.SKIP_IDENTICAL, actions)
            self.assertIn(module.BootstrapAction.CONFLICT_USER_EDITED, actions)
            self.assertIn(module.BootstrapAction.PRESERVE_UNMANAGED, actions)
            self.assertIn(module.BootstrapAction.DELETE_STALE_MANAGED, actions)

            self.assertTrue(any(".agents/agents" in path for path in paths_by_action[module.BootstrapAction.CONFLICT_USER_EDITED]))
            self.assertTrue(any(".agents/local-note.md" in path for path in paths_by_action[module.BootstrapAction.PRESERVE_UNMANAGED]))
            self.assertTrue(any(".agents/deprecated.txt" in path for path in paths_by_action[module.BootstrapAction.DELETE_STALE_MANAGED]))
