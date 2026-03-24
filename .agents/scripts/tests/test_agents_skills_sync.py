import importlib.util
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def base_config() -> dict:
    return {
        "skills_sync": {
            "enabled": True,
            "required": False,
            "upstream_repo_url": "https://github.com/example/skill-universal.git",
            "upstream_branch": "main",
            "source_dir": ".agents/source/universal-skills",
            "pool_dir": ".agents/cache/universal-skills",
            "project_dir": ".agents/skills",
            "manifest_file": ".agents/skills-sync.manifest.json",
            "upstream_skills_dir": "skills",
            "default_profile": "core",
            "runtime_targets": ["all", "opencode", "codex"],
            "mode": "copy",
            "default_skills": ["writing-skills", "markdownlint-skill"],
        }
    }


class AgentsSkillsSyncTests(unittest.TestCase):
    def _load_with_root(self, root: Path):
        script_path = Path(__file__).resolve().parent.parent / "agents-skills-sync.py"
        sys.path.insert(0, str(script_path.parent))
        module = load_module("agents_skills_sync_test", script_path)
        module.ROOT_DIR = root
        module.CONFIG = base_config()
        return module

    def _make_source_skill(
        self,
        root: Path,
        name: str,
        *,
        description: str = "Example skill",
        source_dir: str = ".agents/source/universal-skills",
    ) -> Path:
        skill_dir = root / source_dir / "skills" / name
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(
            f"---\nname: {name}\ndescription: {description}\n---\n\n# {name}\n\n{description}\n",
            encoding="utf-8",
        )
        return skill_dir

    def _make_profile(
        self,
        root: Path,
        profile: str,
        skills: list[str],
        *,
        source_dir: str = ".agents/source/universal-skills",
    ) -> None:
        profile_dir = root / source_dir / "profiles"
        profile_dir.mkdir(parents=True, exist_ok=True)
        (profile_dir / f"{profile}.json").write_text(
            json.dumps({"skills": skills}),
            encoding="utf-8",
        )

    def test_legacy_manifest_migrates_to_version2(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            manifest_path = root / ".agents/skills-sync.manifest.json"
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "selected_skills": ["markdownlint-skill", "writing-skills"],
                        "upstream_branch": "release/v1",
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

            loaded = module.load_manifest()

            self.assertEqual(loaded["version"], 2)
            self.assertEqual(loaded["ref"], "release/v1")
            installs = loaded["installs"]
            self.assertEqual(installs, [{"app": "all", "skills": ["markdownlint-skill", "writing-skills"]}])

    def test_resolve_runtime_and_profile_semantics(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_profile(root, "core", ["writing-skills", "markdownlint-skill"])
            self._make_profile(root, "docs", ["bun-skill"])

            manifest = {
                "version": 2,
                "repo": "https://github.com/example/skill-universal.git",
                "ref": "main",
                "mode": "copy",
                "installs": [
                    {"app": "all", "profile": "core"},
                    {"app": "codex", "skills": ["bun-skill"]},
                ],
            }

            codex = module.resolve_skills_for_request(
                manifest,
                cli_skills=[],
                runtime="codex",
                profile=None,
            )
            opencode = module.resolve_skills_for_request(
                manifest,
                cli_skills=[],
                runtime="opencode",
                profile=None,
            )

            self.assertEqual(codex, ["bun-skill"])
            self.assertEqual(opencode, ["writing-skills", "markdownlint-skill"])

            profile_override = module.resolve_skills_for_request(
                manifest,
                cli_skills=[],
                runtime="opencode",
                profile="docs",
            )
            self.assertEqual(profile_override, ["bun-skill"])

    def test_explicit_skills_override_manifest_selection(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            manifest = {
                "version": 2,
                "repo": "https://github.com/example/skill-universal.git",
                "ref": "main",
                "installs": [{"app": "all", "profile": "core"}],
            }

            resolved = module.resolve_skills_for_request(
                manifest,
                cli_skills=["markdownlint-skill", "writing-skills"],
                runtime="all",
                profile=None,
            )

            self.assertEqual(resolved, ["markdownlint-skill", "writing-skills"])

    def test_persist_explicit_selection_for_runtime(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            manifest = {
                "version": 2,
                "installs": [{"app": "all", "profile": "core"}],
            }

            module._persist_explicit_skill_selection(
                manifest,
                runtime="codex",
                skills=["writing-skills", "markdownlint-skill"],
            )

            self.assertIn({"app": "codex", "skills": ["writing-skills", "markdownlint-skill"]}, manifest["installs"])
            self.assertIn({"app": "all", "profile": "core"}, manifest["installs"])

    def test_check_warns_when_optional_pool_is_missing(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["required"] = False
            module.CONFIG["skills_sync"]["runtime_targets"] = ["all"]
            module.CONFIG["skills_sync"]["manifest_file"] = ".agents/skills-sync.manifest.json"

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                module.cmd_check(type("Args", (), {"skills": None, "runtime": None})())

            output = buffer.getvalue()
            self.assertIn("WARN: skills pool not initialized", output)

    def test_active_source_prefers_local_checkout_over_pool(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Local source")

            fallback_skill_dir = root / ".agents/cache/universal-skills/skills/writing-skills"
            fallback_skill_dir.mkdir(parents=True, exist_ok=True)
            (fallback_skill_dir / "SKILL.md").write_text("# fallback\n", encoding="utf-8")

            self.assertEqual(module.active_source_repo_path(), root / ".agents/source/universal-skills")
            self.assertEqual(module.source_repo_path(), root / ".agents/source/universal-skills")

    def test_search_matches_name_and_body(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_source_skill(root, "markdownlint-skill", description="Lint markdown docs")

            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {"query": "markdown", "limit": 20, "selected": False, "runtime": None, "skills": None, "profile": None},
            )()
            with redirect_stdout(buffer):
                module.cmd_search(args)

            output = buffer.getvalue()
            self.assertIn("markdownlint-skill", output)
            self.assertNotIn("writing-skills [", output)

    def test_ensure_installs_missing_skill_without_persisting_manifest(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            args = type(
                "Args",
                (),
                {
                    "skill": "writing-skills",
                    "pull": False,
                    "persist": False,
                    "runtime": "codex",
                    "skills": None,
                    "profile": None,
                },
            )()

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                module.cmd_ensure(args)

            self.assertTrue((root / ".agents/skills/writing-skills/SKILL.md").exists())
            loaded = module.load_manifest()
            self.assertEqual(loaded["installs"], [{"app": "all", "profile": "core"}])


if __name__ == "__main__":
    unittest.main()
