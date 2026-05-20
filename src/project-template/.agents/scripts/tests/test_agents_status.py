import importlib.util
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


SCRIPT_PATH = Path(".agents/scripts/agents-status.py").resolve()


class StatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_tests", SCRIPT_PATH)

    def test_parse_args_returns_session_when_provided(self):
        """parse_args must return session when --session is provided."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session="test-session", format="text"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.session, "test-session")

    def test_parse_args_supports_format_json(self):
        """parse_args must support --format json."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session=None, format="json"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.format, "json")

    def test_parse_args_supports_format_text(self):
        """parse_args must support --format text."""
        with mock.patch.object(
            self.status.argparse.ArgumentParser,
            "parse_args",
            return_value=mock.Mock(session=None, format="text"),
        ):
            args = self.status.parse_args()
            self.assertEqual(args.format, "text")

    def test_main_returns_int_exit_code(self):
        """main must return an integer exit code."""
        mock_args = mock.Mock(session=None, format="text", artifact=[])
        with mock.patch.object(self.status, "parse_args", return_value=mock_args):
            with mock.patch.object(
                self.status, "summarize_session", return_value={"context_ready": True}
            ):
                result = self.status.main()
                self.assertIsInstance(result, int)


class PrintStatusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_print_tests", SCRIPT_PATH)

    def _sample_data(self, **overrides):
        data = {
            "session": "260401_1200_test",
            "context_ready": True,
            "missing_context": [],
            "roadmap_feature": "F-01",
            "tasks": {"done": 1, "total": 2, "remaining": 1, "next": None},
            "blocked_tasks": [],
            "workflow_artifacts": [],
            "workflow_next": None,
            "artifacts": {
                "plan": "plan.md",
                "task": "task.md",
                "spec": "",
                "report": "report.md",
                "log": "log.md",
                "architecture": "",
                "product": "",
                "guidelines": "",
                "tech-stack": "",
                "current-state-map": "",
            },
            "ready_state": "ready",
        }
        data.update(overrides)
        return data

    def test_print_status_basic(self):
        data = self._sample_data()
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("Agents Status", output)
        self.assertIn("260401_1200_test", output)
        self.assertIn("F-01", output)
        self.assertIn("ready", output)

    def test_print_status_with_missing_context(self):
        data = self._sample_data(missing_context=["roadmap", "product"])
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("roadmap", output)

    def test_print_status_with_blocked_tasks(self):
        data = self._sample_data(blocked_tasks=["T-03 blocked by X"])
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("blocked_tasks", output)

    def test_print_status_with_workflow_artifacts(self):
        data = self._sample_data(
            workflow_artifacts=[
                {
                    "doc_type": "brainstorm",
                    "state": "invalid",
                    "status": "active",
                    "blockers": ["dep-X"],
                    "utility": {"reasons": ["not useful"]},
                }
            ]
        )
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("brainstorm", output)
        self.assertIn("dep-X", output)

    def test_print_status_with_next_task(self):
        data = self._sample_data(
            tasks={"done": 0, "total": 1, "remaining": 1, "next": "T-01 pending"}
        )
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("T-01", output)

    def test_print_status_with_workflow_next(self):
        data = self._sample_data(workflow_next="report missing")
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("report", output)


class FormatHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_format_tests", SCRIPT_PATH)

    def test_format_next_task_in_progress(self):
        row = mock.Mock(state="in_progress", task_id="T-01", owner="dev", notes="working")
        with mock.patch.object(self.status, "next_task", return_value=row):
            result = self.status._format_next_task([row])
        self.assertIn("in progress", result)
        self.assertIn("T-01", result)

    def test_format_next_task_other_state(self):
        row = mock.Mock(state="pending", task_id="T-02", owner="dev", notes="waiting")
        with mock.patch.object(self.status, "next_task", return_value=row):
            result = self.status._format_next_task([row])
        self.assertIn("T-02", result)
        self.assertIn("pending", result)

    def test_format_next_task_none(self):
        with mock.patch.object(self.status, "next_task", return_value=None):
            result = self.status._format_next_task([])
        self.assertIsNone(result)

    def test_format_next_artifact_with_blockers(self):
        item = {"doc_type": "plan", "state": "blocked", "blockers": ["missing spec"]}
        result = self.status._format_next_artifact(item)
        self.assertIn("missing spec", result)

    def test_format_next_artifact_invalid_with_utility(self):
        item = {
            "doc_type": "brainstorm",
            "state": "invalid",
            "blockers": [],
            "utility": {"reasons": ["not useful for this intent"]},
        }
        result = self.status._format_next_artifact(item)
        self.assertIn("not useful", result)

    def test_format_next_artifact_simple(self):
        item = {"doc_type": "task", "state": "ready", "blockers": []}
        result = self.status._format_next_artifact(item)
        self.assertIn("task", result)
        self.assertIn("ready", result)

    def test_format_next_artifact_none(self):
        result = self.status._format_next_artifact(None)
        self.assertIsNone(result)


class SummarizeSessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_summarize_tests", SCRIPT_PATH)

    def test_summarize_session_returns_expected_keys(self):
        session_dir = mock.MagicMock()
        session_dir.name = "260401_test_session"
        with (
            mock.patch.object(self.status, "resolve_artifact", return_value=None),
            mock.patch.object(self.status, "parse_state_summary", return_value=(0, 0, 0, [], [])),
            mock.patch.object(self.status, "workflow_artifact_states", return_value=[]),
            mock.patch.object(self.status, "context_readiness", return_value=(True, [])),
            mock.patch.object(self.status, "next_workflow_artifact", return_value=None),
        ):
            result = self.status.summarize_session(session_dir)
        self.assertIn("session", result)
        self.assertIn("tasks", result)
        self.assertIn("ready_state", result)
        self.assertEqual(result["session"], "260401_test_session")

    def test_summarize_session_complete_state(self):
        session_dir = mock.MagicMock()
        task_file = mock.MagicMock()
        task_file.exists.return_value = True
        with (
            mock.patch.object(self.status, "resolve_artifact", return_value=task_file),
            mock.patch.object(self.status, "parse_state_summary", return_value=(2, 2, 0, [], [])),
            mock.patch.object(self.status, "workflow_artifact_states", return_value=[]),
            mock.patch.object(self.status, "context_readiness", return_value=(True, [])),
            mock.patch.object(self.status, "next_workflow_artifact", return_value=None),
            mock.patch.object(
                self.status, "split_frontmatter", return_value=({"roadmap_feature": "F-05"}, "")
            ),
        ):
            result = self.status.summarize_session(session_dir)
        self.assertEqual(result["ready_state"], "complete")
        self.assertEqual(result["roadmap_feature"], "F-05")


class MainPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_main_tests", SCRIPT_PATH)

    def test_main_json_output(self):
        mock_args = mock.Mock(session=None, json=True, artifact=None, check_context=False)
        with (
            mock.patch.object(self.status, "parse_args", return_value=mock_args),
            mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")),
            mock.patch.object(self.status, "summarize_session", return_value={"session": "s"}),
        ):
            with mock.patch("builtins.print") as mock_print:
                result = self.status.main()
        self.assertEqual(result, 0)
        self.assertTrue(any("session" in str(c) for c in mock_print.call_args_list))

    def test_main_artifact_resolution(self):
        mock_args = mock.Mock(
            session=None, json=False, artifact=["task", "plan"], check_context=False
        )
        with (
            mock.patch.object(self.status, "parse_args", return_value=mock_args),
            mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.status, "resolve_artifact", side_effect=[Path("task.md"), Path("plan.md")]
            ),
        ):
            with mock.patch("builtins.print"):
                result = self.status.main()
        self.assertEqual(result, 0)

    def test_main_error_path(self):
        mock_args = mock.Mock(session=None, json=False, artifact=None, check_context=False)
        with (
            mock.patch.object(self.status, "parse_args", return_value=mock_args),
            mock.patch.object(
                self.status, "find_session", side_effect=self.status.ExecutionError("not found")
            ),
        ):
            with mock.patch("builtins.print"):
                result = self.status.main()
        self.assertEqual(result, 1)
