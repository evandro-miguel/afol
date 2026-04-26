import argparse
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


SCRIPT_PATH = Path(".agents/scripts/agents-skills-sync.py").resolve()


class SkillsSyncUtilTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_util_tests", SCRIPT_PATH)

    def test_parse_csv_none(self):
        self.assertEqual(self.ss.parse_csv(None), [])

    def test_parse_csv_values(self):
        self.assertEqual(self.ss.parse_csv("a, b, c"), ["a", "b", "c"])

    def test_normalize_runtime_codex(self):
        self.assertEqual(self.ss.normalize_runtime("codex"), "codex")

    def test_normalize_runtime_none(self):
        self.assertEqual(self.ss.normalize_runtime(None), "all")

    def test_is_supported_runtime(self):
        self.assertTrue(self.ss.is_supported_runtime("codex"))
        self.assertFalse(self.ss.is_supported_runtime("nonexistent"))

    def test_dedupe(self):
        self.assertEqual(self.ss.dedupe(["a", "b", "a", "c"]), ["a", "b", "c"])

    def test_normalize_string_list_list(self):
        self.assertEqual(self.ss._normalize_string_list(["a", "b"]), ["a", "b"])

    def test_normalize_string_list_string(self):
        self.assertEqual(self.ss._normalize_string_list("a, b"), ["a", "b"])

    def test_normalize_string_list_fallback(self):
        self.assertEqual(self.ss._normalize_string_list(None, ["x"]), ["x"])

    def test_normalize_install_valid(self):
        entry = {"app": "codex", "skills": ["test-skill"], "profile": "core"}
        result = self.ss._normalize_install(entry)
        self.assertIsNotNone(result)
        self.assertIn("test-skill", result["skills"])

    def test_normalize_install_invalid(self):
        self.assertIsNone(self.ss._normalize_install("not a dict"))

    def test_normalize_install_missing_skill(self):
        self.assertIsNone(self.ss._normalize_install({"runtime": "codex"}))

    def test_default_manifest(self):
        result = self.ss._default_manifest()
        self.assertIn("version", result)
        self.assertIn("installs", result)

    def test_slugify_branch_part(self):
        self.assertEqual(self.ss._slugify_branch_part("My Skill Name"), "my-skill-name")

    def test_default_push_message(self):
        result = self.ss._default_push_message(["skill-a", "skill-b"])
        self.assertIn("2 skills", result)

    def test_default_push_message_single(self):
        result = self.ss._default_push_message(["skill-a"])
        self.assertIn("skill-a", result)

    def test_default_proposal_branch(self):
        result = self.ss._default_proposal_branch(["skill-a"])
        self.assertTrue(result.startswith("skills-sync/"))

    def test_skill_digest(self):
        with tempfile.TemporaryDirectory() as td:
            skill_dir = Path(td)
            (skill_dir / "SKILL.md").write_text("# Skill\n")
            result = self.ss.skill_digest(skill_dir)
            self.assertTrue(len(result) > 0)

    def test_cfg_default(self):
        """cfg returns default when config dict has no override."""
        with mock.patch.object(self.ss, "skills_sync_config", return_value={}):
            result = self.ss.cfg("enabled")
        self.assertFalse(result)

    def test_cfg_path(self):
        """cfg_path returns Path for configured key."""
        with mock.patch.object(self.ss, "skills_sync_config",
                               return_value={"project_dir": ".agents/skills"}):
            result = self.ss.cfg_path("project_dir")
        self.assertIsInstance(result, Path)


class SkillsSyncManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_manifest_tests", SCRIPT_PATH)

    def test_normalize_manifest_dict(self):
        data = {"version": 2, "installs": [], "source": {"dir": "src"}}
        result = self.ss._normalize_manifest(data)
        self.assertIn("version", result)

    def test_normalize_manifest_non_dict(self):
        with self.assertRaises(RuntimeError):
            self.ss._normalize_manifest("not a dict")

    def test_normalize_legacy_manifest(self):
        data = {"version": 1, "skills": ["a", "b"], "source_dir": "src", "mode": "copy"}
        result = self.ss._normalize_legacy_manifest(data)
        self.assertIn("installs", result)

    def test_normalize_v2_manifest(self):
        data = {
            "version": 2,
            "installs": [{"skill": "x", "runtime": "all", "profile": "core"}],
            "source": {"dir": "src"},
        }
        result = self.ss._normalize_v2_manifest(data)
        self.assertIn("installs", result)
        self.assertEqual(len(result["installs"]), 1)

    def test_normalize_manifest_header(self):
        manifest = {"version": 1}
        self.ss._normalize_manifest_header(manifest)
        self.assertEqual(manifest["version"], 2)

    def test_profile_skills_from_source(self):
        manifest = {
            "profiles": {
                "core": ["a", "c"],
                "extended": ["b"],
            }
        }
        result = self.ss._profile_skills_from_source("core", manifest)
        self.assertEqual(result, ["a", "c"])

    def test_resolve_install_skills_explicit(self):
        install = {"app": "codex", "skills": ["x", "y"]}
        manifest = {}
        result = self.ss._resolve_install_skills(install, manifest, None, "codex")
        self.assertEqual(result, ["x", "y"])

    def test_resolve_install_skills_from_manifest(self):
        install = {"app": "codex", "profile": "core"}
        manifest = {
            "profiles": {
                "core": ["a", "b"],
            }
        }
        result = self.ss._resolve_install_skills(install, manifest, None, "codex")
        self.assertIn("a", result)
        self.assertIn("b", result)

    def test_legacy_install_entries(self):
        raw = [{"skill": "a"}, {"skill": "b"}]
        result = self.ss._legacy_install_entries(raw)
        self.assertEqual(len(result), 2)

    def test_legacy_install_entries_string(self):
        result = self.ss._legacy_install_entries("a, b")
        self.assertEqual(len(result), 2)

    def test_normalized_source_dir(self):
        self.assertEqual(self.ss._normalized_source_dir({"source_dir": "my-dir"}), "my-dir")

    def test_normalized_source_dir_default(self):
        self.assertIn("universal-skills", self.ss._normalized_source_dir({}))

    def test_normalized_mode(self):
        self.assertEqual(self.ss._normalized_mode({"mode": "copy"}), "copy")

    def test_normalized_mode_default(self):
        self.assertEqual(self.ss._normalized_mode({}), "copy")


class SkillsSyncPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_path_tests", SCRIPT_PATH)

    def test_skills_root_for_repo(self):
        with mock.patch.object(self.ss, "cfg", return_value="skills"):
            result = self.ss.skills_root_for_repo(Path("/tmp/repo"))
        self.assertEqual(result, Path("/tmp/repo/skills"))

    def test_profiles_root_for_repo(self):
        result = self.ss.profiles_root_for_repo(Path("/tmp/repo"))
        self.assertEqual(result, Path("/tmp/repo/profiles"))

    def test_upstream_skills_root(self):
        with mock.patch.object(self.ss, "cfg_path", return_value=Path("/tmp/src")):
            result = self.ss.upstream_skills_root()
        self.assertTrue(str(result).endswith("skills"))

    def test_project_skills_root(self):
        with mock.patch.object(self.ss, "cfg_path", return_value=Path("/tmp/proj")):
            result = self.ss.project_skills_root()
        self.assertIsInstance(result, Path)

    def test_is_valid_source_repo(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            skills = repo / "skills"
            skills.mkdir()
            (skills / "my-skill").mkdir()
            (skills / "my-skill" / "SKILL.md").write_text("# Skill\n")
            profiles = repo / "profiles"
            profiles.mkdir()
            (profiles / "core.json").write_text('{"skills": ["my-skill"]}')
            (repo / "index.json").write_text("{}")
            with mock.patch.object(self.ss, "cfg", return_value="skills"):
                result = self.ss._is_valid_source_repo(repo)
            self.assertTrue(result)

    def test_is_valid_source_repo_invalid(self):
        with tempfile.TemporaryDirectory() as td:
            self.assertFalse(self.ss._is_valid_source_repo(Path(td)))

    def test_remove_path_file(self):
        with tempfile.TemporaryDirectory() as td:
            f = Path(td) / "file.txt"
            f.write_text("x")
            self.ss._remove_path(f)
            self.assertFalse(f.exists())

    def test_remove_path_dir(self):
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "dir"
            d.mkdir()
            (d / "f.txt").write_text("x")
            self.ss._remove_path(d)
            self.assertFalse(d.exists())

    def test_copy_tree(self):
        with tempfile.TemporaryDirectory() as td:
            src = Path(td) / "src"
            src.mkdir()
            (src / "f.txt").write_text("content")
            dst = Path(td) / "dst"
            self.ss._copy_tree(src, dst)
            self.assertTrue((dst / "f.txt").exists())

    def test_repo_skill_names(self):
        with tempfile.TemporaryDirectory() as td:
            skills = Path(td) / "skills"
            skills.mkdir()
            (skills / "my-skill").mkdir()
            (skills / "my-skill" / "SKILL.md").write_text("# Skill\n")
            (skills / "not-a-skill.txt").write_text("x")
            with mock.patch.object(self.ss, "cfg", return_value="skills"):
                result = self.ss._repo_skill_names(Path(td))
        self.assertIn("my-skill", result)
        self.assertNotIn("not-a-skill.txt", result)


class SkillsSyncResolveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_resolve_tests", SCRIPT_PATH)

    def test_resolve_targets_filters_runtime(self):
        manifest = {
            "installs": [
                {"app": "codex", "skills": ["a"]},
                {"app": "claude-code", "skills": ["b"]},
            ]
        }
        result = self.ss._resolve_targets(manifest, "codex")
        self.assertEqual(len(result), 1)
        self.assertIn("a", result[0]["skills"])

    def test_resolve_targets_all_runtime(self):
        manifest = {
            "installs": [
                {"skill": "a", "runtime": "all", "profile": "core"},
            ]
        }
        result = self.ss._resolve_targets(manifest, "codex")
        self.assertEqual(len(result), 1)

    def test_resolve_targets_no_match_raises(self):
        manifest = {
            "installs": [
                {"app": "codex", "skills": ["a"]},
            ]
        }
        with self.assertRaises(RuntimeError):
            self.ss._resolve_targets(manifest, "gemini")

    def test_matching_skills(self):
        result = self.ss._matching_skills("folder", skills=["agentic-folder-sys", "other"])
        self.assertIn("agentic-folder-sys", result)

    def test_skill_doc_path(self):
        with mock.patch.object(self.ss, "upstream_skills_root", return_value=Path("/tmp/skills")):
            result = self.ss._skill_doc_path("my-skill")
        self.assertTrue(str(result).endswith("SKILL.md"))

    def test_skill_search_blob(self):
        with tempfile.TemporaryDirectory() as td:
            skills = Path(td) / "skills"
            skills.mkdir()
            skill_dir = skills / "my-skill"
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text("test content for search")
            with mock.patch.object(self.ss, "cfg", return_value="skills"):
                result = self.ss._skill_search_blob("my-skill", source_repo=Path(td))
        self.assertIn("test content for search", result)

    def test_git_ref_exists(self):
        with mock.patch.object(self.ss, "run_command", return_value=mock.Mock(returncode=0)):
            result = self.ss._git_ref_exists(Path("/tmp/repo"), "main")
        self.assertTrue(result)

    def test_git_ref_exists_false(self):
        with mock.patch.object(self.ss, "run_command", return_value=mock.Mock(returncode=1)):
            result = self.ss._git_ref_exists(Path("/tmp/repo"), "nonexistent")
        self.assertFalse(result)


class SkillsSyncCmdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_cmd_tests", SCRIPT_PATH)

    def test_cmd_init_creates_source(self):
        with tempfile.TemporaryDirectory() as td:
            source_dir = Path(td) / "universal-skills"
            source_dir.mkdir()
            (source_dir / "skills").mkdir()
            with mock.patch.object(self.ss, "cfg_path", return_value=source_dir.parent), \
                 mock.patch.object(self.ss, "ensure_enabled", return_value=True), \
                 mock.patch.object(self.ss, "load_manifest", return_value=self.ss._default_manifest()), \
                 mock.patch.object(self.ss, "save_manifest"), \
                 mock.patch.object(self.ss, "ensure_repo_cloned"), \
                 mock.patch.object(self.ss, "project_skills_root", return_value=Path(td) / "proj"), \
                 mock.patch("builtins.print"):
                args = argparse.Namespace()
                self.ss.cmd_init(args)

    def test_cmd_status(self):
        with mock.patch.object(self.ss, "ensure_enabled", return_value=True), \
             mock.patch.object(self.ss, "load_manifest", return_value=self.ss._default_manifest()), \
             mock.patch.object(self.ss, "installed_skills", return_value=["a"]), \
             mock.patch.object(self.ss, "available_skills", return_value=["a", "b"]), \
             mock.patch("builtins.print"):
            args = argparse.Namespace()
            self.ss.cmd_status(args)

    def test_cmd_check_valid(self):
        with mock.patch.object(self.ss, "ensure_enabled", return_value=True), \
             mock.patch.object(self.ss, "load_manifest", return_value=self.ss._default_manifest()), \
             mock.patch.object(self.ss, "validate_project_structure", return_value=[]), \
             mock.patch.object(self.ss, "installed_skills", return_value=["a"]), \
             mock.patch.object(self.ss, "resolve_skills_for_request", return_value=["a"]), \
             mock.patch.object(self.ss, "_compare", return_value=([], [], [])), \
             mock.patch.object(self.ss, "upstream_skills_root", return_value=Path("/tmp")), \
             mock.patch("builtins.print"):
            args = argparse.Namespace(skills=None, runtime=None)
            self.ss.cmd_check(args)

    def test_cmd_check_warns_for_stale_manifest_entry_and_local_extra(self):
        def cfg_side_effect(key):
            if key == "required":
                return True
            if key == "mode":
                return "copy"
            return self.ss.DEFAULTS[key]

        with mock.patch.object(self.ss, "ensure_enabled", return_value=True), \
             mock.patch.object(self.ss, "load_manifest", return_value=self.ss._default_manifest()), \
             mock.patch.object(self.ss, "_resolve_targets", return_value=[{"app": "all", "skills": ["legacy-skill"]}]), \
             mock.patch.object(self.ss, "validate_project_structure", return_value=[]), \
             mock.patch.object(self.ss, "resolve_skills_for_request", return_value=["agentic-folder-sys"]), \
             mock.patch.object(self.ss, "_compare", return_value=(["legacy-skill"], [], [])), \
             mock.patch.object(self.ss, "installed_skills", return_value=["agentic-folder-sys", "project-only"]), \
             mock.patch.object(self.ss, "upstream_skills_root", return_value=Path("/tmp")), \
             mock.patch.object(self.ss, "cfg", side_effect=cfg_side_effect), \
             mock.patch("builtins.print") as print_mock:
            args = argparse.Namespace(skills=None, runtime=None)
            self.ss.cmd_check(args)

        messages = [call.args[0] for call in print_mock.call_args_list]
        self.assertIn("WARN: stale-manifest-entry: legacy-skill", messages)
        self.assertIn("WARN: local-extra: project-only", messages)
        self.assertIn("PASS: skills structure and sync are valid", messages)

    def test_cmd_check_fails_on_missing_project_and_selected_drift(self):
        def cfg_side_effect(key):
            if key == "required":
                return True
            if key == "mode":
                return "copy"
            return self.ss.DEFAULTS[key]

        with mock.patch.object(self.ss, "ensure_enabled", return_value=True), \
             mock.patch.object(self.ss, "load_manifest", return_value=self.ss._default_manifest()), \
             mock.patch.object(self.ss, "_resolve_targets", return_value=[{"app": "all", "profile": "core"}]), \
             mock.patch.object(self.ss, "validate_project_structure", return_value=[]), \
             mock.patch.object(self.ss, "resolve_skills_for_request", return_value=["agentic-folder-sys"]), \
             mock.patch.object(self.ss, "_compare", return_value=([], ["agentic-folder-sys"], ["agentic-folder-sys"])), \
             mock.patch.object(self.ss, "installed_skills", return_value=["agentic-folder-sys"]), \
             mock.patch.object(self.ss, "upstream_skills_root", return_value=Path("/tmp")), \
             mock.patch.object(self.ss, "cfg", side_effect=cfg_side_effect), \
             mock.patch("builtins.print") as print_mock:
            args = argparse.Namespace(skills=None, runtime=None)
            with self.assertRaises(RuntimeError):
                self.ss.cmd_check(args)

        messages = [call.args[0] for call in print_mock.call_args_list]
        self.assertIn("ERROR: missing in project: agentic-folder-sys", messages)
        self.assertIn("ERROR: source-drift (selected set): agentic-folder-sys", messages)
        self.assertFalse(any(msg.startswith("WARN: stale-manifest-entry:") for msg in messages))

    def test_validate_project_structure(self):
        with mock.patch.object(self.ss, "project_skills_root", return_value=Path("/tmp/skills")):
            result = self.ss.validate_project_structure()
        self.assertIsInstance(result, list)

    def test_installed_skills_empty(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(self.ss, "project_skills_root", return_value=Path(td)):
                result = self.ss.installed_skills()
        self.assertEqual(result, [])

    def test_installed_skills_with_skills(self):
        with tempfile.TemporaryDirectory() as td:
            skill_dir = Path(td) / "my-skill"
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text("# Skill\n")
            with mock.patch.object(self.ss, "project_skills_root", return_value=Path(td)):
                result = self.ss.installed_skills()
        self.assertIn("my-skill", result)

    def test_available_skills(self):
        with tempfile.TemporaryDirectory() as td:
            skills = Path(td) / "skills"
            skills.mkdir()
            (skills / "test-skill").mkdir()
            (skills / "test-skill" / "SKILL.md").write_text("# Test\n")
            with mock.patch.object(self.ss, "cfg", return_value="skills"):
                result = self.ss.available_skills(source_repo=Path(td))
        self.assertIn("test-skill", result)

    def test_configured_profile_names(self):
        manifest = {
            "installs": [
                {"skill": "a", "profile": "core"},
                {"skill": "b", "profile": "extended"},
            ]
        }
        result = self.ss._configured_profile_names(manifest)
        self.assertIn("core", result)
        self.assertIn("extended", result)

    def test_configured_profile_names_none(self):
        result = self.ss._configured_profile_names(None)
        self.assertIsInstance(result, list)


class SkillsSyncMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ss = load_module("agents_skills_sync_main_tests", SCRIPT_PATH)

    def test_build_parser(self):
        parser = self.ss.build_parser()
        self.assertIsNotNone(parser)

    def test_resolve_project_target_default(self):
        args = argparse.Namespace(runtime=None)
        with mock.patch.object(self.ss, "cfg", return_value="all"):
            result = self.ss.resolve_project_target(args)
        self.assertIsInstance(result, str)
