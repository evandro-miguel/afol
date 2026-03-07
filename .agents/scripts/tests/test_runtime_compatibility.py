import importlib.util
import json
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

        self.assertIn("OPENCODE.md", mandatory_files)
        self.assertIn("opencode.json", mandatory_files)
        self.assertIn(".agents/arc/SPECS", mandatory_dirs)
        self.assertIn(".agents/tmp", ensure_dirs)
        self.assertIn(".opencode", ensure_dirs)
        self.assertIn(".opencode/agent", ensure_dirs)

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


if __name__ == "__main__":
    unittest.main()
