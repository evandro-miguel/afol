import importlib.util
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AgentsNewQuickModeTests(unittest.TestCase):
    def test_main_does_not_create_session_folder_twice(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_main_flow_test", script_path)

        args = {
            "theme": "execution-integrity-hardening",
            "use_spec": False,
            "use_spec_lite": True,
            "plan_only": False,
            "force_new": True,
            "quick_mode": False,
        }

        with (
            mock.patch.object(agents_new, "_parse_args", return_value=args),
            mock.patch.object(agents_new, "get_active_session", return_value="260224_1030_scripts-lean-efficiency"),
            mock.patch.object(agents_new, "_handle_quick_mode", return_value=False),
            mock.patch.object(agents_new, "_check_active_session_policy"),
            mock.patch.object(agents_new, "get_session_id", return_value="260224_1300_execution-integrity-hardening"),
            mock.patch.object(agents_new, "get_timestamp", return_value="2026-02-24T13:00:00-03:00"),
            mock.patch.object(agents_new, "_create_workstream") as create_workstream_mock,
            mock.patch.object(agents_new, "create_session_folder") as create_session_folder_mock,
        ):
            agents_new.main()

        create_workstream_mock.assert_called_once_with(
            "260224_1300_execution-integrity-hardening",
            "execution-integrity-hardening",
            "2026-02-24T13:00:00-03:00",
            args,
        )
        create_session_folder_mock.assert_not_called()

    def test_telemetry_pattern_helpers_are_non_blocking(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_helpers_test", script_path)

        # Helpers should never break main flow when optional scripts are unavailable.
        agents_new.TELEMETRY_SCRIPT = Path("/tmp/does-not-exist-telemetry.py")
        agents_new.PATTERNS_SCRIPT = Path("/tmp/does-not-exist-patterns.py")

        agents_new.record_session_start("sid", "theme", False)
        agents_new.suggest_patterns_for_theme("theme")

    def test_add_quick_task_updates_task_and_log(self):
        script_path = Path(".agents/scripts/agents-new.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_new = load_module("agents_new_test", script_path)

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            session_id = "260223_1200_sample-theme"
            session_dir = wb_dir / session_id
            session_dir.mkdir(parents=True)

            task_file = session_dir / f"{session_id}_task_01.md"
            log_file = session_dir / f"{session_id}_log_01.md"

            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "---\n\n"
                "# Tasks\n\n"
                "## Task List\n"
                "- [ ] T-01 existing task\n"
            )
            log_file.write_text(
                "---\n"
                "doc_type: log\n"
                "---\n\n"
                "# Log\n\n"
                "## Timeline\n"
                "- 2026-02-23T12:00:00-03:00 - Started - ok\n"
            )

            agents_new.ROOT_DIR = root
            agents_new.WB_DIR = wb_dir

            task_id, task_path, log_path = agents_new.add_quick_task_to_active_session(
                active_session=session_id,
                theme="quick-fix",
                timestamp="2026-02-23T12:34:56-03:00",
            )

            self.assertEqual(task_id, "T-02")
            self.assertEqual(task_path, task_file)
            self.assertEqual(log_path, log_file)

            task_content = task_file.read_text()
            self.assertIn("- [ ] T-02 quick-fix", task_content)

            log_content = log_file.read_text()
            self.assertIn(
                "- 2026-02-23T12:34:56-03:00 - Added quick task T-02: quick-fix - pending",
                log_content,
            )


if __name__ == "__main__":
    unittest.main()
