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
    def test_sync_targets_only_include_claude_mirror(self):
        script_path = Path(".agents/scripts/sync-agent-docs.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        sync_agent_docs = load_module("sync_agent_docs_runtime_test", script_path)

        target_names = [path.name for path in sync_agent_docs.AGENT_FILES]
        self.assertEqual(target_names, ["CLAUDE.md"])

    def test_fix_symlinks_targets_only_committed_claude_adapter(self):
        script_path = Path(".agents/scripts/agents-fix-symlinks.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        fix_symlinks = load_module("agents_fix_symlinks_runtime_test", script_path)

        self.assertEqual(fix_symlinks.AGENT_DIRS, [".claude"])

    def test_bootstrap_mandatory_files_use_minimal_root_runtime_docs(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_runtime_test", script_path)

        mandatory_files = {str(path) for path in agents_bootstrap.MANDATORY_FILES_TO_COPY}
        mandatory_dirs = {str(path) for path in agents_bootstrap.MANDATORY_DIRS_TO_COPY}
        ensure_dirs = {str(path) for path in agents_bootstrap.ENSURE_DIRS}
        generated_files = {str(path) for path in agents_bootstrap.generated_baseline_content("2026-03-23T00:00:00Z")}

        self.assertIn("AGENTS.md", mandatory_files)
        self.assertIn("CLAUDE.md", mandatory_files)
        self.assertNotIn("OPENCODE.md", mandatory_files)
        self.assertNotIn("QWEN.md", mandatory_files)
        self.assertNotIn("GEMINI.md", mandatory_files)
        self.assertNotIn("PLANS.md", mandatory_files)
        self.assertNotIn("opencode.json", mandatory_files)
        self.assertIn("docs/arc/SPECS/README.md", mandatory_files)
        self.assertIn(".agents/tmp", ensure_dirs)
        self.assertNotIn(".opencode", ensure_dirs)
        self.assertNotIn(".qwen", ensure_dirs)
        self.assertNotIn(".gemini", ensure_dirs)
        self.assertIn(".claude", ensure_dirs)
        self.assertNotIn(".codex", ensure_dirs)
        self.assertIn("docs/arc/GENERAL-ROADMAP.md", generated_files)
        self.assertIn("docs/arc/SPECS/INDEX.md", generated_files)
        self.assertNotIn("docs/arc/SPECS", mandatory_dirs)

    def test_bootstrap_tolerates_optional_skills_sync_failure(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_optional_sync_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            (target / "Justfile").write_text("import 'docs/standards/Justfile'\n", encoding="utf-8")
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
            self.assertIn(["just", "--justfile", "Justfile", "all"], calls)

    def test_bootstrap_post_checks_use_namespaced_recipe_when_justfile_is_module(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_namespaced_just_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            (target / "Justfile").write_text("mod agents_scaffold 'docs/standards/Justfile'\n", encoding="utf-8")
            calls = []

            def fake_run(cmd, cwd=None):
                calls.append(cmd)
                result = mock.Mock()
                result.returncode = 0
                return result

            with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                agents_bootstrap.run_post_checks(target)

            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::doctor"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::lint"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::all"], calls)

    def test_partial_bootstrap_post_checks_downgrade_repo_validation_failures(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_partial_post_checks_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            (target / "Justfile").write_text("mod agents_scaffold 'docs/standards/Justfile'\n", encoding="utf-8")
            calls = []

            def fake_run(cmd, cwd=None):
                calls.append(cmd)
                result = mock.Mock()
                result.returncode = 1 if cmd[:4] == ["just", "--justfile", "Justfile", "agents_scaffold::lint"] else 0
                return result

            with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                agents_bootstrap.run_post_checks(target, agents_bootstrap.INSTALL_MODE_PARTIAL)

        self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::lint"], calls)
        self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::all"], calls)

    def test_removed_root_runtime_mirrors_are_absent(self):
        for path in ["OPENCODE.md", "QWEN.md", "GEMINI.md", "opencode.json"]:
            self.assertFalse(Path(path).exists())

    def test_doctor_runtime_compatibility_check_has_no_runtime_errors(self):
        template_root = Path("src/project-template")
        self.assertTrue((template_root / "AGENTS.md").exists())
        self.assertTrue((template_root / "CLAUDE.md").exists())
        self.assertTrue((template_root / ".claude").is_dir())

    def test_lint_config_excludes_synced_skills_docs(self):
        config_text = Path(".agents/agents.config").read_text(encoding="utf-8")
        self.assertIn("- .agents/tmp/", config_text)
        self.assertIn("- tmp/", config_text)
        self.assertIn("- skills/", config_text)
        self.assertIn("- source/", config_text)
        self.assertIn('source_dir: ".agents/source/universal-skills"', config_text)
        self.assertNotIn('source_dir: "../universal-skills"', config_text)
        self.assertIn('"agentic-folder-sys"', config_text)

    def test_wrapper_requires_uv_for_runtime_registry_commands(self):
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
                [str(wrapper_dst), "runtime", "manifest"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("uv not found", result.stdout)

    def test_runtime_launchers_use_locked_runtime_environment(self):
        agents_wrapper = Path(".agents/agents").read_text(encoding="utf-8")
        mcp_wrapper = Path(".agents/agents-mcp").read_text(encoding="utf-8")

        self.assertIn('run --project "${SCRIPT_DIR}/runtime" --locked', agents_wrapper)
        self.assertIn('run --project "${SCRIPT_DIR}/runtime" --locked agentic-mcp', mcp_wrapper)

    def test_partial_bootstrap_refreshes_legacy_runtime_wrappers(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_runtime_surface_refresh_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            legacy_agents_dir = target / ".agents"
            legacy_agents_dir.mkdir(parents=True, exist_ok=True)
            (legacy_agents_dir / "agents").write_text(
                "#!/usr/bin/env bash\n"
                "echo legacy\n",
                encoding="utf-8",
            )

            agents_bootstrap.ensure_partial_runtime_surfaces(target, dry_run=False)

            wrapper = (legacy_agents_dir / "agents").read_text(encoding="utf-8")
            mcp_wrapper = (legacy_agents_dir / "agents-mcp").read_text(encoding="utf-8")

        self.assertIn("run_runtime_and_record", wrapper)
        self.assertIn("mcp|agents-mcp)", wrapper)
        self.assertIn('agentic-mcp "$@"', mcp_wrapper)

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

            roadmap = (target / "docs/arc/GENERAL-ROADMAP.md").read_text(encoding="utf-8")
            project_brief = (target / "docs/arc/PROJECT-BRIEF.md").read_text(encoding="utf-8")
            specs_index = (target / "docs/arc/SPECS/INDEX.md").read_text(encoding="utf-8")
            knowledge_index = (target / "docs/knowledge/INDEX.md").read_text(encoding="utf-8")
            map_readme = (target / "docs/map/README.md").read_text(encoding="utf-8")

            self.assertFalse((target / ".agents/wb/.active_session").exists())
            self.assertTrue((target / ".agents/wb").exists())
            self.assertFalse(any((target / ".agents/wb").iterdir()))
            self.assertFalse(
                (target / "docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md").exists()
            )
            self.assertFalse(
                (target / "docs/telemetry/reports/implementation_report.md").exists()
            )
            self.assertFalse(
                (target / "docs/lessons/entries/20260224_2036_bootstrap-must-provision-full-agent-runtime.md").exists()
            )
            self.assertTrue(
                (target / "docs/arc/SPECS/000000_0000_feature-f01-parent_spec_01.md").exists()
            )
            self.assertIn("<feature title>", roadmap)
            self.assertNotIn("F-01 Roadmap-First Governance", roadmap)
            self.assertIn("<describe the product or system>", project_brief)
            self.assertIn("Goal-state canon", project_brief)
            self.assertNotIn("base scaffold for an AGENTS-governed development workflow", project_brief)
            self.assertIn("| Total | 2 |", specs_index)
            self.assertIn("- Total indexed docs: 0", knowledge_index)
            self.assertIn("current-state, descriptive", map_readme)
            self.assertFalse((target / ".agents/arc/map").exists())
            self.assertFalse((target / "docs/map/ARCHITECTURE.md").exists())

    def test_partial_bootstrap_generates_existing_project_adoption_baseline(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_partial_export_test", script_path)

        baseline = agents_bootstrap.generated_baseline_content(
            "2026-03-23T00:00:00Z",
            agents_bootstrap.INSTALL_MODE_PARTIAL,
        )

        roadmap = baseline[Path("docs/arc/GENERAL-ROADMAP.md")]
        specs_index = baseline[Path("docs/arc/SPECS/INDEX.md")]

        self.assertIn("Existing Project Adoption", roadmap)
        self.assertIn("existing-backlog-alignment", specs_index)
        self.assertIn(
            Path("docs/arc/SPECS/000000_0000_existing-project-adoption_spec_01.md"),
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

        project_brief = baseline[Path("docs/arc/PROJECT-BRIEF.md")]
        engineering_guidelines = baseline[Path("docs/arc/ENGINEERING-GUIDELINES.md")]

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

            adaptation_doc = (target / "docs/standards/bootstrap-adaptation.md").read_text(encoding="utf-8")

            self.assertIn("## Skills Baseline", adaptation_doc)
            self.assertIn("## Current State vs Goal State", adaptation_doc)
            self.assertIn("partial install", adaptation_doc)
            self.assertIn("repo/ref/profile", adaptation_doc)
            self.assertIn("Prefer repo-local skills under `.agents/skills/`", adaptation_doc)

    def test_bootstrap_seeds_repo_local_universal_skills_checkout_without_network(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_sibling_checkout_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "demo-repo"
            target.mkdir(parents=True, exist_ok=True)
            with mock.patch.object(agents_bootstrap.subprocess, "run") as patched_run:
                agents_bootstrap.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            checkout = target / ".agents/source/universal-skills"
            self.assertTrue(agents_bootstrap.is_valid_universal_skills_checkout(checkout))
            self.assertTrue((checkout / "skills" / "agentic-folder-sys" / "SKILL.md").exists())
            self.assertTrue((checkout / "skills" / "agentic-scaffold-mcp" / "SKILL.md").exists())
            self.assertFalse((checkout / "skills" / "agentic-system-workflow" / "SKILL.md").exists())
            self.assertFalse((checkout / "skills" / "workbench-agent-teams" / "SKILL.md").exists())
            self.assertFalse((checkout / "skills" / "writing-skills" / "SKILL.md").exists())
            self.assertEqual(
                json.loads((checkout / "profiles" / "core.json").read_text(encoding="utf-8"))["skills"],
                json.loads(
                    (Path(".agents/source/universal-skills/profiles/core.json")).read_text(encoding="utf-8")
                )["skills"],
            )
            self.assertIn(
                "agentic-folder-sys",
                [entry["name"] for entry in json.loads((checkout / "index.json").read_text(encoding="utf-8"))["skills"]],
            )
            checkout.resolve().relative_to(target.resolve())
            patched_run.assert_not_called()

    def test_bootstrap_skips_repo_local_checkout_for_universal_skills_repo(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_no_apps_checkout_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "universal-skills"
            target.mkdir(parents=True, exist_ok=True)

            with mock.patch.object(agents_bootstrap.subprocess, "run") as patched_run:
                agents_bootstrap.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            patched_run.assert_not_called()

    def test_full_bootstrap_creates_missing_target_directory(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_create_target_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "new-project"

            agents_bootstrap.validate_target(
                target,
                dry_run=False,
                install_mode=agents_bootstrap.INSTALL_MODE_FULL,
            )

            self.assertTrue(target.exists())
            self.assertTrue(target.is_dir())

    def test_existing_project_justfile_import_preserves_local_all(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_justfile_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td)
            justfile = target / "Justfile"
            justfile.write_text("default:\n\t@echo existing\n", encoding="utf-8")

            agents_bootstrap.ensure_justfile(target, dry_run=False)

            content = justfile.read_text(encoding="utf-8")
            self.assertIn("default:", content)
            self.assertIn("mod agents_scaffold 'docs/standards/Justfile'", content)

    def test_standard_justfile_exposes_agents_all_aggregate(self):
        justfile_text = Path("docs/standards/Justfile").read_text(encoding="utf-8")

        agents_all_line = next(
            line for line in justfile_text.splitlines() if line.startswith("agents-all:")
        )
        for target in [
            "doctor",
            "structure",
            "index",
            "knowledge-index",
            "sync",
            "lint",
            "lint-scripts",
            "lint-runtime",
            "skills-check",
            "tools-check",
            "telemetry-validate",
            "test-scripts-all",
            "test-runtime",
            "runtime-mcp-smoke",
        ]:
            self.assertIn(target, agents_all_line)
        self.assertIn("just", justfile_text)
        self.assertIn("all: agents-all", justfile_text)


if __name__ == "__main__":
    unittest.main()
