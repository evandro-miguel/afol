import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
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


class RuntimeCompatibilityTests(unittest.TestCase):
    def test_sync_targets_include_opencode(self):
        script_path = Path(".agents/scripts/sync-agent-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        sync_agent_docs = load_module("sync_agent_docs_runtime_test", script_path)

        target_names = [path.name for path in sync_agent_docs.AGENT_FILES]
        self.assertIn("OPENCODE.md", target_names)

    def test_fix_symlinks_includes_opencode_runtime(self):
        script_path = Path(".agents/scripts/agents-fix-symlinks.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        fix_symlinks = load_module("agents_fix_symlinks_runtime_test", script_path)

        self.assertIn(".opencode", fix_symlinks.AGENT_DIRS)

    def test_bootstrap_mandatory_files_include_opencode_adapter(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_runtime_test", script_path)

        mandatory_files = {str(path) for path in agents_bootstrap.MANDATORY_FILES_TO_COPY}
        mandatory_dirs = {str(path) for path in agents_bootstrap.MANDATORY_DIRS_TO_COPY}
        ensure_dirs = {str(path) for path in agents_bootstrap.ENSURE_DIRS}
        generated_files = {str(path) for path in agents_bootstrap.generated_baseline_content("2026-03-23T00:00:00Z")}

        self.assertIn("OPENCODE.md", mandatory_files)
        self.assertIn("PLANS.md", mandatory_files)
        self.assertIn("opencode.json", mandatory_files)
        self.assertIn(".agents/arc/SPECS/README.md", mandatory_files)
        self.assertIn(".agents/tmp", ensure_dirs)
        self.assertIn(".opencode", ensure_dirs)
        self.assertIn(".opencode/agent", ensure_dirs)
        self.assertIn(".agents/arc/GENERAL-ROADMAP.md", generated_files)
        self.assertIn(".agents/arc/SPECS/INDEX.md", generated_files)
        self.assertNotIn(".agents/arc/SPECS", mandatory_dirs)

    def test_bootstrap_tolerates_optional_skills_sync_failure(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_optional_sync_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            calls = []

            def fake_run(cmd, cwd=None):
                calls.append(cmd)
                result = mock.Mock()
                if cmd[:3] == ["./.agents/agents", "skills-sync", "sync"]:
                    result.returncode = 1
                else:
                    result.returncode = 0
                return result

            with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                agents_bootstrap.run_post_checks(target)

            self.assertIn(["./.agents/agents", "skills-sync", "sync"], calls)
            self.assertIn(["make", "-f", ".agents/a-docs/standards/Makefile", "all"], calls)

    def test_opencode_project_config_is_secret_free_and_points_to_canonical_docs(self):
        config = json.loads(Path("opencode.json").read_text())

        self.assertEqual(config["$schema"], "https://opencode.ai/config.json")
        self.assertIn("AGENTS.md", config["instructions"])
        self.assertIn(".agents/arc/GENERAL-ROADMAP.md", config["instructions"])
        self.assertEqual(config["permission"]["edit"], "ask")
        self.assertEqual(config["permission"]["bash"], "ask")
        self.assertEqual(config["permission"]["webfetch"], "ask")

    def test_doctor_runtime_compatibility_check_has_no_runtime_errors(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_runtime_test", script_path)

        doctor = agents_doctor.AgentsDoctor()
        doctor.check_primary_runtime_compatibility()

        runtime_issues = [
            issue for issue in doctor.issues
            if any(token in issue.path for token in ("OPENCODE.md", "QWEN.md", ".opencode", ".qwen", ".codex", "opencode.json"))
        ]
        self.assertEqual(runtime_issues, [])

    def test_lint_config_excludes_synced_skills_docs(self):
        config_text = Path(".agents/agents.config").read_text(encoding="utf-8")
        self.assertIn("- skills/", config_text)

    def test_wrapper_uses_local_venv_without_uv_on_path(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            venv_bin = scripts_dir / ".venv" / "bin"
            venv_bin.mkdir(parents=True, exist_ok=True)

            wrapper_dst = agents_dir / "agents"
            wrapper_dst.parent.mkdir(parents=True, exist_ok=True)
            wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper_dst.chmod(wrapper_dst.stat().st_mode | stat.S_IXUSR)

            python_link = venv_bin / "python3"
            try:
                python_link.symlink_to(Path(sys.executable))
            except OSError:
                shutil.copy2(Path(sys.executable), python_link)
                python_link.chmod(python_link.stat().st_mode | stat.S_IXUSR)

            (scripts_dir / "agents-doctor.py").write_text("print('wrapper-local-venv-ok')\n", encoding="utf-8")
            (scripts_dir / "agents-telemetry.py").write_text("raise SystemExit(0)\n", encoding="utf-8")

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            result = subprocess.run(
                [str(wrapper_dst), "doctor"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("wrapper-local-venv-ok", result.stdout)

    def test_bootstrap_exports_generic_baseline_without_scaffold_history(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_generic_export_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)

            agents_bootstrap.copy_required_files(target, force=False, dry_run=False)
            agents_bootstrap.copy_required_dirs(target, force=False, dry_run=False)
            agents_bootstrap.ensure_dirs(target, dry_run=False)
            agents_bootstrap.write_generated_baseline(
                target,
                force=False,
                dry_run=False,
                install_mode=agents_bootstrap.INSTALL_MODE_FULL,
            )

            roadmap = (target / ".agents/arc/GENERAL-ROADMAP.md").read_text(encoding="utf-8")
            project_brief = (target / ".agents/arc/PROJECT-BRIEF.md").read_text(encoding="utf-8")
            specs_index = (target / ".agents/arc/SPECS/INDEX.md").read_text(encoding="utf-8")
            knowledge_index = (target / ".agents/a-docs/knowledge/INDEX.md").read_text(encoding="utf-8")
            map_readme = (target / ".agents/arc/map/README.md").read_text(encoding="utf-8")

            self.assertFalse((target / ".agents/wb/.active_session").exists())
            self.assertFalse(
                (target / ".agents/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md").exists()
            )
            self.assertFalse(
                (target / ".agents/a-docs/telemetry/reports/implementation_report.md").exists()
            )
            self.assertFalse(
                (target / ".agents/a-docs/lessons/entries/20260224_2036_bootstrap-must-provision-full-agent-runtime.md").exists()
            )
            self.assertTrue(
                (target / ".agents/arc/SPECS/000000_0000_feature-f01-parent_spec_01.md").exists()
            )
            self.assertIn("<feature title>", roadmap)
            self.assertNotIn("F-01 Roadmap-First Governance", roadmap)
            self.assertIn("<describe the product or system>", project_brief)
            self.assertIn("Goal-state canon", project_brief)
            self.assertNotIn("base scaffold for an AGENTS-governed development workflow", project_brief)
            self.assertIn("| Total | 2 |", specs_index)
            self.assertIn("- Total indexed docs: 0", knowledge_index)
            self.assertIn("current-state, descriptive", map_readme)

    def test_partial_bootstrap_generates_existing_project_adoption_baseline(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_partial_export_test", script_path)

        baseline = agents_bootstrap.generated_baseline_content(
            "2026-03-23T00:00:00Z",
            agents_bootstrap.INSTALL_MODE_PARTIAL,
        )

        roadmap = baseline[Path(".agents/arc/GENERAL-ROADMAP.md")]
        specs_index = baseline[Path(".agents/arc/SPECS/INDEX.md")]

        self.assertIn("Existing Project Adoption", roadmap)
        self.assertIn("existing-backlog-alignment", specs_index)
        self.assertIn(
            Path(".agents/arc/SPECS/000000_0000_existing-project-adoption_spec_01.md"),
            baseline,
        )

    def test_bootstrap_partial_baseline_mentions_skills_adoption_contract(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_skills_baseline_test", script_path)

        baseline = agents_bootstrap.generated_baseline_content(
            "2026-03-23T00:00:00Z",
            agents_bootstrap.INSTALL_MODE_PARTIAL,
        )

        project_brief = baseline[Path(".agents/arc/PROJECT-BRIEF.md")]
        engineering_guidelines = baseline[Path(".agents/arc/ENGINEERING-GUIDELINES.md")]

        self.assertIn("Skills baseline", project_brief)
        self.assertIn("adoption baseline", engineering_guidelines)
        self.assertIn("partial installs preserve existing project files", engineering_guidelines)

    def test_bootstrap_adaptation_doc_mentions_partial_install_and_repo_skill_baseline(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_adaptation_doc_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            stack = {"signals": ["Python (pyproject.toml)"], "commands": ["python -m pytest"]}

            agents_bootstrap.write_adaptation_doc(
                target,
                stack,
                dry_run=False,
                install_mode=agents_bootstrap.INSTALL_MODE_PARTIAL,
            )

            adaptation_doc = (target / ".agents/a-docs/standards/bootstrap-adaptation.md").read_text(encoding="utf-8")

            self.assertIn("## Skills Baseline", adaptation_doc)
            self.assertIn("## Current State vs Goal State", adaptation_doc)
            self.assertIn("partial install", adaptation_doc)
            self.assertIn("repo/ref/profile", adaptation_doc)
            self.assertIn("Prefer repo-local skills under `.agents/skills/`", adaptation_doc)

    def test_bootstrap_prepares_sibling_universal_skills_checkout_for_apps_target(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_sibling_checkout_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            apps_root = Path(td) / "apps"
            target = apps_root / "demo-repo"
            target.mkdir(parents=True, exist_ok=True)
            calls = []

            def fake_run(cmd, cwd=None):
                calls.append((cmd, cwd))
                return mock.Mock(returncode=0)

            with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                agents_bootstrap.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            expected = target.parent / "universal-skills"
            self.assertIn(
                (["git", "clone", "--branch", "main", "https://github.com/evandro-miguel/skill-universal.git", str(expected)], target.parent),
                calls,
            )

    def test_bootstrap_does_not_prepare_sibling_checkout_outside_apps(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_no_apps_checkout_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "demo-repo"
            target.mkdir(parents=True, exist_ok=True)

            with mock.patch.object(agents_bootstrap.subprocess, "run") as patched_run:
                agents_bootstrap.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            patched_run.assert_not_called()

    def test_existing_project_makefile_include_preserves_local_all(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_makefile_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            makefile = target / "Makefile"
            makefile.write_text("all:\n\t@echo existing\n", encoding="utf-8")

            agents_bootstrap.ensure_makefile(target, dry_run=False)

            content = makefile.read_text(encoding="utf-8")
            self.assertIn("AGENTS_PRESERVE_LOCAL_ALL ?= 1", content)
            self.assertIn("include .agents/a-docs/standards/Makefile", content)

    def test_standard_makefile_exposes_agents_all_aggregate(self):
        makefile_text = Path(".agents/a-docs/standards/Makefile").read_text(encoding="utf-8")

        self.assertIn("agents-all: doctor structure index knowledge-index sync lint lint-scripts skills-check tools-check telemetry-validate test-scripts", makefile_text)
        self.assertIn("ifndef AGENTS_PRESERVE_LOCAL_ALL", makefile_text)
        self.assertIn("all: agents-all", makefile_text)


if __name__ == "__main__":
    unittest.main()
