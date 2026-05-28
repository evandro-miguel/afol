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
    def _skip_without_source_template(self, agents_bootstrap):
        if not agents_bootstrap.TEMPLATE_ROOT.exists():
            self.skipTest("source project template is only present in the source repo")

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
        self._skip_without_source_template(agents_bootstrap)

        mandatory_files = {str(path) for path in agents_bootstrap.MANDATORY_FILES_TO_COPY}
        mandatory_dirs = {str(path) for path in agents_bootstrap.MANDATORY_DIRS_TO_COPY}
        ensure_dirs = {str(path) for path in agents_bootstrap.ENSURE_DIRS}
        generated_files = {str(path) for path in agents_bootstrap.generated_baseline_content("2026-03-23T00:00:00Z")}

        self.assertIn("AGENTS.md", mandatory_files)
        self.assertIn("CLAUDE.md", mandatory_files)
        self.assertIn("Justfile", mandatory_files)
        self.assertIn("a", mandatory_files)
        self.assertNotIn("OPENCODE.md", mandatory_files)
        self.assertNotIn("QWEN.md", mandatory_files)
        self.assertNotIn("GEMINI.md", mandatory_files)
        self.assertNotIn("PLANS.md", mandatory_files)
        self.assertNotIn("opencode.json", mandatory_files)
        self.assertIn("docs/arc/SPECS/README.md", mandatory_files)
        self.assertIn(".agents/runtime", mandatory_dirs)
        self.assertIn(".agents/tmp", ensure_dirs)
        self.assertNotIn(".opencode", ensure_dirs)
        self.assertNotIn(".qwen", ensure_dirs)
        self.assertNotIn(".gemini", ensure_dirs)
        self.assertIn(".claude", ensure_dirs)
        self.assertNotIn(".codex", ensure_dirs)
        self.assertIn("docs/arc/GENERAL-ROADMAP.md", generated_files)
        self.assertIn("docs/arc/SPECS/INDEX.md", generated_files)
        self.assertNotIn("docs/arc/SPECS", mandatory_dirs)

    def test_bootstrap_post_checks_prefer_just_when_available(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_optional_sync_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "Justfile").write_text("import 'docs/standards/Justfile'\n", encoding="utf-8")
            calls = []
            cwds = []

            def fake_run(cmd, cwd=None, **kwargs):
                calls.append(cmd)
                cwds.append(cwd)
                result = mock.Mock()
                if cmd[:3] == ["./.agents/agents", "skills-sync", "sync"]:
                    result.returncode = 1
                else:
                    result.returncode = 0
                return result

            with mock.patch.object(agents_bootstrap.shutil, "which", return_value="/usr/bin/just"):
                with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                    agents_bootstrap.run_post_checks(target)

            self.assertIn(["./.agents/agents", "skills-sync", "sync"], calls)
            self.assertIn(["./.agents/agents", "hydrate"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "--fmt", "--check"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "--list"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "all"], calls)
            self.assertEqual(cwds, [target] * len(cwds))

    def test_build_post_check_commands_cover_full_validation_contract(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_command_contract_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "Justfile").write_text("mod agents_scaffold 'docs/standards/Justfile'\n", encoding="utf-8")

            with mock.patch.object(agents_bootstrap.shutil, "which", return_value="/usr/bin/just"):
                commands = agents_bootstrap.build_post_check_commands(target)

        names = [name for name, _, _ in commands]
        self.assertEqual(
            names,
            [
                "hydrate",
                "sync-agent-docs",
                "skills-sync",
                "fix-symlinks",
                "fmt-check",
                "list",
                "doctor",
                "lint",
                "test-scripts",
                "all",
            ],
        )
        self.assertTrue(all(cmd[0] != "make" for _, cmd, _ in commands))
        self.assertIn(
            ["just", "--justfile", "Justfile", "agents_scaffold::all"],
            [cmd for _, cmd, _ in commands],
        )

    def test_bootstrap_post_checks_use_namespaced_recipe_when_justfile_is_module(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_namespaced_just_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "Justfile").write_text("mod agents_scaffold 'docs/standards/Justfile'\n", encoding="utf-8")
            calls = []
            cwds = []

            def fake_run(cmd, cwd=None, **kwargs):
                calls.append(cmd)
                cwds.append(cwd)
                result = mock.Mock()
                result.returncode = 0
                return result

            with mock.patch.object(agents_bootstrap.shutil, "which", return_value="/usr/bin/just"):
                with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                    agents_bootstrap.run_post_checks(target)

            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::doctor"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::lint"], calls)
            self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::all"], calls)
            self.assertEqual(cwds, [target] * len(cwds))

    def test_partial_bootstrap_post_checks_downgrade_repo_validation_failures(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_partial_post_checks_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            (target / "Justfile").write_text("mod agents_scaffold 'docs/standards/Justfile'\n", encoding="utf-8")
            calls = []

            def fake_run(cmd, cwd=None, **kwargs):
                calls.append(cmd)
                result = mock.Mock()
                result.returncode = 1 if cmd[:4] == ["just", "--justfile", "Justfile", "agents_scaffold::lint"] else 0
                return result

            with mock.patch.object(agents_bootstrap.shutil, "which", return_value="/usr/bin/just"):
                with mock.patch.object(agents_bootstrap.subprocess, "run", side_effect=fake_run):
                    agents_bootstrap.run_post_checks(target, agents_bootstrap.INSTALL_MODE_PARTIAL)

        self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::lint"], calls)
        self.assertIn(["just", "--justfile", "Justfile", "agents_scaffold::all"], calls)

    def test_bootstrap_post_checks_require_just(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_make_required_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)

            with mock.patch.object(agents_bootstrap.shutil, "which", return_value=None):
                with self.assertRaisesRegex(RuntimeError, "just is required for post-bootstrap checks"):
                    agents_bootstrap.build_post_check_commands(target)

    def test_removed_root_runtime_mirrors_are_absent(self):
        for path in ["OPENCODE.md", "QWEN.md", "GEMINI.md", "opencode.json"]:
            self.assertFalse(Path(path).exists())

    def test_doctor_runtime_compatibility_check_has_no_runtime_errors(self):
        script_path = Path(".agents/scripts/agents-doctor.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_doctor = load_module("agents_doctor_runtime_test", script_path)

        doctor = agents_doctor.AgentsDoctor()
        doctor.check_primary_runtime_compatibility()

        runtime_issues = [
            issue for issue in doctor.issues
            if any(token in issue.path for token in ("AGENTS.md", "CLAUDE.md", ".claude"))
        ]
        self.assertEqual(runtime_issues, [])

    def test_lint_config_excludes_synced_skills_docs(self):
        config_text = Path(".agents/agents.config").read_text(encoding="utf-8")
        self.assertIn("- .agents/tmp/", config_text)
        self.assertIn("- tmp/", config_text)
        self.assertIn("- .agents/tools/uv/", config_text)
        self.assertIn("- skills/", config_text)
        self.assertIn("- source/", config_text)
        self.assertIn('source_dir: ".agents/source/universal-skills"', config_text)
        self.assertNotIn('source_dir: "../universal-skills"', config_text)
        self.assertIn('"agentic-folder-sys"', config_text)

    def test_wrapper_keeps_legacy_commands_on_local_script_runtime(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
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

            self.assertEqual(result.returncode, 0)
            self.assertIn("wrapper-local-venv-ok", result.stdout)

    def test_wrapper_rejects_missing_script_venv_without_hydrate(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            scripts_dir.mkdir(parents=True, exist_ok=True)

            wrapper_dst = agents_dir / "agents"
            wrapper_dst.parent.mkdir(parents=True, exist_ok=True)
            wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper_dst.chmod(wrapper_dst.stat().st_mode | stat.S_IXUSR)

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

            self.assertEqual(result.returncode, 1)
            combined = f"{result.stdout}{result.stderr}"
            self.assertIn("Run ./.agents/agents hydrate", combined)

    def test_wrapper_allows_system_python_with_opt_in(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            scripts_dir.mkdir(parents=True, exist_ok=True)

            wrapper_dst = agents_dir / "agents"
            wrapper_dst.parent.mkdir(parents=True, exist_ok=True)
            wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper_dst.chmod(wrapper_dst.stat().st_mode | stat.S_IXUSR)

            (scripts_dir / "agents-doctor.py").write_text("print('system-python-ok')\n", encoding="utf-8")

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            env["AGENTS_ALLOW_SYSTEM_PYTHON"] = "1"
            result = subprocess.run(
                [str(wrapper_dst), "doctor"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("system-python-ok", result.stdout)

    def test_wrapper_keeps_agents_script_python_override(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            scripts_dir.mkdir(parents=True, exist_ok=True)

            wrapper_dst = agents_dir / "agents"
            wrapper_dst.parent.mkdir(parents=True, exist_ok=True)
            wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper_dst.chmod(wrapper_dst.stat().st_mode | stat.S_IXUSR)

            (scripts_dir / "agents-doctor.py").write_text(
                "print('script-python-override-ok')\n",
                encoding="utf-8",
            )

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            env["AGENTS_SCRIPT_PYTHON"] = sys.executable
            result = subprocess.run(
                [str(wrapper_dst), "doctor"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("script-python-override-ok", result.stdout)

    def test_wrapper_hydrate_runs_sync_for_scripts_and_runtime(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            runtime_dir = agents_dir / "runtime"
            scripts_dir.mkdir(parents=True, exist_ok=True)
            runtime_dir.mkdir(parents=True, exist_ok=True)
            (runtime_dir / "uv.lock").write_text("", encoding="utf-8")

            wrapper_dst = agents_dir / "agents"
            wrapper_dst.parent.mkdir(parents=True, exist_ok=True)
            wrapper_dst.write_text(wrapper_src.read_text(encoding="utf-8"), encoding="utf-8")
            wrapper_dst.chmod(wrapper_dst.stat().st_mode | stat.S_IXUSR)

            uv_log = root / "uv_calls.log"
            fake_uv_dir = root / "bin"
            fake_uv_dir.mkdir(parents=True, exist_ok=True)
            fake_uv = fake_uv_dir / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env bash\n"
                'echo \"$UV_CACHE_DIR|$*\" >> \"{log}\"\n'
                "exit 0\n".format(log=uv_log),
                encoding="utf-8",
            )
            fake_uv.chmod(fake_uv.stat().st_mode | stat.S_IXUSR)

            project_python = (
                agents_dir
                / "tools"
                / "uv"
                / "python"
                / "cpython-3.11.15-linux-x86_64-gnu"
                / "bin"
                / "python3.11"
            )
            project_python.parent.mkdir(parents=True, exist_ok=True)
            project_python.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            project_python.chmod(project_python.stat().st_mode | stat.S_IXUSR)

            env = os.environ.copy()
            env["PATH"] = f"{fake_uv_dir}:/usr/bin:/bin"
            env["AGENTS_UV_CACHE_DIR"] = str(root / ".agents" / "cache" / "uv")

            result = subprocess.run(
                [str(wrapper_dst), "hydrate"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("Hydrating script environment", result.stdout)
            self.assertIn("Hydrating runtime environment", result.stdout)
            calls = [line.strip() for line in uv_log.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(calls), 2)
            self.assertIn(f"|sync --python {project_python}", calls[0])
            self.assertIn(f"|sync --python {project_python} --locked", calls[1])
            self.assertTrue(all(env["AGENTS_UV_CACHE_DIR"] in line for line in calls))
            self.assertTrue((agents_dir / "tools" / "uv" / "bin" / "uv").is_file())

    def test_wrapper_rejects_missing_runtime_venv_without_hydrate(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            runtime_dir = agents_dir / "runtime"
            venv_bin = scripts_dir / ".venv" / "bin"
            venv_bin.mkdir(parents=True, exist_ok=True)
            runtime_dir.mkdir(parents=True, exist_ok=True)

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

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            result = subprocess.run(
                [str(wrapper_dst), "adoption-plan"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("Runtime entrypoint not found", result.stdout)
            self.assertIn("AGENTS_RUNTIME_ALLOW_UV_RUN", result.stdout)

    def test_wrapper_routes_runtime_adoption_commands_directly(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            runtime_dir = agents_dir / "runtime"
            venv_bin = scripts_dir / ".venv" / "bin"
            runtime_bin_dir = runtime_dir / ".venv" / "bin"
            venv_bin.mkdir(parents=True, exist_ok=True)
            runtime_bin_dir.mkdir(parents=True, exist_ok=True)

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

            telemetry_script = scripts_dir / "agents-telemetry.py"
            telemetry_script.write_text("import sys\nsys.exit(0)\n", encoding="utf-8")
            telemetry_script.chmod(telemetry_script.stat().st_mode | stat.S_IXUSR)

            runtime_bin = runtime_bin_dir / "agentic"
            runtime_bin.write_text(
                "#!/usr/bin/env bash\n"
                "echo \"RUNTIME_BIN:$*\"\n",
                encoding="utf-8",
            )
            runtime_bin.chmod(runtime_bin.stat().st_mode | stat.S_IXUSR)

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            result = subprocess.run(
                [str(wrapper_dst), "adoption-plan"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("RUNTIME_BIN:adoption-plan", result.stdout)
            self.assertNotIn("agentic run adoption-plan", result.stdout)

    def test_wrapper_runtime_uv_fallback_requires_explicit_opt_in(self):
        wrapper_src = Path(".agents/agents").resolve()

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            agents_dir = root / ".agents"
            scripts_dir = agents_dir / "scripts"
            runtime_dir = agents_dir / "runtime"
            venv_bin = scripts_dir / ".venv" / "bin"
            venv_bin.mkdir(parents=True, exist_ok=True)
            runtime_dir.mkdir(parents=True, exist_ok=True)

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

            telemetry_script = scripts_dir / "agents-telemetry.py"
            telemetry_script.write_text("import sys\nsys.exit(0)\n", encoding="utf-8")
            telemetry_script.chmod(telemetry_script.stat().st_mode | stat.S_IXUSR)

            fake_uv_dir = agents_dir / "tools" / "uv" / "bin"
            fake_uv_dir.mkdir(parents=True, exist_ok=True)
            fake_uv = fake_uv_dir / "uv"
            fake_uv.write_text(
                "#!/usr/bin/env python3\n"
                "import sys\n"
                "print('FAKE_UV:' + ' '.join(sys.argv[1:]))\n",
                encoding="utf-8",
            )
            fake_uv.chmod(fake_uv.stat().st_mode | stat.S_IXUSR)

            env = os.environ.copy()
            env["PATH"] = "/usr/bin:/bin"
            env["AGENTS_RUNTIME_ALLOW_UV_RUN"] = "1"
            result = subprocess.run(
                [str(wrapper_dst), "adoption-plan"],
                cwd=root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("FAKE_UV:run --project", result.stdout)
            self.assertIn("agentic adoption-plan", result.stdout)
            self.assertNotIn("agentic run adoption-plan", result.stdout)

    def test_runtime_launchers_use_locked_runtime_environment(self):
        agents_wrapper = Path(".agents/agents").read_text(encoding="utf-8")
        mcp_wrapper = Path(".agents/agents-mcp").read_text(encoding="utf-8")

        self.assertIn('runtime/.venv/bin/${runtime_entrypoint}', agents_wrapper)
        self.assertIn('PROJECT_UV_BIN="${AGENTS_UV_BIN:-${TOOLS_DIR}/uv/bin/uv}"', agents_wrapper)
        self.assertIn('PROJECT_UV_PYTHON_DIR="${AGENTS_UV_PYTHON_DIR:-${TOOLS_DIR}/uv/python}"', agents_wrapper)
        self.assertIn("find_system_uv_bin()", agents_wrapper)
        self.assertIn("hydrate_project_python()", agents_wrapper)
        self.assertIn('sync --python "${PROJECT_UV_PYTHON_BIN}"', agents_wrapper)
        self.assertIn("ensure_venv_uses_project_python", agents_wrapper)
        self.assertIn('export PYTHONHASHSEED="${PYTHONHASHSEED:-0}"', agents_wrapper)
        self.assertNotIn("SYSTEM_UV_BIN=", agents_wrapper)
        self.assertNotIn("/dev/null", agents_wrapper)
        self.assertIn("run_uv_sync()", agents_wrapper)
        self.assertIn("UnixStream/socketpair", agents_wrapper)
        self.assertIn("hydrate-uv", agents_wrapper)
        self.assertIn("AGENTS_RUNTIME_ALLOW_UV_RUN", agents_wrapper)
        self.assertIn('run --project "${SCRIPT_DIR}/runtime" --locked', agents_wrapper)
        self.assertIn('RUNTIME_BIN="${SCRIPT_DIR}/runtime/.venv/bin/agentic-mcp"', mcp_wrapper)
        self.assertIn('PROJECT_UV_BIN="${AGENTS_UV_BIN:-${SCRIPT_DIR}/tools/uv/bin/uv}"', mcp_wrapper)
        self.assertIn('export PYTHONHASHSEED="${PYTHONHASHSEED:-0}"', mcp_wrapper)
        self.assertIn("AGENTS_RUNTIME_ALLOW_UV_RUN", mcp_wrapper)
        self.assertIn('run --project "${SCRIPT_DIR}/runtime" --locked agentic-mcp', mcp_wrapper)
        self.assertIn('adoption-plan|inspect-target', agents_wrapper)

    def test_partial_bootstrap_refreshes_legacy_runtime_wrappers(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_runtime_surface_refresh_test", script_path)
        self._skip_without_source_template(agents_bootstrap)

        with tempfile.TemporaryDirectory() as td:
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
        self._skip_without_source_template(agents_bootstrap)

        with tempfile.TemporaryDirectory() as td:
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
            root_justfile = (target / "Justfile").read_text(encoding="utf-8")

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
            self.assertIn("import 'docs/standards/Justfile'", root_justfile)
            self.assertTrue((target / "docs/standards/Justfile").exists())
            self.assertFalse((target / ".agents/arc/map").exists())
            self.assertFalse((target / "docs/map/ARCHITECTURE.md").exists())

    def test_project_template_stays_generic_and_history_free(self):
        template_root = Path(__file__).resolve().parents[3] / "src/project-template"
        if not template_root.exists():
            self.skipTest("source project template is only present in the source repo")
        generic_files = [
            template_root / "AGENTS.md",
            template_root / "CLAUDE.md",
            template_root / "docs/knowledge/INDEX.md",
            template_root / "docs/knowledge/README.md",
            template_root / "docs/lessons/README.md",
            template_root / "docs/lessons/general-lessons.md",
            template_root / "docs/map/structure/README.md",
            template_root / "docs/templates/adr.md",
            template_root / "docs/templates/pattern.md",
            template_root / "docs/templates/spec.md",
            template_root / "docs/templates/spec-child.md",
            template_root / "docs/templates/spec-test.md",
            template_root / "docs/templates/spec-lite.md",
        ]

        forbidden_tokens = [
            "agentic_start_folder",
            "project-template-source-separation",
            "F-15",
            "F-16",
            "/home/ozy/",
            "gre-test-app",
            "scaffold repository",
        ]

        generated_names = {".agent", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", "node_modules"}
        ignored_runtime_artifacts = {
            ".agents/runtime/.venv",
            ".agents/runtime/uv.lock",
            ".agents/scripts/.venv",
        }
        generated_artifacts = [
            path
            for path in template_root.rglob("*")
            if (
                path.relative_to(template_root).as_posix() not in ignored_runtime_artifacts
                and not any(part in generated_names for part in path.relative_to(template_root).parts)
                and not path.relative_to(template_root).as_posix().startswith(".agents/tmp/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/cache/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/runtime/.venv/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/runtime/.pytest_cache/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/runtime/.ruff_cache/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/scripts/.venv/")
                and not (
                    path.name == "__pycache__"
                    and path.relative_to(template_root).as_posix().startswith(".agents/scripts/")
                )
                and (
                    path.name in generated_names
                    or path.name in {"events.jsonl", "settings.local.json", ".structure-cache.json"}
                )
            )
        ]
        self.assertEqual(generated_artifacts, [])

        text_suffixes = {".md", ".json", ".toml", ".yaml", ".yml", ".py", ".sh"}
        text_files = [
            path
            for path in template_root.rglob("*")
            if (
                path.is_file()
                and path.suffix in text_suffixes
                and not path.relative_to(template_root).as_posix().startswith(".agents/tmp/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/runtime/.venv/")
                and not path.relative_to(template_root).as_posix().startswith(".agents/scripts/.venv/")
            )
        ]
        for path in sorted(set(generic_files + text_files)):
            if path.relative_to(template_root).as_posix() == ".agents/scripts/tests/test_runtime_compatibility.py":
                continue
            content = path.read_text(encoding="utf-8")
            for token in forbidden_tokens:
                self.assertNotIn(token, content, f"{path} should not contain {token!r}")

        agents_md = (template_root / "AGENTS.md").read_text(encoding="utf-8")
        self.assertNotIn("This template", agents_md)
        self.assertNotIn("template defines", agents_md)
        self.assertIn("## Project Overview", agents_md)
        self.assertIn("## Repository Map", agents_md)
        self.assertIn("## Working Rules", agents_md)
        self.assertIn(".agents/rules/", agents_md)
        self.assertTrue((template_root / "Justfile").exists())
        self.assertTrue((template_root / "docs/standards/Justfile").exists())
        self.assertIn(
            "import 'docs/standards/Justfile'",
            (template_root / "Justfile").read_text(encoding="utf-8"),
        )
        self.assertFalse((template_root / "PLANS.md").exists())
        for path in ["OPENCODE.md", "QWEN.md", "GEMINI.md", "opencode.json", ".opencode", ".qwen", ".gemini", ".codex"]:
            self.assertFalse((template_root / path).exists())

        template_files_outside_templates = [
            path
            for path in template_root.joinpath("docs").rglob("*.md")
            if "template" in path.name.lower() and "docs/templates" not in path.as_posix()
        ]
        self.assertEqual(template_files_outside_templates, [])

        lesson_entries = sorted((template_root / "docs/lessons/entries").glob("*.md"))
        self.assertEqual([path.name for path in lesson_entries], ["README.md"])

        structure_files = sorted((template_root / "docs/map/structure").glob("*.md"))
        self.assertEqual([path.name for path in structure_files], ["README.md"])

    def test_partial_bootstrap_generates_existing_project_adoption_baseline(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_partial_export_test", script_path)
        self._skip_without_source_template(agents_bootstrap)

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
        self._skip_without_source_template(agents_bootstrap)

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

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            stack = {
                "signals": ["Python (pyproject.toml)"],
                "commands": ["./.agents/tools/uv/bin/uv run --project . pytest"],
            }

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
            self.assertIn("just --fmt --check", adaptation_doc)

    def test_bootstrap_seeds_repo_local_universal_skills_checkout_without_network(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_sibling_checkout_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "demo-repo"
            target.mkdir(parents=True, exist_ok=True)
            with mock.patch.object(agents_bootstrap.subprocess, "run") as patched_run:
                with mock.patch.object(agents_bootstrap, "external_universal_skills_source_candidates", return_value=[]):
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

        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "universal-skills"
            target.mkdir(parents=True, exist_ok=True)

            with mock.patch.object(agents_bootstrap.subprocess, "run") as patched_run:
                agents_bootstrap.prepare_sibling_universal_skills_checkout(target, dry_run=False)

            patched_run.assert_not_called()

    def test_full_bootstrap_creates_missing_target_directory(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_create_target_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td) / "new-project"

            agents_bootstrap.validate_target(
                target,
                dry_run=False,
                install_mode=agents_bootstrap.INSTALL_MODE_FULL,
            )

            self.assertTrue(target.exists())
            self.assertTrue(target.is_dir())

    def test_existing_project_justfile_appends_scaffold_module(self):
        script_path = Path(".agents/scripts/agents-bootstrap.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_bootstrap = load_module("agents_bootstrap_justfile_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            target = Path(td)
            justfile = target / "Justfile"
            justfile.write_text("default:\n  @echo existing\n", encoding="utf-8")

            agents_bootstrap.ensure_justfile(target, dry_run=False)

            content = justfile.read_text(encoding="utf-8")
            self.assertIn("default:", content)
            self.assertIn("mod agents_scaffold 'docs/standards/Justfile'", content)


if __name__ == "__main__":
    unittest.main()
