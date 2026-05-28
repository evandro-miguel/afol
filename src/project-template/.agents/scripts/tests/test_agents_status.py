import importlib.util
import sys
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

    def test_parse_args_supports_details_alias(self):
        """parse_args must support the explicit detailed text flag."""
        with mock.patch.object(sys, "argv", ["agents-status.py", "--details"]):
            args = self.status.parse_args()
        self.assertTrue(args.legacy)

    def test_main_returns_int_exit_code(self):
        """main must return an integer exit code."""
        mock_args = mock.Mock(session=None, json=False, pretty=False, artifact=[], check_context=False, legacy=False)
        with mock.patch.object(self.status, "parse_args", return_value=mock_args), \
             mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.status, "summarize_session", return_value={"session": "s"}), \
             mock.patch.object(self.status, "print_status"):
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
        self.assertIn("STATUS:", output)
        self.assertIn("TASK:", output)
        self.assertIn("FILES_WRITTEN:", output)
        self.assertIn("260401_1200_test", output)
        self.assertIn("session=260401_1200_test", output)
        self.assertNotIn("session:", output)
        self.assertNotIn("workflow_artifacts:", output)
        self.assertNotIn("artifacts:", output)

    def test_print_status_with_missing_context(self):
        data = self._sample_data(missing_context=["roadmap", "product"])
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data, legacy=True)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("roadmap", output)

    def test_print_status_with_blocked_tasks(self):
        data = self._sample_data(blocked_tasks=["T-03 blocked by X"])
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data, legacy=True)
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
            self.status.print_status(data, legacy=True)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("brainstorm", output)
        self.assertIn("dep-X", output)

    def test_print_status_legacy_includes_raw_dump(self):
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
            self.status.print_status(data, legacy=True)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertIn("session:", output)
        self.assertIn("workflow_artifacts:", output)
        self.assertIn("artifacts:", output)

    def test_print_status_with_next_task(self):
        data = self._sample_data(tasks={"done": 0, "total": 1, "remaining": 1, "next": "T-01 pending"})
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

    def test_print_status_complete_hides_next_artifact(self):
        data = self._sample_data(ready_state="complete", workflow_next="report missing")
        with mock.patch("builtins.print") as mock_print:
            self.status.print_status(data)
        output = "\n".join(str(c.args[0]) for c in mock_print.call_args_list)
        self.assertNotIn("next_artifact:", output)


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
        with mock.patch.object(self.status, "resolve_artifact", return_value=None), \
             mock.patch.object(self.status, "parse_state_summary", return_value=(0, 0, 0, [], [])), \
             mock.patch.object(self.status, "workflow_artifact_states", return_value=[]), \
             mock.patch.object(self.status, "context_readiness", return_value=(True, [])), \
             mock.patch.object(self.status, "next_workflow_artifact", return_value=None):
            result = self.status.summarize_session(session_dir)
        self.assertIn("session", result)
        self.assertIn("tasks", result)
        self.assertIn("ready_state", result)
        self.assertIn("compact_handoff", result)
        self.assertEqual(result["session"], "260401_test_session")
        self.assertEqual(result["compact_handoff"]["STATUS"], "PARTIAL")

    def test_summarize_session_complete_state(self):
        session_dir = mock.MagicMock()
        task_file = mock.MagicMock()
        task_file.exists.return_value = True
        with mock.patch.object(self.status, "resolve_artifact", return_value=task_file), \
             mock.patch.object(self.status, "parse_state_summary", return_value=(2, 2, 0, [], [])), \
             mock.patch.object(self.status, "workflow_artifact_states", return_value=[]), \
             mock.patch.object(self.status, "context_readiness", return_value=(True, [])), \
             mock.patch.object(self.status, "next_workflow_artifact", return_value=None), \
             mock.patch.object(self.status, "split_frontmatter", return_value=({"roadmap_feature": "F-05"}, "")):
            result = self.status.summarize_session(session_dir)
        self.assertEqual(result["ready_state"], "complete")
        self.assertEqual(result["roadmap_feature"], "F-05")

    def test_summarize_session_complete_clears_workflow_next(self):
        session_dir = mock.MagicMock()
        task_file = mock.MagicMock()
        task_file.exists.return_value = True
        with mock.patch.object(self.status, "resolve_artifact", return_value=task_file), \
             mock.patch.object(self.status, "parse_state_summary", return_value=(1, 1, 0, [], [])), \
             mock.patch.object(self.status, "workflow_artifact_states", return_value=[]), \
             mock.patch.object(self.status, "context_readiness", return_value=(True, [])), \
             mock.patch.object(
                 self.status,
                 "next_workflow_artifact",
                 return_value={"doc_type": "report", "state": "missing", "blockers": []},
             ), \
             mock.patch.object(self.status, "split_frontmatter", return_value=({"roadmap_feature": "F-05"}, "")):
            result = self.status.summarize_session(session_dir)
        self.assertEqual(result["ready_state"], "complete")
        self.assertIsNone(result["workflow_next"])

    def test_summarize_session_non_complete_keeps_workflow_next(self):
        session_dir = mock.MagicMock()
        task_file = mock.MagicMock()
        task_file.exists.return_value = True
        with mock.patch.object(self.status, "resolve_artifact", return_value=task_file), \
             mock.patch.object(self.status, "parse_state_summary", return_value=(2, 1, 1, [], [])), \
             mock.patch.object(self.status, "workflow_artifact_states", return_value=[]), \
             mock.patch.object(self.status, "context_readiness", return_value=(True, [])), \
             mock.patch.object(
                 self.status,
                 "next_workflow_artifact",
                 return_value={"doc_type": "report", "state": "missing", "blockers": []},
             ), \
             mock.patch.object(self.status, "split_frontmatter", return_value=({"roadmap_feature": "F-05"}, "")):
            result = self.status.summarize_session(session_dir)
        self.assertEqual(result["ready_state"], "ready")
        self.assertEqual(result["workflow_next"], "report missing")


class MainPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.status = load_module("agents_status_main_tests", SCRIPT_PATH)

    def test_main_json_output(self):
        mock_args = mock.Mock(session=None, json=True, pretty=False, artifact=None, check_context=False, legacy=False)
        with mock.patch.object(self.status, "parse_args", return_value=mock_args), \
             mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(
                 self.status,
                 "summarize_session",
                 return_value={"session": "s", "compact_handoff": {"STATUS": "DONE"}},
             ):
            with mock.patch("builtins.print") as mock_print:
                result = self.status.main()
        self.assertEqual(result, 0)
        rendered = mock_print.call_args_list[0][0][0]
        self.assertIn('"session":"s"', rendered)
        self.assertIn('"compact_handoff":{"STATUS":"DONE"}', rendered)
        self.assertNotIn("\n", rendered)

    def test_main_artifact_resolution(self):
        mock_args = mock.Mock(session=None, json=False, pretty=False, artifact=["task", "plan"], check_context=False, legacy=False)
        with mock.patch.object(self.status, "parse_args", return_value=mock_args), \
             mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")), \
             mock.patch.object(self.status, "resolve_artifact", side_effect=[Path("task.md"), Path("plan.md")]):
            with mock.patch("builtins.print"):
                result = self.status.main()
        self.assertEqual(result, 0)

    def test_main_error_path(self):
        mock_args = mock.Mock(session=None, json=False, pretty=False, artifact=None, check_context=False, legacy=False)
        with mock.patch.object(self.status, "parse_args", return_value=mock_args), \
             mock.patch.object(self.status, "find_session", side_effect=self.status.ExecutionError("not found")):
            with mock.patch("builtins.print"):
                result = self.status.main()
        self.assertEqual(result, 1)

    def test_main_rejects_pretty_without_json(self):
        mock_args = mock.Mock(session=None, json=False, pretty=True, artifact=None, check_context=False)
        with mock.patch.object(self.status, "parse_args", return_value=mock_args), \
             mock.patch.object(self.status, "find_session", return_value=Path("/tmp/s")), \
             mock.patch("builtins.print") as mock_print:
            result = self.status.main()
        self.assertEqual(result, 2)
        self.assertIn("--pretty requires --json", mock_print.call_args_list[0][0][0])
