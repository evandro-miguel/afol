import argparse
import importlib.util
import json
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


SCRIPT_PATH = Path(".agents/scripts/agents-session.py").resolve()
SESSION_KEY = "session"


class SessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_tests", SCRIPT_PATH)

    def test_build_parser_returns_argument_parser(self):
        parser = self.session.build_parser()
        self.assertIsInstance(parser, argparse.ArgumentParser)

    def test_parse_catchup_args_returns_session(self):
        parser = self.session.build_parser()
        args = parser.parse_args(["catchup", "--session", "test-session"])
        self.assertEqual(args.command, "catchup")
        self.assertEqual(args.session, "test-session")

    def test_parse_close_args_returns_session(self):
        parser = self.session.build_parser()
        args = parser.parse_args(["close", "--session", "test-session"])
        self.assertEqual(args.command, "close")
        self.assertEqual(args.session, "test-session")

    def test_parse_list_args(self):
        parser = self.session.build_parser()
        args = parser.parse_args(["list", "--json"])
        self.assertEqual(args.command, "list")
        self.assertTrue(args.json)

    def test_parse_sweep_args(self):
        parser = self.session.build_parser()
        args = parser.parse_args(["sweep"])
        self.assertEqual(args.command, "sweep")
        self.assertFalse(args.json)


class SessionHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_helper_tests", SCRIPT_PATH)

    def test_read_active_session_exists(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("my-session\n")
            f.flush()
            with mock.patch.object(self.session, "ACTIVE_SESSION_FILE", Path(f.name)):
                result = self.session._read_active_session()
        self.assertEqual(result, "my-session")

    def test_read_active_session_missing(self):
        with mock.patch.object(self.session, "ACTIVE_SESSION_FILE", Path("/nonexistent/file")):
            result = self.session._read_active_session()
        self.assertEqual(result, "")

    def test_write_active_session(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("old\n")
            f.flush()
            path = Path(f.name)
            with mock.patch.object(self.session, "ACTIVE_SESSION_FILE", path):
                self.session._write_active_session("new-session")
        self.assertEqual(path.read_text().strip(), "new-session")

    def test_clear_active_session(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("old\n")
            f.flush()
            path = Path(f.name)
            with mock.patch.object(self.session, "ACTIVE_SESSION_FILE", path):
                self.session._clear_active_session()
        self.assertEqual(path.read_text(encoding="utf-8"), "")

    def test_print_items_empty(self):
        with mock.patch("builtins.print") as mock_print:
            self.session._print_items("label", [])
        mock_print.assert_not_called()

    def test_print_items_with_values(self):
        with mock.patch("builtins.print") as mock_print:
            self.session._print_items("Items", ["a", "b"])
        self.assertTrue(mock_print.call_count >= 3)

    def test_resolve_next_session_valid(self):
        target = Path("/tmp/target")
        with mock.patch.object(self.session, "find_session", return_value=Path("/tmp/other")):
            result = self.session._resolve_next_session("other", target)
        self.assertEqual(result, Path("/tmp/other"))

    def test_resolve_next_session_same_raises(self):
        target = Path("/tmp/target")
        with mock.patch.object(self.session, "find_session", return_value=target):
            with self.assertRaises(self.session.ExecutionError):
                self.session._resolve_next_session("target", target)

    def test_resolve_next_session_none_reference(self):
        result = self.session._resolve_next_session(None, Path("/tmp/target"))
        self.assertIsNone(result)

    def test_print_task_summary_with_next(self):
        with mock.patch("builtins.print") as mock_print:
            self.session._print_task_summary(
                {
                    "done": 1,
                    "total": 2,
                    "remaining": 1,
                    "next": {"task_id": "T-02", "state": "pending", "notes": "waiting"},
                    "blocked": [],
                }
            )
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("1/2", output)

    def test_print_git_summary(self):
        with mock.patch("builtins.print") as mock_print:
            self.session._print_git_summary(
                {
                    "changed": 5,
                    "repo_changed": 3,
                    "session_changed": 2,
                    "repo_paths": ["a.py", "b.py"],
                    "session_paths": ["task.md"],
                }
            )
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("total=5", output)


class SessionCloseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_close_tests", SCRIPT_PATH)

    def _close_args(self, **overrides):
        defaults = {"session": None, "next_session": None, "json": False}
        defaults.update(overrides)
        return argparse.Namespace(**defaults)

    def test_cmd_close_success(self):
        target = Path("/tmp/session-close-ok")
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(
                self.session,
                "_run_strict_verify",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
            mock.patch.object(self.session, "_read_active_session", return_value="other"),
            mock.patch("builtins.print"),
        ):
            result = self.session.cmd_close(self._close_args())
        self.assertEqual(result, 0)

    def test_cmd_close_verify_fails(self):
        target = Path("/tmp/session-close-fail")
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(
                self.session,
                "_run_strict_verify",
                return_value=mock.Mock(returncode=1, stdout="fail", stderr=""),
            ),
            mock.patch("builtins.print"),
        ):
            result = self.session.cmd_close(self._close_args())
        self.assertEqual(result, 1)

    def test_cmd_close_repoint(self):
        target = Path("/tmp/session-a")
        next_target = Path("/tmp/session-b")
        with (
            mock.patch.object(self.session, "find_session", side_effect=[target, next_target]),
            mock.patch.object(
                self.session,
                "_run_strict_verify",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
            mock.patch.object(self.session, "_read_active_session", return_value="session-a"),
            mock.patch.object(self.session, "_write_active_session") as mock_write,
            mock.patch("builtins.print"),
        ):
            result = self.session.cmd_close(self._close_args(next_session="session-b"))
        self.assertEqual(result, 0)
        mock_write.assert_called_once_with("session-b")

    def test_cmd_close_json_output(self):
        target = Path("/tmp/session-json")
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(
                self.session,
                "_run_strict_verify",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
            mock.patch.object(self.session, "_read_active_session", return_value=""),
            mock.patch("builtins.print") as mock_print,
        ):
            result = self.session.cmd_close(self._close_args(json=True))
        self.assertEqual(result, 0)
        call_args = mock_print.call_args_list[0]
        parsed = json.loads(call_args[0][0])
        self.assertTrue(parsed["closed"])

    def test_cmd_close_clears_active_pointer(self):
        target = Path("/tmp/session-ret")
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(
                self.session,
                "_run_strict_verify",
                return_value=mock.Mock(returncode=0, stdout="", stderr=""),
            ),
            mock.patch.object(self.session, "_read_active_session", return_value="session-ret"),
            mock.patch.object(self.session, "_clear_active_session") as mock_clear,
            mock.patch("builtins.print") as mock_print,
        ):
            result = self.session.cmd_close(self._close_args())
        self.assertEqual(result, 0)
        mock_clear.assert_called_once_with()
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("cannot remain the default pointer", output)


def write_session_task(session_dir: Path, rows: list[str]) -> None:
    task_file = session_dir / f"{session_dir.name}_task_01.md"
    task_file.write_text(
        "---\n"
        "doc_type: task\n"
        "id: task-test\n"
        "---\n\n"
        "# Tasks\n\n"
        "## State Board\n\n"
        "| Task | State | Owner | Notes |\n"
        "|------|-------|-------|-------|\n" + "\n".join(rows) + "\n",
        encoding="utf-8",
    )


def write_session_doc(session_dir: Path, doc_type: str, status: str) -> None:
    doc_file = session_dir / f"{session_dir.name}_{doc_type}_01.md"
    doc_file.write_text(
        f"---\ndoc_type: {doc_type}\nstatus: {status}\n---\n\n# {doc_type}\n",
        encoding="utf-8",
    )


class SessionInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_inventory_tests", SCRIPT_PATH)

    def _args(self, **overrides):
        defaults = {"json": False}
        defaults.update(overrides)
        return argparse.Namespace(**defaults)

    def test_cmd_list_json_reports_active_and_status(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            wb_dir.mkdir(parents=True, exist_ok=True)
            active_file = wb_dir / ".active_session"

            open_dir = wb_dir / "260426_1418_open"
            open_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(open_dir, ["| T-01 | pending | worker | first |"])
            write_session_doc(open_dir, "report", "active")

            closed_dir = wb_dir / "260426_1419_closed"
            closed_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(closed_dir, ["| T-01 | done | worker | done |"])
            write_session_doc(closed_dir, "report", "final")
            write_session_doc(closed_dir, "postmortem", "final")

            active_file.write_text(f"{open_dir.name}\n", encoding="utf-8")

            with (
                mock.patch.object(self.session, "WB_DIR", wb_dir),
                mock.patch.object(self.session, "ACTIVE_SESSION_FILE", active_file),
                mock.patch("builtins.print") as mock_print,
            ):
                result = self.session.cmd_list(self._args(json=True))

            self.assertEqual(result, 0)
            payload = json.loads(mock_print.call_args_list[0][0][0])
            self.assertEqual(payload["active_session"], open_dir.name)
            self.assertEqual(payload["count"], 2)
            by_session = {entry["session"]: entry for entry in payload["sessions"]}
            self.assertTrue(by_session[open_dir.name]["active"])
            self.assertEqual(by_session[open_dir.name]["report_status"], "active")
            self.assertEqual(by_session[closed_dir.name]["postmortem_status"], "final")
            self.assertTrue(by_session[open_dir.name]["catchup_signal"])
            self.assertFalse(by_session[closed_dir.name]["catchup_signal"])

    def test_cmd_sweep_json_classifies_stale_open_and_close_candidate(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            wb_dir = root / ".agents" / "wb"
            wb_dir.mkdir(parents=True, exist_ok=True)
            active_file = wb_dir / ".active_session"

            stale_dir = wb_dir / "260426_1420_stale"
            stale_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(stale_dir, ["| T-01 | pending | worker | pending |"])
            write_session_doc(stale_dir, "report", "final")

            open_dir = wb_dir / "260426_1421_open"
            open_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(open_dir, ["| T-01 | pending | worker | pending |"])
            write_session_doc(open_dir, "report", "active")

            close_candidate = wb_dir / "260426_1422_closeable"
            close_candidate.mkdir(parents=True, exist_ok=True)
            write_session_task(close_candidate, ["| T-01 | done | worker | done |"])
            write_session_doc(close_candidate, "report", "final")

            active_file.write_text(f"{open_dir.name}\n", encoding="utf-8")

            with (
                mock.patch.object(self.session, "WB_DIR", wb_dir),
                mock.patch.object(self.session, "ACTIVE_SESSION_FILE", active_file),
                mock.patch("builtins.print") as mock_print,
            ):
                result = self.session.cmd_sweep(self._args(json=True))

            self.assertEqual(result, 0)
            payload = json.loads(mock_print.call_args_list[0][0][0])
            self.assertTrue(payload["read_only"])
            self.assertEqual(payload["active_session"], open_dir.name)
            self.assertTrue(any(stale_dir.name in item for item in payload["stale"]))
            self.assertTrue(any(open_dir.name in item for item in payload["open"]))
            self.assertTrue(
                any(close_candidate.name in item for item in payload["close_candidates"])
            )
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), open_dir.name)


class SessionCatchupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_module("agents_session_catchup_tests", SCRIPT_PATH)

    def _catchup_args(self, **overrides):
        defaults = {"session": None, "json": False, "paths_limit": 10}
        defaults.update(overrides)
        return argparse.Namespace(**defaults)

    def test_cmd_catchup_text_output(self):
        target = Path("/tmp/session-catchup")
        payload = {
            "roadmap_feature": "F-01",
            "catchup_required": True,
            "context_ready": True,
            "missing_context": [],
            "tasks": {"done": 0, "total": 1, "remaining": 1, "next": None, "blocked": []},
            "git": {"changed": 0, "repo_changed": 0, "session_changed": 0},
            "stale_artifacts": [],
            "warnings": [],
            "next_step": "proceed",
        }
        payload[SESSION_KEY] = "test"
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(self.session, "build_session_catchup", return_value=payload),
            mock.patch("builtins.print") as mock_print,
        ):
            result = self.session.cmd_catchup(self._catchup_args())
        self.assertEqual(result, 0)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("test", output)

    def test_cmd_catchup_json_output(self):
        target = Path("/tmp/session-catchup-json")
        payload = {
            "roadmap_feature": "F-01",
            "catchup_required": False,
            "context_ready": True,
            "missing_context": [],
            "tasks": {"done": 1, "total": 1, "remaining": 0, "next": None, "blocked": []},
            "git": {"changed": 0, "repo_changed": 0, "session_changed": 0},
            "stale_artifacts": [],
            "warnings": [],
            "next_step": "done",
        }
        payload[SESSION_KEY] = "test"
        with (
            mock.patch.object(self.session, "find_session", return_value=target),
            mock.patch.object(self.session, "build_session_catchup", return_value=payload),
            mock.patch("builtins.print") as mock_print,
        ):
            result = self.session.cmd_catchup(self._catchup_args(json=True))
        self.assertEqual(result, 0)
        call_args = mock_print.call_args_list[0]
        parsed = json.loads(call_args[0][0])
        self.assertEqual(parsed["session"], "test")

    def test_print_catchup(self):
        payload = {
            "roadmap_feature": "F-01",
            "catchup_required": True,
            "context_ready": False,
            "missing_context": ["product"],
            "tasks": {"done": 0, "total": 1, "remaining": 1, "next": None, "blocked": []},
            "git": {
                "changed": 2,
                "repo_changed": 1,
                "session_changed": 1,
                "repo_paths": [],
                "session_paths": [],
            },
            "stale_artifacts": ["plan"],
            "warnings": ["drift"],
            "next_step": "review",
        }
        payload[SESSION_KEY] = "test"
        with mock.patch("builtins.print") as mock_print:
            self.session._print_catchup(payload)
        output = "\n".join(str(c) for c in mock_print.call_args_list)
        self.assertIn("drift", output)
        self.assertIn("product", output)
        self.assertIn("plan", output)
