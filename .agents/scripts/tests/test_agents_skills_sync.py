import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


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
            "external_source_dir": "",
            "proposal_branch_prefix": "skills-sync",
            "project_dir": ".agents/skills",
            "manifest_file": ".agents/skills-sync.manifest.json",
            "upstream_skills_dir": "skills",
            "default_profile": "core",
            "runtime_targets": ["all", "opencode", "codex"],
            "mode": "copy",
            "default_skills": ["agentic-folder-sys", "agentic-scaffold-mcp"],
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

    def _seed_source_repo(
        self,
        root: Path,
        *,
        source_dir: str = ".agents/source/universal-skills",
        index: str = "{}\n",
    ) -> Path:
        source_root = root / source_dir
        (source_root / "skills").mkdir(parents=True, exist_ok=True)
        (source_root / "profiles").mkdir(parents=True, exist_ok=True)
        (source_root / "index.json").write_text(index, encoding="utf-8")
        return source_root

    def _write_release_channel(
        self,
        source_root: Path,
        *,
        channel: str = "stable",
        release_tag: str = "v1.2.3",
        commit: str = "a" * 40,
        source_sha256: str = "b" * 64,
        bom_body: str | None = None,
    ) -> dict:
        manifest_body = json.dumps({"release": release_tag, "artifacts": []}, sort_keys=True) + "\n"
        bom_body = (
            bom_body or json.dumps({"release": release_tag, "skills": []}, sort_keys=True) + "\n"
        )
        releases = source_root / "releases"
        manifest_path = releases / "manifests" / f"{release_tag}.json"
        bom_path = releases / "boms" / f"{release_tag}.skill-bom.json"
        checksum_path = releases / "checksums" / f"{release_tag}.sha256"
        channel_path = releases / "channels" / f"{channel}.json"
        for parent in [
            manifest_path.parent,
            bom_path.parent,
            checksum_path.parent,
            channel_path.parent,
        ]:
            parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(manifest_body, encoding="utf-8")
        bom_path.write_text(bom_body, encoding="utf-8")
        checksum_path.write_text(f"{source_sha256}  source.tar.gz\n", encoding="utf-8")
        channel_data = {
            "channel": channel,
            "releaseTag": release_tag,
            "commit": commit,
            "sourceSha256": source_sha256,
            "releaseManifestSha256": hashlib.sha256(manifest_body.encode("utf-8")).hexdigest(),
            "skillBomSha256": hashlib.sha256(bom_body.encode("utf-8")).hexdigest(),
            "generatedAt": "2026-05-15T00:00:00Z",
            "policy": {
                "allowFloatingRef": False,
                "requireSignedTag": True,
                "requireReleaseManifest": True,
                "requireSkillBom": True,
                "requireSourceChecksum": True,
            },
        }
        channel_path.write_text(
            json.dumps(channel_data, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return channel_data

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
            self.assertEqual(loaded["source_dir"], ".agents/source/universal-skills")
            installs = loaded["installs"]
            self.assertEqual(
                installs, [{"app": "all", "skills": ["markdownlint-skill", "writing-skills"]}]
            )

    def test_default_source_dir_is_repo_local(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            module.CONFIG = {}

            self.assertEqual(module.cfg("source_dir"), ".agents/source/universal-skills")
            self.assertEqual(
                module.preferred_source_repo_path(), root / ".agents/source/universal-skills"
            )

    def test_default_manifest_combines_profile_and_default_skills(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)

            manifest = module._default_manifest()

            self.assertIn({"app": "all", "profile": "core"}, manifest["installs"])
            self.assertIn(
                {"app": "all", "skills": ["agentic-folder-sys", "agentic-scaffold-mcp"]},
                manifest["installs"],
            )

    def test_resolve_runtime_and_profile_semantics(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills")
            self._make_source_skill(root, "markdownlint-skill")
            self._make_source_skill(root, "bun-skill")
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

    def test_rejects_cli_skill_path_traversal_before_overwrite(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            malicious_source = root / ".agents/source/universal-skills/scripts"
            malicious_source.mkdir(parents=True, exist_ok=True)
            (malicious_source / "SKILL.md").write_text("# malicious\n", encoding="utf-8")
            protected_scripts = root / ".agents/scripts"
            protected_scripts.mkdir(parents=True, exist_ok=True)
            sentinel = protected_scripts / "sentinel.txt"
            sentinel.write_text("keep\n", encoding="utf-8")

            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "skills": ["writing-skills"]}],
                }
            )

            args = type("Args", (), {"skills": "../scripts", "runtime": None, "profile": None})()
            with self.assertRaisesRegex(RuntimeError, "Invalid skill name '../scripts'"):
                module.cmd_apply(args)

            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep\n")
            self.assertFalse((protected_scripts / "SKILL.md").exists())

    def test_rejects_profile_skill_path_traversal_before_overwrite(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            malicious_source = root / ".agents/source/universal-skills/scripts"
            malicious_source.mkdir(parents=True, exist_ok=True)
            (malicious_source / "SKILL.md").write_text("# malicious\n", encoding="utf-8")
            self._make_profile(root, "core", ["../scripts"])
            protected_scripts = root / ".agents/scripts"
            protected_scripts.mkdir(parents=True, exist_ok=True)
            sentinel = protected_scripts / "sentinel.txt"
            sentinel.write_text("keep\n", encoding="utf-8")

            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            args = type("Args", (), {"skills": None, "runtime": None, "profile": None})()
            with self.assertRaisesRegex(RuntimeError, "Invalid skill name '../scripts'"):
                module.cmd_apply(args)

            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep\n")
            self.assertFalse((protected_scripts / "SKILL.md").exists())

    def test_apply_rejects_existing_destination_symlink_escape(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            outside = Path(td) / "outside"
            outside.mkdir()
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills")
            self._make_profile(root, "core", ["writing-skills"])
            project_skills = root / ".agents/skills"
            project_skills.mkdir(parents=True, exist_ok=True)
            (project_skills / "writing-skills").symlink_to(outside, target_is_directory=True)

            with self.assertRaisesRegex(RuntimeError, "Destination skill path must stay within"):
                module.apply_skill("writing-skills")

            self.assertTrue((project_skills / "writing-skills").is_symlink())

    def test_apply_rejects_symlink_inside_source_skill_payload(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            skill_dir = self._make_source_skill(root, "writing-skills")
            (skill_dir / "references").mkdir(parents=True, exist_ok=True)
            (skill_dir / "references" / "note.md").write_text("content\n", encoding="utf-8")
            (skill_dir / "README.md").symlink_to(skill_dir / "references" / "note.md")

            with self.assertRaisesRegex(RuntimeError, "symlink is not allowed"):
                module.apply_skill("writing-skills")

    def test_apply_rejects_hardlink_inside_source_skill_payload(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            skill_dir = self._make_source_skill(root, "writing-skills")
            source_file = skill_dir / "details.md"
            source_file.write_text("payload\n", encoding="utf-8")
            hardlink_file = skill_dir / "details-copy.md"
            os.link(source_file, hardlink_file)

            with self.assertRaisesRegex(RuntimeError, "hardlink is not allowed"):
                module.apply_skill("writing-skills")

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

            self.assertIn(
                {"app": "codex", "skills": ["writing-skills", "markdownlint-skill"]},
                manifest["installs"],
            )
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
            self.assertIn("WARN: skills source not initialized", output)

    def test_cmd_check_warns_for_stale_manifest_entries_and_local_extras(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills")
            self._make_profile(root, "core", ["writing-skills"])

            project_root = root / ".agents" / "skills"
            (project_root / "writing-skills").mkdir(parents=True, exist_ok=True)
            source_skill = root / ".agents/source/universal-skills/skills/writing-skills/SKILL.md"
            (project_root / "writing-skills" / "SKILL.md").write_text(
                source_skill.read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            (project_root / "local-only-skill").mkdir(parents=True, exist_ok=True)
            (project_root / "local-only-skill" / "SKILL.md").write_text(
                "---\nname: local-only-skill\ndescription: Local extra\n---\n\n# local-only-skill\n",
                encoding="utf-8",
            )

            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [
                        {"app": "all", "profile": "core"},
                        {"app": "all", "skills": ["stale-skill"]},
                    ],
                }
            )

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                module.cmd_check(
                    type("Args", (), {"skills": None, "runtime": None, "profile": None})()
                )

            output = buffer.getvalue()
            self.assertIn("WARN: stale-manifest-entry: stale-skill", output)
            self.assertIn("WARN: local-extra: local-only-skill", output)
            self.assertNotIn("ERROR: source-drift (selected set): stale-skill", output)
            self.assertNotIn("WARN: skills sync is not fully aligned", output)

    def test_cmd_check_keeps_profile_source_drift_as_error(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_profile(root, "core", ["missing-profile-skill"])

            buffer = io.StringIO()
            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            with redirect_stdout(buffer):
                module.cmd_check(
                    type("Args", (), {"skills": None, "runtime": None, "profile": None})()
                )

            output = buffer.getvalue()
            self.assertIn("ERROR: source-drift (selected set): missing-profile-skill", output)
            self.assertIn("WARN: skills sync is not fully aligned", output)

    def test_ensure_repo_cloned_accepts_repo_local_source_without_remote(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            source_root = root / ".agents/source/universal-skills"
            (source_root / "index.json").write_text("{}\n", encoding="utf-8")

            with mock.patch.object(module, "run") as patched_run:
                module.ensure_repo_cloned({"repo": "", "ref": "main"})

            patched_run.assert_not_called()

    def test_cmd_pull_skips_when_only_repo_local_seed_exists(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            source_root = root / ".agents/source/universal-skills"
            (source_root / "index.json").write_text("{}\n", encoding="utf-8")

            manifest = {
                "version": 2,
                "repo": "",
                "ref": "main",
                "installs": [{"app": "all", "profile": "core"}],
            }

            buffer = io.StringIO()

            with (
                mock.patch.object(module, "load_manifest", return_value=manifest),
                mock.patch.object(module, "run") as patched_run,
                redirect_stdout(buffer),
            ):
                module.cmd_pull(type("Args", (), {})())

            patched_run.assert_not_called()
            self.assertIn("source refresh skipped", buffer.getvalue())

    def test_active_source_uses_repo_local_seed_without_cache_fallback(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._make_source_skill(root, "writing-skills", description="Local source")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self.assertEqual(
                module.active_source_repo_path(), root / ".agents/source/universal-skills"
            )

    def test_active_source_uses_external_source_when_repo_local_seed_is_partial(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            self._make_source_skill(root, "writing-skills", description="Partial local source")
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External source",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")

            self.assertEqual(module.active_source_repo_path(), external_root)
            self.assertEqual(module.source_repo_path(), external_root)

    def test_search_matches_name_and_body(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_source_skill(root, "markdownlint-skill", description="Lint markdown docs")
            self._make_profile(root, "core", ["writing-skills", "markdownlint-skill"])

            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {
                    "query": "markdown",
                    "limit": 20,
                    "selected": False,
                    "runtime": None,
                    "skills": None,
                    "profile": None,
                },
            )()
            with redirect_stdout(buffer):
                module.cmd_search(args)

            output = buffer.getvalue()
            self.assertIn("markdownlint-skill", output)
            self.assertNotIn("writing-skills [", output)

    def test_search_prefers_configured_external_catalog_over_seed_subset(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Local seed only")
            self._make_profile(root, "core", ["writing-skills"])

            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External catalog support",
                source_dir="external-universal-skills",
            )
            self._make_source_skill(
                Path(td),
                "markdownlint-skill",
                description="Lint markdown docs",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills", "markdownlint-skill"],
                source_dir="external-universal-skills",
            )

            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {
                    "query": "markdown",
                    "limit": 20,
                    "selected": False,
                    "runtime": None,
                    "skills": None,
                    "profile": None,
                },
            )()
            with redirect_stdout(buffer):
                module.cmd_search(args)

            output = buffer.getvalue()
            self.assertIn("markdownlint-skill", output)
            self.assertIn(str(external_root), output)

    def test_ensure_installs_missing_skill_without_persisting_manifest(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_profile(root, "core", ["writing-skills"])
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

    def test_ensure_uses_external_catalog_when_seed_lacks_skill(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Local seed only")
            self._make_profile(root, "core", ["writing-skills"])

            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External catalog support",
                source_dir="external-universal-skills",
            )
            self._make_source_skill(
                Path(td),
                "markdownlint-skill",
                description="Lint markdown docs",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills", "markdownlint-skill"],
                source_dir="external-universal-skills",
            )

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
                    "skill": "markdownlint-skill",
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

            self.assertTrue((root / ".agents/skills/markdownlint-skill/SKILL.md").exists())
            self.assertIn("APPLIED: markdownlint-skill", buffer.getvalue())

    def test_cmd_pull_refreshes_external_git_source_when_configured(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text(
                '{"generated_by":"git-source"}\n', encoding="utf-8"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            args = type("Args", (), {})()
            buffer = io.StringIO()
            with (
                mock.patch.object(module, "run") as patched_run,
                redirect_stdout(buffer),
            ):
                module.cmd_pull(args)

            self.assertEqual(
                patched_run.call_args_list,
                [
                    mock.call(["git", "fetch", "origin"], cwd=external_root),
                    mock.call(["git", "checkout", "main"], cwd=external_root),
                    mock.call(["git", "pull", "--ff-only", "origin", "main"], cwd=external_root),
                ],
            )
            output = buffer.getvalue()
            self.assertIn("updated git skills source", output)

    def test_cmd_pull_records_external_source_metadata(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text(
                '{"generated_by":"git-source"}\n', encoding="utf-8"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

            manifest = {
                "version": 2,
                "repo": "https://github.com/example/skill-universal.git",
                "ref": "release/main",
                "mode": "copy",
                "installs": [{"app": "all", "profile": "core"}],
            }
            module.save_manifest(manifest)

            args = type("Args", (), {})()
            with (
                mock.patch.object(module, "run") as patched_run,
                mock.patch.object(module, "_git_head_ref", return_value="release/main"),
                mock.patch.object(module, "_git_head_commit", return_value="abc123"),
            ):
                module.cmd_pull(args)

            self.assertEqual(patched_run.call_count, 3)
            loaded = module.load_manifest()
            source = loaded.get("source", {})
            self.assertEqual(source.get("path"), str(external_root))
            self.assertEqual(source.get("ref"), "release/main")
            self.assertEqual(source.get("branch"), "release/main")
            self.assertEqual(source.get("commit"), "abc123")

    def test_cmd_pull_with_channel_uses_disposable_worktree_without_checkouting_external_repo(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text(
                '{"generated_by":"git-source"}\n', encoding="utf-8"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            commit = "a" * 40
            self._write_release_channel(external_root, commit=commit)

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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with (
                mock.patch.object(module, "run") as patched_run,
                mock.patch.object(module, "_git_head_ref", return_value="HEAD"),
                mock.patch.object(module, "_git_head_commit", return_value=commit),
            ):
                module.cmd_pull(args)

            self.assertEqual(patched_run.call_count, 3)
            self.assertEqual(
                patched_run.call_args_list[0],
                mock.call(["git", "fetch", "origin"], cwd=external_root),
            )
            self.assertEqual(
                patched_run.call_args_list[1],
                mock.call(["git", "tag", "-v", "v1.2.3"], cwd=external_root),
            )
            worktree_call = patched_run.call_args_list[2]
            worktree_cmd = worktree_call.args[0]
            self.assertEqual(worktree_call.kwargs.get("cwd"), external_root)
            self.assertEqual(worktree_cmd[:4], ["git", "worktree", "add", "--detach"])
            self.assertEqual(worktree_cmd[-1], "v1.2.3")
            self.assertTrue(
                str(worktree_cmd[4]).startswith(str(root / ".agents/tmp/skills-sync-worktrees"))
            )
            self.assertFalse(
                any(
                    call.kwargs.get("cwd") == external_root
                    and call.args[0][:2] == ["git", "checkout"]
                    for call in patched_run.call_args_list
                )
            )
            loaded = module.load_manifest()
            self.assertEqual(loaded["ref"], "v1.2.3")
            self.assertEqual(loaded["channel"], "stable")
            verification = loaded.get("source", {}).get("verification", {})
            self.assertEqual(verification.get("channel"), "stable")
            self.assertEqual(verification.get("releaseTag"), "v1.2.3")
            self.assertEqual(verification.get("commit"), commit)
            self.assertIn(
                ".agents/tmp/skills-sync-worktrees", loaded.get("source", {}).get("path", "")
            )

    def test_cmd_pull_with_channel_rejects_invalid_channel_name(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
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
                "Args", (), {"channel": "Stable!", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run") as patched_run:
                with self.assertRaisesRegex(RuntimeError, "Invalid release channel"):
                    module.cmd_pull(args)
            self.assertEqual(patched_run.call_count, 0)

    def test_cmd_pull_with_channel_rejects_release_tag_mismatch(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
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
                {"channel": "stable", "release_tag": "v9.9.9", "allow_floating_ref": False},
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "does not point to v9.9.9"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_bad_bom_hash(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            (external_root / "releases/boms/v1.2.3.skill-bom.json").write_text(
                '{"release":"v1.2.3","skills":["tampered"]}\n',
                encoding="utf-8",
            )
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "skill BOM hash mismatch"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_manifest_hash_mismatch(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            (external_root / "releases/manifests/v1.2.3.json").write_text(
                '{"release":"v1.2.3","artifacts":["tampered"]}\n',
                encoding="utf-8",
            )
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "manifest hash mismatch"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_source_checksum_mismatch(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            (external_root / "releases/checksums/v1.2.3.sha256").write_text(
                f"{'c' * 64}  source.tar.gz\n",
                encoding="utf-8",
            )
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "source checksum mismatch"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_commit_mismatch(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root, commit="a" * 40)
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with (
                mock.patch.object(module, "run"),
                mock.patch.object(module, "_git_head_commit", side_effect=["b" * 40, "b" * 40]),
            ):
                with self.assertRaisesRegex(RuntimeError, "commit mismatch"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_missing_require_signed_tag(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            channel_path = external_root / "releases/channels/stable.json"
            data = json.loads(channel_path.read_text(encoding="utf-8"))
            data["policy"]["requireSignedTag"] = False
            channel_path.write_text(
                json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "must require signed tags"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_rejects_unverifiable_signed_tag(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            def fail_tag_verify(cmd, cwd=None):
                if cmd[:3] == ["git", "tag", "-v"]:
                    raise RuntimeError("bad signature")

            args = type(
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run", side_effect=fail_tag_verify) as patched_run:
                with self.assertRaisesRegex(RuntimeError, "bad signature"):
                    module.cmd_pull(args)

            self.assertFalse(
                any(
                    call.args[0][:4] == ["git", "worktree", "add", "--detach"]
                    for call in patched_run.call_args_list
                )
            )

    def test_cmd_pull_with_channel_rejects_missing_require_source_checksum(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root)
            channel_path = external_root / "releases/channels/stable.json"
            data = json.loads(channel_path.read_text(encoding="utf-8"))
            data["policy"]["requireSourceChecksum"] = False
            channel_path.write_text(
                json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with mock.patch.object(module, "run"):
                with self.assertRaisesRegex(RuntimeError, "must require source checksum"):
                    module.cmd_pull(args)

    def test_cmd_pull_with_channel_failure_does_not_checkout_external_repo_for_restore(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._seed_source_repo(root)
            self._seed_source_repo(Path(td), source_dir="external-universal-skills")
            self._make_source_skill(
                Path(td), "writing-skills", source_dir="external-universal-skills"
            )
            self._make_profile(
                Path(td), "core", ["writing-skills"], source_dir="external-universal-skills"
            )
            (external_root / ".git").mkdir(parents=True, exist_ok=True)
            self._write_release_channel(external_root, commit="a" * 40)
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
                "Args", (), {"channel": "stable", "release_tag": None, "allow_floating_ref": False}
            )()
            with (
                mock.patch.object(module, "run") as patched_run,
                mock.patch.object(module, "_git_head_commit", return_value="b" * 40),
            ):
                with self.assertRaisesRegex(RuntimeError, "commit mismatch"):
                    module.cmd_pull(args)

            self.assertEqual(patched_run.call_count, 3)
            self.assertEqual(
                patched_run.call_args_list[0],
                mock.call(["git", "fetch", "origin"], cwd=external_root),
            )
            self.assertEqual(
                patched_run.call_args_list[1],
                mock.call(["git", "tag", "-v", "v1.2.3"], cwd=external_root),
            )
            self.assertEqual(patched_run.call_args_list[2].kwargs.get("cwd"), external_root)
            self.assertEqual(
                patched_run.call_args_list[2].args[0][:4], ["git", "worktree", "add", "--detach"]
            )
            self.assertFalse(
                any(
                    call.kwargs.get("cwd") == external_root
                    and call.args[0][:2] == ["git", "checkout"]
                    for call in patched_run.call_args_list
                )
            )

    def test_cmd_sync_updates_project_from_external_source_without_refreshing(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                }
            )

            args = type("Args", (), {"skills": None, "runtime": None, "profile": None})()
            with mock.patch.object(module, "run") as patched_run:
                module.cmd_sync(args)

            self.assertEqual(patched_run.call_count, 0)
            project_doc = (root / ".agents/skills/writing-skills/SKILL.md").read_text(
                encoding="utf-8"
            )
            source_doc = (
                root / ".agents/source/universal-skills/skills/writing-skills/SKILL.md"
            ).read_text(encoding="utf-8")
            self.assertIn("External version", project_doc)
            self.assertIn("Local seed", source_doc)

    def test_cmd_sync_with_pull_refreshes_external_source(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)
            self._make_source_skill(root, "writing-skills", description="Local seed")
            self._make_profile(root, "core", ["writing-skills"])
            (root / ".agents/source/universal-skills/index.json").write_text(
                "{}\n", encoding="utf-8"
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

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
                "Args", (), {"skills": None, "runtime": None, "profile": None, "pull": True}
            )()
            with mock.patch.object(module, "run") as patched_run:
                module.cmd_sync(args)

            self.assertEqual(patched_run.call_count, 3)

    def test_mirror_skills_to_local_source_copies_index_and_profiles(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="External version",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text(
                '{"generated_by":"git-source"}\n', encoding="utf-8"
            )

            module.mirror_skills_to_local_source(external_root, ["writing-skills"])

            mirrored_index = json.loads(
                (root / ".agents/source/universal-skills/index.json").read_text(encoding="utf-8")
            )
            mirrored_profile = json.loads(
                (root / ".agents/source/universal-skills/profiles/core.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(mirrored_index["generated_by"], "agents-skills-sync local source")
            self.assertEqual(mirrored_index["profiles"], ["core"])
            self.assertEqual(
                [entry["name"] for entry in mirrored_index["skills"]], ["writing-skills"]
            )
            self.assertEqual(mirrored_profile, {"name": "core", "skills": ["writing-skills"]})
            self.assertIn(
                "External version",
                (root / ".agents/source/universal-skills/skills/writing-skills/SKILL.md").read_text(
                    encoding="utf-8"
                ),
            )

    def test_cmd_push_requires_external_git_source(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)

            project_skill = root / ".agents/skills/writing-skills"
            project_skill.mkdir(parents=True, exist_ok=True)
            (project_skill / "SKILL.md").write_text(
                "---\nname: writing-skills\ndescription: Edited locally\n---\n\n# writing-skills\n\nEdited locally\n",
                encoding="utf-8",
            )

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
                    "skills": None,
                    "runtime": None,
                    "profile": None,
                    "commit": False,
                    "push": False,
                    "message": None,
                },
            )()

            with self.assertRaisesRegex(RuntimeError, "external skills source"):
                module.cmd_push(args)

    def test_cmd_push_commits_and_pushes_proposal_branch_not_main(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            project_skill = root / ".agents/skills/writing-skills"
            project_skill.mkdir(parents=True, exist_ok=True)
            (project_skill / "SKILL.md").write_text(
                "---\nname: writing-skills\ndescription: Edited locally\n---\n\n# writing-skills\n\nEdited locally\n",
                encoding="utf-8",
            )

            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="Old external source",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

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
                    "skills": None,
                    "runtime": None,
                    "profile": None,
                    "base": None,
                    "branch": "skills-sync/propose-writing-skills",
                    "commit": True,
                    "push": True,
                    "pr": False,
                    "message": "Publish writing skill",
                    "title": None,
                    "body": None,
                },
            )()

            with (
                mock.patch.object(module, "run") as patched_run,
                mock.patch.object(module, "_git_ref_exists", return_value=False),
            ):
                module.cmd_push(args)

            self.assertEqual(
                patched_run.call_args_list,
                [
                    mock.call(["git", "fetch", "origin"], cwd=external_root),
                    mock.call(
                        [
                            "git",
                            "checkout",
                            "-b",
                            "skills-sync/propose-writing-skills",
                            "origin/main",
                        ],
                        cwd=external_root,
                    ),
                    mock.call(["git", "add", "--", "skills/writing-skills"], cwd=external_root),
                    mock.call(
                        [
                            "git",
                            "commit",
                            "-m",
                            "Publish writing skill\n\nCo-authored-by: Codex <noreply@openai.com>",
                            "--only",
                            "--",
                            "skills/writing-skills",
                        ],
                        cwd=external_root,
                    ),
                    mock.call(
                        ["git", "push", "-u", "origin", "HEAD:skills-sync/propose-writing-skills"],
                        cwd=external_root,
                    ),
                ],
            )

    def test_cmd_push_rejects_protected_branch_target(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            project_skill = root / ".agents/skills/writing-skills"
            project_skill.mkdir(parents=True, exist_ok=True)
            (project_skill / "SKILL.md").write_text(
                "---\nname: writing-skills\ndescription: Edited locally\n---\n\n# writing-skills\n\nEdited locally\n",
                encoding="utf-8",
            )
            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="Old external source",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

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
                    "skills": None,
                    "runtime": None,
                    "profile": None,
                    "base": None,
                    "branch": "main",
                    "commit": True,
                    "push": True,
                    "pr": False,
                    "message": None,
                    "title": None,
                    "body": None,
                },
            )()

            with self.assertRaisesRegex(RuntimeError, "protected branch"):
                module.cmd_push(args)

    def test_checkout_proposal_branch_preserves_existing_local_branch(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)

            with (
                mock.patch.object(module, "_git_ref_exists", side_effect=[True]),
                mock.patch.object(module, "run") as patched_run,
            ):
                module._checkout_proposal_branch(root, "skills-sync/writing-skills", "main")

            patched_run.assert_called_once_with(
                ["git", "checkout", "skills-sync/writing-skills"], cwd=root
            )

    def test_append_codex_trailer_is_idempotent(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            module = self._load_with_root(Path(td))
            base = "Publish writing skill"
            with_trailer = "Publish writing skill\n\nCo-authored-by: Codex <noreply@openai.com>"

            self.assertEqual(
                module._append_codex_trailer(base),
                with_trailer,
            )
            self.assertEqual(
                module._append_codex_trailer(with_trailer),
                with_trailer,
            )

    def test_cmd_push_keeps_existing_codex_trailer(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td) / "repo"
            root.mkdir()
            external_root = Path(td) / "external-universal-skills"
            module = self._load_with_root(root)
            module.CONFIG["skills_sync"]["external_source_dir"] = str(external_root)

            project_skill = root / ".agents/skills/writing-skills"
            project_skill.mkdir(parents=True, exist_ok=True)
            (project_skill / "SKILL.md").write_text(
                "---\nname: writing-skills\ndescription: Edited locally\n---\n\n# writing-skills\n\nEdited locally\n",
                encoding="utf-8",
            )
            self._make_source_skill(
                Path(td),
                "writing-skills",
                description="Old external source",
                source_dir="external-universal-skills",
            )
            self._make_profile(
                Path(td),
                "core",
                ["writing-skills"],
                source_dir="external-universal-skills",
            )
            (external_root / "index.json").write_text("{}\n", encoding="utf-8")
            (external_root / ".git").mkdir(parents=True, exist_ok=True)

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
                    "skills": None,
                    "runtime": None,
                    "profile": None,
                    "base": None,
                    "branch": "skills-sync/propose-writing-skills",
                    "commit": True,
                    "push": False,
                    "pr": False,
                    "message": "Publish writing skill\n\nCo-authored-by: Codex <noreply@openai.com>",
                    "title": None,
                    "body": None,
                },
            )()

            with (
                mock.patch.object(module, "run") as patched_run,
                mock.patch.object(module, "_git_ref_exists", return_value=False),
            ):
                module.cmd_push(args)

            self.assertEqual(
                patched_run.call_args_list[3].args[0],
                [
                    "git",
                    "commit",
                    "-m",
                    "Publish writing skill\n\nCo-authored-by: Codex <noreply@openai.com>",
                    "--only",
                    "--",
                    "skills/writing-skills",
                ],
            )

    def test_cmd_list_with_metadata_shows_manifest_status(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_profile(root, "core", ["writing-skills"])
            module.save_manifest(
                {
                    "version": 2,
                    "repo": "https://github.com/example/skill-universal.git",
                    "ref": "main",
                    "mode": "copy",
                    "installs": [{"app": "all", "profile": "core"}],
                    "skill_metadata": {
                        "writing-skills": {
                            "status": "preferred",
                            "note": "baseline",
                        }
                    },
                }
            )

            buffer = io.StringIO()
            args = type(
                "Args",
                (),
                {
                    "selected": False,
                    "installed": False,
                    "metadata": True,
                    "runtime": None,
                    "skills": None,
                    "profile": None,
                },
            )()
            with redirect_stdout(buffer):
                module.cmd_list(args)

            output = buffer.getvalue()
            self.assertIn("writing-skills", output)
            self.assertIn("status=preferred", output)
            self.assertIn("desc: Write and improve skills", output)

    def test_cmd_get_prints_skill_metadata(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_profile(root, "core", ["writing-skills"])

            buffer = io.StringIO()
            with redirect_stdout(buffer):
                module.cmd_get(type("Args", (), {"skill": "writing-skills"})())

            output = buffer.getvalue()
            self.assertIn("SKILL", output)
            self.assertIn("- name: writing-skills", output)
            self.assertIn("- source_exists: True", output)
            self.assertIn("- description: Write and improve skills", output)

    def test_cmd_update_metadata_persists_entry(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            self._seed_source_repo(root)
            self._make_source_skill(root, "writing-skills", description="Write and improve skills")
            self._make_profile(root, "core", ["writing-skills"])
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
                    "status": "candidate",
                    "note": "needs review",
                    "clear_note": False,
                },
            )()
            module.cmd_update(args)

            loaded = module.load_manifest()
            self.assertEqual(loaded["skill_metadata"]["writing-skills"]["status"], "candidate")
            self.assertEqual(loaded["skill_metadata"]["writing-skills"]["note"], "needs review")
            self.assertIn("updated_at", loaded["skill_metadata"]["writing-skills"])

    def test_cmd_update_metadata_requires_known_skill_without_create(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            module.save_manifest(module._default_manifest())

            args = type(
                "Args",
                (),
                {
                    "skill": "ghost-skill",
                    "status": "candidate",
                    "note": "needs review",
                    "clear_note": False,
                    "create": False,
                },
            )()

            with self.assertRaisesRegex(RuntimeError, "--create"):
                module.cmd_update(args)

            loaded = module.load_manifest()
            self.assertNotIn("skill_metadata", loaded)

    def test_cmd_update_metadata_create_allows_new_skill_entry(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            module = self._load_with_root(root)
            module.save_manifest(module._default_manifest())

            args = type(
                "Args",
                (),
                {
                    "skill": "ghost-skill",
                    "status": "candidate",
                    "note": "needs review",
                    "clear_note": False,
                    "create": True,
                },
            )()

            module.cmd_update(args)

            loaded = module.load_manifest()
            self.assertEqual(loaded["skill_metadata"]["ghost-skill"]["status"], "candidate")
            self.assertEqual(loaded["skill_metadata"]["ghost-skill"]["note"], "needs review")
            self.assertIn("updated_at", loaded["skill_metadata"]["ghost-skill"])


if __name__ == "__main__":
    unittest.main()
