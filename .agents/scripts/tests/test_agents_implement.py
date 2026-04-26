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


SCRIPT_PATH = Path(".agents/scripts/agents-implement.py").resolve()
SESSION_ARG = "session"


def _namespace(**values):
    values.setdefault(SESSION_ARG, None)
    return argparse.Namespace(**values)


class ImplementNextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.impl = load_module("agents_implement_next_tests", SCRIPT_PATH)

    def test_cmd_next_complete_session(self):
        """Session with all tasks done prints complete."""
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [], 2, 0)), \
             mock.patch("builtins.print"):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_next(_namespace())

    def test_cmd_next_with_pending(self):
        """Session with a pending task shows next."""
        row = mock.Mock(task_id="T-01", state="pending", owner="dev", notes="to do")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "next_task", return_value=row), \
             mock.patch("builtins.print") as mock_print:
            result = self.impl.cmd_next(_namespace())
        self.assertEqual(result, 0)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("T-01", output)

    def test_cmd_next_no_pending(self):
        """No next task — all done."""
        row = mock.Mock(task_id="T-01", state="done")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 1, 0)), \
             mock.patch.object(self.impl, "next_task", return_value=None), \
             mock.patch("builtins.print") as mock_print:
            result = self.impl.cmd_next(_namespace())
        self.assertEqual(result, 0)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("complete", output)


class ImplementStartTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.impl = load_module("agents_implement_start_tests", SCRIPT_PATH)

    def test_cmd_start_explicit_task(self):
        """Start a specific task by ID."""
        row = mock.Mock(task_id="T-01", state="pending")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_start(_namespace(task_id="T-01"))
        self.assertEqual(result, 0)

    def test_cmd_start_default_to_next(self):
        """Start defaults to next pending task."""
        row = mock.Mock(task_id="T-02", state="pending")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "next_task", return_value=row), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_start(_namespace(task_id=None))
        self.assertEqual(result, 0)

    def test_cmd_start_already_in_progress(self):
        """Starting a task that is already in progress."""
        row = mock.Mock(task_id="T-01", state="in_progress")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch("builtins.print") as mock_print:
            result = self.impl.cmd_start(_namespace(task_id="T-01"))
        self.assertEqual(result, 0)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("already in progress", output)

    def test_cmd_start_already_done_raises(self):
        """Starting a done task raises error."""
        row = mock.Mock(task_id="T-01", state="done")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 1, 0)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_start(_namespace(task_id="T-01"))

    def test_cmd_start_blocked_raises(self):
        """Starting a blocked task raises error."""
        row = mock.Mock(task_id="T-01", state="blocked")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_start(_namespace(task_id="T-01"))

    def test_cmd_start_task_not_found(self):
        """Starting a non-existent task raises error."""
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=None):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_start(_namespace(task_id="T-99"))

    def test_cmd_start_no_next_pending(self):
        """No pending task to auto-start."""
        row = mock.Mock(task_id="T-01", state="done")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 1, 0)), \
             mock.patch.object(self.impl, "next_task", return_value=None), \
             mock.patch("builtins.print") as mock_print:
            result = self.impl.cmd_start(_namespace(task_id=None))
        self.assertEqual(result, 0)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("No pending", output)


class ImplementCompleteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.impl = load_module("agents_implement_complete_tests", SCRIPT_PATH)

    def test_cmd_complete_happy_path(self):
        """Complete a task in progress with evidence."""
        row = mock.Mock(task_id="T-01", state="in_progress")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "append_evidence"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_complete(_namespace(
                task_id="T-01", command="pytest", result="passed",
                artifact=[], note=None, no_evidence=False, force=False
            ))
        self.assertEqual(result, 0)

    def test_cmd_complete_no_evidence_requires_force(self):
        """Complete without evidence requires force."""
        row = mock.Mock(task_id="T-01", state="in_progress")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_complete(_namespace(
                    task_id="T-01", command=None, result=None,
                    artifact=None, note=None, no_evidence=True, force=False
                ))

    def test_cmd_complete_no_evidence_with_force(self):
        """Complete without evidence with force succeeds."""
        row = mock.Mock(task_id="T-01", state="in_progress")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_complete(_namespace(
                task_id="T-01", command=None, result=None,
                artifact=None, note=None, no_evidence=True, force=True
            ))
        self.assertEqual(result, 0)

    def test_cmd_complete_already_done_raises(self):
        """Completing a done task raises error."""
        row = mock.Mock(task_id="T-01", state="done")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 1, 0)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_complete(_namespace(
                    task_id="T-01", command=None, result=None,
                    artifact=None, note=None, no_evidence=False, force=False
                ))

    def test_cmd_complete_invalid_state_raises(self):
        """Completing from pending (not started) raises error."""
        row = mock.Mock(task_id="T-01", state="pending")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_complete(_namespace(
                    task_id="T-01", command=None, result=None,
                    artifact=None, note=None, no_evidence=False, force=False
                ))

    def test_cmd_complete_task_not_found(self):
        """Completing a non-existent task raises error."""
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=None):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl.cmd_complete(_namespace(
                    task_id="T-99", command=None, result=None,
                    artifact=None, note=None, no_evidence=False, force=False
                ))

    def test_cmd_complete_default_to_next(self):
        """Complete defaults to next task."""
        row = mock.Mock(task_id="T-01", state="in_progress")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "next_task", return_value=row), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "append_evidence"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_complete(_namespace(
                task_id=None, command="pytest", result="passed",
                artifact=[], note=None, no_evidence=False, force=False
            ))
        self.assertEqual(result, 0)

    def test_cmd_complete_no_actionable(self):
        """No actionable task to complete."""
        row = mock.Mock(task_id="T-01", state="done")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 1, 0)), \
             mock.patch.object(self.impl, "next_task", return_value=None), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_complete(_namespace(
                task_id=None, command=None, result=None,
                artifact=None, note=None, no_evidence=False, force=False
            ))
        self.assertEqual(result, 0)

    def test_cmd_complete_ready_for_test(self):
        """Complete from ready_for_test state succeeds."""
        row = mock.Mock(task_id="T-01", state="ready_for_test")
        with mock.patch.object(self.impl, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.impl, "_get_session_tasks",
                               return_value=(Path("/tmp/t"), [row], 0, 1)), \
             mock.patch.object(self.impl, "find_task_by_id", return_value=row), \
             mock.patch.object(self.impl, "_ensure_prerequisites"), \
             mock.patch.object(self.impl, "append_evidence"), \
             mock.patch.object(self.impl, "update_task_state"), \
             mock.patch("builtins.print"):
            result = self.impl.cmd_complete(_namespace(
                task_id="T-01", command="pytest", result="passed",
                artifact=[], note=None, no_evidence=False, force=False
            ))
        self.assertEqual(result, 0)


class ImplementHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.impl = load_module("agents_implement_helper_tests", SCRIPT_PATH)

    def test_get_session_tasks_no_file_raises(self):
        """No task file raises ExecutionError."""
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(self.impl.ExecutionError):
                self.impl._get_session_tasks(Path(td))

    def test_ensure_task_board_empty_raises(self):
        """Empty rows raises ExecutionError."""
        with self.assertRaises(self.impl.ExecutionError):
            self.impl._ensure_task_board(Path("/tmp/task.md"), [])

    def test_ensure_prerequisites_blocked(self):
        """Blocked prerequisites raises ExecutionError."""
        with mock.patch.object(self.impl, "assert_task_sequence", return_value=["T-01"]):
            with self.assertRaises(self.impl.ExecutionError):
                self.impl._ensure_prerequisites([], "T-02")

    def test_ensure_prerequisites_clear(self):
        """No blocking prerequisites passes."""
        with mock.patch.object(self.impl, "assert_task_sequence", return_value=[]):
            self.impl._ensure_prerequisites([], "T-01")  # should not raise

    def test_emit_feature_operation_governance_prints_bundle(self):
        bundle = {
            "feature_id": "F-18",
            "parent_spec": "parent_spec_01",
            "parent_spec_path": "docs/arc/SPECS/parent_spec_01.md",
            "child_spec": "child_spec_01",
            "child_spec_path": "docs/arc/SPECS/child_spec_01.md",
            "plan_path": ".agents/wb/s1/s1_plan_01.md",
            "task_path": ".agents/wb/s1/s1_task_01.md",
            "rules": [
                {"id": "RULE-002", "path": ".agents/rules/RULE-002-workstream-creation.md"},
                {"id": "RULE-006", "path": ".agents/rules/RULE-006-applicable-rule-resolution.md"},
            ],
        }

        with mock.patch.object(self.impl, "load_feature_operation_governance", return_value=bundle), \
             mock.patch("builtins.print") as mock_print:
            self.impl._emit_feature_operation_governance(Path("/tmp/s"))

        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list if c.args)
        self.assertIn("Governance preflight:", output)
        self.assertIn("feature: F-18", output)
        self.assertIn("RULE-006", output)


class ImplementMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.impl = load_module("agents_implement_main_tests", SCRIPT_PATH)

    def test_main_exception_returns_1(self):
        """main() catches exception and returns 1."""
        with mock.patch.object(self.impl, "build_parser") as mock_parser:
            mock_parser.return_value.parse_args.return_value = mock.Mock(func=mock.Mock(side_effect=Exception("boom")))
            with mock.patch("builtins.print"):
                result = self.impl.main()
        self.assertEqual(result, 1)
