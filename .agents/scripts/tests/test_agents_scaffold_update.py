import importlib.util
import io
import json
import os
import hashlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


def load_module(module_name: str, file_path: Path):
    script_dir = file_path.parent
    lib_dir = script_dir / "lib"
    for candidate in (script_dir, lib_dir):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))

    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


SCRIPT_PATH = Path(".agents/scripts/agents-scaffold-update.py").resolve()


class AgentsScaffoldUpdateTests(unittest.TestCase):
    @staticmethod
    def _load_with_root(root: Path):
        module = load_module(f"agents_scaffold_update_test_{uuid4_hex()}", SCRIPT_PATH)
        module.ROOT_DIR = root
        module.TARGET_AGENTS_DIR = root / ".agents"
        module.STAGING_ROOT = module.TARGET_AGENTS_DIR / "tmp" / "scaffold-update" / "staging"
        module.BACKUP_ROOT = module.TARGET_AGENTS_DIR / "tmp" / "scaffold-update" / "backups"
        return module

    @staticmethod
    def _write(path: Path, content: str):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    @staticmethod
    def _parse_plan_json(output: str) -> dict[str, object]:
        for line in output.splitlines():
            if line.startswith("PLAN_JSON: "):
                return json.loads(line.split("PLAN_JSON: ", 1)[1])
        raise AssertionError("PLAN_JSON line not found in output")

    def _write_target_baseline(self, module, root: Path, rel_paths: list[str]):
        managed_hashes: dict[str, str] = {}
        for rel in rel_paths:
            target_file = root / ".agents" / rel
            managed_hashes[rel] = module._sha256_file(target_file)

        manifest_payload = {
            "version": 1,
            "kernel": "agentic-cli-ts",
            "optional": True,
            "commands": {"status": ["s", "status"]},
            "managed_hashes": managed_hashes,
        }
        lock_payload = {
            "schema_version": 1,
            "revision": "e178aaf",
            "project": "f09-target",
            "locked": True,
            "managed_hashes": managed_hashes,
        }
        self._write(root / ".agents/manifest.json", json.dumps(manifest_payload, indent=2) + "\n")
        self._write(root / ".agents/lock.json", json.dumps(lock_payload, indent=2) + "\n")

    def _write_channel_metadata(
        self,
        module,
        source: Path,
        *,
        match_payload: bool,
        source_agents: Path | None = None,
        manifest_payload: dict[str, object] | None = None,
        lock_payload: dict[str, object] | None = None,
        bad_manifest_hash: bool = False,
    ):
        channel_file = source / "releases/channels/stable.json"
        channel_file.parent.mkdir(parents=True, exist_ok=True)

        source_agents = source_agents or source / ".agents"
        source_lock_payload = lock_payload or {
            "schema_version": 1,
            "revision": "e178aaf",
            "project": "f09-source",
            "locked": True,
        }
        source_manifest_payload = manifest_payload or {
            "version": 1,
            "kernel": "agentic-cli-ts",
            "optional": True,
            "commands": {"status": ["s", "status"]},
        }
        self._write(source_agents / "lock.json", json.dumps(source_lock_payload, indent=2) + "\n")
        self._write(source_agents / "manifest.json", json.dumps(source_manifest_payload, indent=2) + "\n")

        payload_sha = "0" * 64
        if match_payload:
            rel_paths = module._collect_payload_files(source_agents)
            payload_sha = module._payload_sha256(source_agents, rel_paths)

        release_tag = "v1.2.3"
        manifest_body = json.dumps({"release": release_tag}, sort_keys=True) + "\n"
        bom_body = json.dumps({"release": release_tag, "skills": []}, sort_keys=True) + "\n"
        manifest_path = self._write_bytes(source / f"releases/manifests/{release_tag}.json", manifest_body)
        manifest_hash = "f" * 64 if bad_manifest_hash else module._sha256_file(manifest_path)
        bom_hash = module._sha256_file(
            self._write_bytes(source / f"releases/boms/{release_tag}.skill-bom.json", bom_body)
        )
        self._write(source / f"releases/checksums/{release_tag}.sha256", f"{payload_sha}  source.tar.gz\n")

        payload = {
            "channel": "stable",
            "releaseTag": release_tag,
            "commit": "a" * 40,
            "sourceSha256": payload_sha,
            "scaffoldPayloadSha256": payload_sha,
            "releaseManifestSha256": manifest_hash,
            "skillBomSha256": bom_hash,
            "policy": {
                "allowFloatingRef": False,
                "requireSignedTag": True,
                "requireSourceChecksum": True,
                "requireReleaseManifest": True,
                "requireSkillBom": True,
            },
        }
        channel_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


    def _write_bytes(self, path: Path, content: str) -> Path:
        self._write(path, content)
        return path

    def test_plan_only_outputs_summary_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "old\n")
            self._write(source / ".agents/agents", "new\n")
            self._write(source / ".agents/scripts/tool.py", "print('ok')\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)
            self._write_target_baseline(module, root, ["agents"])

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--plan-only"])

            self.assertEqual(rc, 0)
            output = stream.getvalue()
            self.assertIn("SCAFFOLD UPDATE PLAN", output)
            self.assertIn("update: 3", output)
            self.assertIn("create: 1", output)
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_diff_only_shows_unified_diff_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "line-a\n")
            self._write(source / ".agents/agents", "line-b\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)
            self._write_target_baseline(module, root, ["agents"])

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--diff-only"])

            self.assertEqual(rc, 0)
            output = stream.getvalue()
            self.assertIn("--- a/.agents/agents", output)
            self.assertIn("+++ b/.agents/agents", output)
            self.assertIn("+line-b", output)
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_plan_classifies_ownership_and_preserves_non_managed_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            source_agents = source / ".agents"
            source_agents.mkdir(parents=True)

            self._write(source_agents / "agents", "managed-new\n")
            self._write(source_agents / "scripts/project_owned.py", "managed-project-owned\n")
            self._write(source_agents / "scripts/generated.py", "managed-generated\n")
            self._write(source_agents / "scripts/ignored.py", "managed-ignored\n")
            self._write(source_agents / "scripts/conflict.py", "managed-conflict\n")

            self._write(root / ".agents/agents", "managed-old\n")
            self._write(root / ".agents/scripts/project_owned.py", "user-project-owned\n")
            self._write(root / ".agents/scripts/generated.py", "user-generated\n")
            self._write(root / ".agents/scripts/ignored.py", "user-ignored\n")
            self._write(root / ".agents/scripts/conflict.py", "user-conflict\n")

            module = self._load_with_root(root)
            manifest = {
                "version": 1,
                "kernel": "agentic-cli-ts",
                "optional": True,
                "commands": {"status": ["s", "status"]},
                "ownership": {
                    "project-owned": ["scripts/project_owned.py"],
                    "generated": ["scripts/generated.py"],
                    "ignored": ["scripts/ignored.py"],
                    "conflict": ["scripts/conflict.py"],
                },
            }
            self._write_channel_metadata(
                module,
                source,
                match_payload=True,
                source_agents=source_agents,
                manifest_payload=manifest,
            )
            self._write_target_baseline(module, root, ["agents"])

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--plan-only"])

            self.assertEqual(rc, 0)
            output = stream.getvalue()
            self.assertIn("preserved-project-owned: 1", output)
            self.assertIn("preserved-generated: 1", output)
            self.assertIn("preserved-ignored: 1", output)
            self.assertIn("conflict: 1", output)

            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "managed-old\n")
            self.assertEqual((root / ".agents/scripts/project_owned.py").read_text(encoding="utf-8"), "user-project-owned\n")
            self.assertEqual((root / ".agents/scripts/generated.py").read_text(encoding="utf-8"), "user-generated\n")
            self.assertEqual((root / ".agents/scripts/ignored.py").read_text(encoding="utf-8"), "user-ignored\n")
            self.assertEqual((root / ".agents/scripts/conflict.py").read_text(encoding="utf-8"), "user-conflict\n")
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_apply_preserves_non_managed_and_updates_managed_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            source_agents = source / ".agents"
            source_agents.mkdir(parents=True)

            self._write(source_agents / "agents", "managed-new\n")
            self._write(source_agents / "scripts/project_owned.py", "managed-project-owned\n")
            self._write(source_agents / "scripts/generated.py", "managed-generated\n")
            self._write(source_agents / "scripts/ignored.py", "managed-ignored\n")

            self._write(root / ".agents/agents", "managed-old\n")
            self._write(root / ".agents/scripts/project_owned.py", "user-project-owned\n")
            self._write(root / ".agents/scripts/generated.py", "user-generated\n")
            self._write(root / ".agents/scripts/ignored.py", "user-ignored\n")

            module = self._load_with_root(root)
            manifest = {
                "version": 1,
                "kernel": "agentic-cli-ts",
                "optional": True,
                "commands": {"status": ["s", "status"]},
                "ownership": {
                    "project-owned": ["scripts/project_owned.py"],
                    "generated": ["scripts/generated.py"],
                    "ignored": ["scripts/ignored.py"],
                },
            }
            self._write_channel_metadata(
                module,
                source,
                match_payload=True,
                source_agents=source_agents,
                manifest_payload=manifest,
            )
            self._write_target_baseline(module, root, ["agents"])

            rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 0)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "managed-new\n")
            self.assertEqual((root / ".agents/scripts/project_owned.py").read_text(encoding="utf-8"), "user-project-owned\n")
            self.assertEqual((root / ".agents/scripts/generated.py").read_text(encoding="utf-8"), "user-generated\n")
            self.assertEqual((root / ".agents/scripts/ignored.py").read_text(encoding="utf-8"), "user-ignored\n")

            backup_dirs = list((root / ".agents/tmp/scaffold-update/backups").glob("*"))
            self.assertTrue(backup_dirs)
            self.assertTrue((backup_dirs[0] / "agents").exists())
            self.assertFalse((backup_dirs[0] / "scripts/project_owned.py").exists())
            staging_root = root / ".agents/tmp/scaffold-update/staging"
            if staging_root.exists():
                self.assertEqual(list(staging_root.iterdir()), [])

    def test_apply_happy_path_creates_backup_updates_content_and_cleans_staging(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "old\n")
            self._write(source / ".agents/agents", "new\n")
            self._write(source / ".agents/scripts/tool.py", "print('ok')\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)
            self._write_target_baseline(module, root, ["agents"])

            rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 0)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "new\n")
            self.assertTrue((root / ".agents/scripts/tool.py").exists())

            backup_dirs = list((root / ".agents/tmp/scaffold-update/backups").glob("*"))
            self.assertTrue(backup_dirs)
            self.assertTrue((backup_dirs[0] / "agents").exists())

            staging_root = root / ".agents/tmp/scaffold-update/staging"
            if staging_root.exists():
                self.assertEqual(list(staging_root.iterdir()), [])

    def test_source_repo_prefers_project_template_agents_payload(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)
            template_agents = source / "src/project-template/.agents"
            template_agents.mkdir(parents=True)

            self._write(root / ".agents/agents", "old\n")
            self._write(source / ".agents/agents", "wrong-root-payload\n")
            self._write(template_agents / "agents", "template-payload\n")
            self._write(template_agents / "tmp/pytest-scripts.log", "ignored runtime noise\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True, source_agents=template_agents)
            self._write_target_baseline(module, root, ["agents"])

            rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 0)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "template-payload\n")
            self.assertFalse((root / ".agents/tmp/pytest-scripts.log").exists())

    def test_rejects_bad_release_artifact_hash_without_writes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "old\n")
            self._write(source / ".agents/agents", "new\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True, bad_manifest_hash=True)

            with self.assertRaisesRegex(RuntimeError, "Release manifest hash mismatch"):
                module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "old\n")
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())

    def test_git_checkout_verifies_commit_and_signed_tag(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".git").mkdir(parents=True)
            module = self._load_with_root(root)
            metadata = module.ChannelMetadata(
                channel="stable",
                release_tag="v1.2.3",
                commit="a" * 40,
                source_sha256="b" * 64,
                scaffold_payload_sha256="b" * 64,
                release_manifest_sha256="c" * 64,
                skill_bom_sha256="d" * 64,
                metadata_file=source / "releases/channels/stable.json",
            )

            with mock.patch.object(
                module.subprocess,
                "run",
                side_effect=[
                    mock.Mock(returncode=0, stdout="a" * 40 + "\n", stderr=""),
                    mock.Mock(returncode=0, stdout="", stderr="good signature\n"),
                ],
            ) as run_mock:
                module._verify_git_commit_when_available(source, metadata)

            self.assertEqual(run_mock.call_args_list[0].args[0], ["git", "rev-parse", "HEAD"])
            self.assertEqual(run_mock.call_args_list[1].args[0], ["git", "tag", "-v", "v1.2.3"])

    def test_rejects_payload_outside_allowlist_without_writes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(source / ".agents/wb/unsafe.txt", "x\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=False)

            with self.assertRaisesRegex(RuntimeError, "outside scaffold allowlist"):
                module.main(["--source", str(source), "--channel", "stable", "--plan-only"])

            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_rolls_back_when_validation_command_fails_and_cleans_staging(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "old\n")
            self._write(source / ".agents/agents", "new\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)
            self._write_target_baseline(module, root, ["agents"])

            rc = module.main(
                [
                    "--source",
                    str(source),
                    "--channel",
                    "stable",
                    "--apply",
                    "--validate-command",
                    "python3 -c \"import sys; sys.exit(7)\"",
                ]
            )

            self.assertEqual(rc, 1)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "old\n")
            staging_root = root / ".agents/tmp/scaffold-update/staging"
            if staging_root.exists():
                self.assertEqual(list(staging_root.iterdir()), [])

    def test_rejects_symlink_payload_without_writes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            source_agents = source / ".agents"
            source_agents.mkdir(parents=True)

            real_file = source_agents / "scripts/real.py"
            self._write(real_file, "print('ok')\n")
            (source_agents / "scripts/link.py").symlink_to(real_file)

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=False)

            with self.assertRaisesRegex(RuntimeError, "symlink is not allowed"):
                module.main(["--source", str(source), "--channel", "stable", "--plan-only"])

            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_rejects_hardlink_payload_without_writes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            source_agents = source / ".agents"
            source_agents.mkdir(parents=True)

            original = source_agents / "scripts/original.py"
            alias = source_agents / "scripts/alias.py"
            self._write(original, "print('ok')\n")
            os.link(original, alias)

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=False)

            with self.assertRaisesRegex(RuntimeError, "hardlink is not allowed"):
                module.main(["--source", str(source), "--channel", "stable", "--plan-only"])

            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/staging").exists())

    def test_apply_blocks_managed_local_edit_when_target_diverges_from_baseline(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "managed-baseline\n")
            self._write(source / ".agents/agents", "managed-new\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)
            self._write_target_baseline(module, root, ["agents"])
            self._write(root / ".agents/agents", "user-edited\n")

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 1)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "user-edited\n")
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            plan_json = self._parse_plan_json(stream.getvalue())
            self.assertEqual(plan_json.get("status"), "conflict")
            self.assertEqual(plan_json.get("counts", {}).get("local-edit"), 1)

    def test_apply_blocks_managed_update_without_local_baseline_hash(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            (source / ".agents").mkdir(parents=True)

            self._write(root / ".agents/agents", "managed-old\n")
            self._write(source / ".agents/agents", "managed-new\n")

            module = self._load_with_root(root)
            self._write_channel_metadata(module, source, match_payload=True)

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 1)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "managed-old\n")
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            plan_json = self._parse_plan_json(stream.getvalue())
            self.assertEqual(plan_json.get("status"), "conflict")
            self.assertEqual(plan_json.get("counts", {}).get("local-edit"), 1)

    def test_apply_aborts_without_changes_when_plan_has_conflict(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            source = Path(td) / "source"
            (root / ".agents").mkdir(parents=True)
            source_agents = source / ".agents"
            source_agents.mkdir(parents=True)

            self._write(root / ".agents/agents", "managed-old\n")
            self._write(root / ".agents/scripts/conflict.py", "user-conflict\n")
            self._write(source_agents / "agents", "managed-new\n")
            self._write(source_agents / "scripts/conflict.py", "managed-conflict\n")
            self._write(source_agents / "scripts/new.py", "new-file\n")

            module = self._load_with_root(root)
            manifest = {
                "version": 1,
                "kernel": "agentic-cli-ts",
                "optional": True,
                "commands": {"status": ["s", "status"]},
                "ownership": {
                    "conflict": ["scripts/conflict.py"],
                },
            }
            self._write_channel_metadata(
                module,
                source,
                match_payload=True,
                source_agents=source_agents,
                manifest_payload=manifest,
            )
            self._write_target_baseline(module, root, ["agents"])

            stream = io.StringIO()
            with redirect_stdout(stream):
                rc = module.main(["--source", str(source), "--channel", "stable", "--apply"])

            self.assertEqual(rc, 1)
            self.assertEqual((root / ".agents/agents").read_text(encoding="utf-8"), "managed-old\n")
            self.assertFalse((root / ".agents/scripts/new.py").exists())
            self.assertFalse((root / ".agents/tmp/scaffold-update/backups").exists())
            plan_json = self._parse_plan_json(stream.getvalue())
            self.assertEqual(plan_json.get("status"), "conflict")
            self.assertEqual(plan_json.get("counts", {}).get("conflict"), 1)
            self.assertEqual(plan_json.get("mode"), "apply")

    def test_template_manifest_includes_default_ownership_and_hashes(self):
        manifest_path = Path("src/project-template/.agents/manifest.json").resolve()
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        ownership = payload.get("ownership")
        self.assertIsInstance(ownership, dict)
        self.assertTrue(ownership.get("project-owned"))
        self.assertTrue(ownership.get("generated"))
        self.assertTrue(ownership.get("ignored"))
        self.assertTrue(ownership.get("conflict"))
        managed_hashes = payload.get("managed_hashes")
        self.assertIsInstance(managed_hashes, dict)
        self.assertRegex(str(managed_hashes.get("agents", "")), r"^[a-f0-9]{64}$")

    def test_template_managed_hashes_match_template_files_and_lock(self):
        template_agents_dir = Path("src/project-template/.agents").resolve()
        manifest_path = template_agents_dir / "manifest.json"
        lock_path = template_agents_dir / "lock.json"

        manifest_payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        lock_payload = json.loads(lock_path.read_text(encoding="utf-8"))

        manifest_hashes = manifest_payload.get("managed_hashes")
        lock_hashes = lock_payload.get("managed_hashes")
        self.assertIsInstance(manifest_hashes, dict)
        self.assertIsInstance(lock_hashes, dict)
        self.assertEqual(manifest_hashes, lock_hashes)

        for rel_path, declared_hash in manifest_hashes.items():
            self.assertRegex(str(declared_hash), r"^[a-f0-9]{64}$")
            target_path = template_agents_dir / rel_path
            self.assertTrue(target_path.is_file(), f"Managed file missing: {rel_path}")
            actual_hash = hashlib.sha256(target_path.read_bytes()).hexdigest()
            self.assertEqual(
                declared_hash,
                actual_hash,
                f"Managed hash mismatch for {rel_path}",
            )

        root_script = Path(".agents/scripts/agents-scaffold-update.py").resolve()
        template_script = template_agents_dir / "scripts/agents-scaffold-update.py"
        self.assertTrue(root_script.is_file())
        self.assertTrue(template_script.is_file())
        self.assertEqual(
            hashlib.sha256(root_script.read_bytes()).hexdigest(),
            hashlib.sha256(template_script.read_bytes()).hexdigest(),
        )


def uuid4_hex() -> str:
    import uuid

    return uuid.uuid4().hex


if __name__ == "__main__":
    unittest.main()
