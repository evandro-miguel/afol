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


SCRIPT_PATH = Path(".agents/scripts/agents-revert.py").resolve()
SESSION_ARG = "session"


def _namespace(**values):
    values.setdefault(SESSION_ARG, None)
    return argparse.Namespace(**values)


def _make_row(task_id="T-01", state="done", owner="dev", notes="completed"):
    row = mock.Mock()
    row.task_id = task_id
    row.state = state
    row.owner = owner
    row.notes = notes
    return row


class RevertTaskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.revert = load_module("agents_revert_task_tests", SCRIPT_PATH)

    def test_cmd_task_happy_path(self):
        """Revert a done task to pending with confirm."""
        row = _make_row()
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [row])
            ),
            mock.patch.object(self.revert, "find_task_by_id", return_value=row),
            mock.patch.object(self.revert, "update_task_states_from"),
            mock.patch("builtins.print"),
        ):
            args = _namespace(task_id="T-01", to_state="pending", confirm=True)
            result = self.revert.cmd_task(args)
        self.assertEqual(result, 0)

    def test_cmd_task_to_in_progress(self):
        """Revert a task to in_progress."""
        row = _make_row()
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [row])
            ),
            mock.patch.object(self.revert, "find_task_by_id", return_value=row),
            mock.patch.object(self.revert, "update_task_state"),
            mock.patch("builtins.print"),
        ):
            args = _namespace(task_id="T-01", to_state="in_progress", confirm=True)
            result = self.revert.cmd_task(args)
        self.assertEqual(result, 0)

    def test_cmd_task_to_blocked(self):
        """Revert a task to blocked."""
        row = _make_row()
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [row])
            ),
            mock.patch.object(self.revert, "find_task_by_id", return_value=row),
            mock.patch.object(self.revert, "update_task_state"),
            mock.patch("builtins.print"),
        ):
            args = _namespace(task_id="T-01", to_state="blocked", confirm=True)
            result = self.revert.cmd_task(args)
        self.assertEqual(result, 0)

    def test_cmd_task_without_confirm(self):
        """Revert without confirm returns 0 but does not modify."""
        row = _make_row()
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [row])
            ),
            mock.patch.object(self.revert, "find_task_by_id", return_value=row),
            mock.patch("builtins.print"),
        ):
            args = _namespace(task_id="T-01", to_state="pending", confirm=False)
            result = self.revert.cmd_task(args)
        self.assertEqual(result, 0)

    def test_cmd_task_not_found(self):
        """Revert a non-existent task raises."""
        row = _make_row()
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [row])
            ),
            mock.patch.object(self.revert, "find_task_by_id", return_value=None),
        ):
            with self.assertRaises(self.revert.ExecutionError):
                self.revert.cmd_task(_namespace(task_id="T-99", to_state="pending", confirm=True))


class RevertSessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.revert = load_module("agents_revert_session_tests", SCRIPT_PATH)

    def test_cmd_session_with_confirm(self):
        """Session revert with confirm resets tasks and report."""
        rows = [_make_row("T-01"), _make_row("T-02")]
        task_file = Path("/tmp/task.md")
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(self.revert, "_resolve_task_file", return_value=(task_file, rows)),
            mock.patch.object(self.revert, "update_task_state"),
            mock.patch.object(
                self.revert,
                "split_frontmatter",
                return_value=({"status": "final", "updated_at": "old"}, "body"),
            ),
            mock.patch.object(self.revert, "write_frontmatter"),
            mock.patch.object(self.revert, "append_timeline_entry"),
            mock.patch.object(self.revert, "now_iso_with_offset", return_value="2026-01-01"),
            mock.patch("builtins.print"),
        ):
            with tempfile.TemporaryDirectory() as td:
                session_dir = Path(td) / "session"
                session_dir.mkdir()
                (session_dir / "260101_report_01.md").write_text("---\nstatus: final\n---\nbody")
                (session_dir / "260101_log_01.md").write_text("# Log\n")
                (session_dir / "260101_task_01.md").write_text("# Task\n")
                with (
                    mock.patch.object(
                        self.revert, "_resolve_session_path", return_value=session_dir
                    ),
                    mock.patch.object(
                        self.revert,
                        "_resolve_task_file",
                        return_value=(session_dir / "260101_task_01.md", rows),
                    ),
                ):
                    result = self.revert.cmd_session(_namespace(confirm=True))
            self.assertEqual(result, 0)

    def test_cmd_session_without_confirm(self):
        """Session revert without confirm shows summary only."""
        rows = [_make_row()]
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), rows)
            ),
            mock.patch("builtins.print"),
        ):
            result = self.revert.cmd_session(_namespace(confirm=False))
        self.assertEqual(result, 0)


class RevertPackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.revert = load_module("agents_revert_pack_tests", SCRIPT_PATH)

    def test_cmd_pack_missing_arg(self):
        """Pack without --pack raises."""
        with mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")):
            with self.assertRaises(self.revert.ExecutionError):
                self.revert.cmd_pack(_namespace(pack=None, confirm=False))

    def test_cmd_pack_not_found(self):
        """Pack not found raises."""
        with tempfile.TemporaryDirectory() as td:
            session_dir = Path(td) / "session"
            session_dir.mkdir()
            (session_dir / "packs").mkdir()
            with mock.patch.object(self.revert, "_resolve_session_path", return_value=session_dir):
                with self.assertRaises(self.revert.ExecutionError):
                    self.revert.cmd_pack(_namespace(pack="nonexistent", confirm=False))

    def test_cmd_pack_without_confirm(self):
        """Pack without confirm shows planned files."""
        with tempfile.TemporaryDirectory() as td:
            # Simulate a pack inside the repo structure
            session_dir = Path(td) / ".agents" / "wb" / "260101_session"
            session_dir.mkdir(parents=True)
            pack_dir = session_dir / "packs" / "pack-01"
            pack_dir.mkdir(parents=True)
            (pack_dir / "file.txt").write_text("content")
            with (
                mock.patch.object(self.revert, "_resolve_session_path", return_value=session_dir),
                mock.patch.object(self.revert, "ROOT_DIR", Path(td)),
                mock.patch("builtins.print"),
            ):
                result = self.revert.cmd_pack(_namespace(pack="pack-01", confirm=False))
            self.assertEqual(result, 0)

    def test_cmd_pack_with_confirm_git_failure(self):
        """Pack with confirm but git restore fails raises."""
        with tempfile.TemporaryDirectory() as td:
            session_dir = Path(td) / ".agents" / "wb" / "260101_session"
            session_dir.mkdir(parents=True)
            pack_dir = session_dir / "packs" / "pack-01"
            pack_dir.mkdir(parents=True)
            (pack_dir / "file.txt").write_text("content")
            with (
                mock.patch.object(self.revert, "_resolve_session_path", return_value=session_dir),
                mock.patch.object(self.revert, "ROOT_DIR", Path(td)),
                mock.patch("subprocess.run", return_value=mock.Mock(returncode=1, stderr="error")),
                mock.patch("builtins.print"),
            ):
                with self.assertRaises(self.revert.ExecutionError):
                    self.revert.cmd_pack(_namespace(pack="pack-01", confirm=True))

    def test_cmd_pack_with_confirm_success(self):
        """Pack with confirm and git restore succeeds."""
        with tempfile.TemporaryDirectory() as td:
            session_dir = Path(td) / ".agents" / "wb" / "260101_session"
            session_dir.mkdir(parents=True)
            pack_dir = session_dir / "packs" / "pack-01"
            pack_dir.mkdir(parents=True)
            (pack_dir / "file.txt").write_text("content")
            with (
                mock.patch.object(self.revert, "_resolve_session_path", return_value=session_dir),
                mock.patch.object(self.revert, "ROOT_DIR", Path(td)),
                mock.patch("subprocess.run", return_value=mock.Mock(returncode=0)),
                mock.patch("builtins.print"),
            ):
                result = self.revert.cmd_pack(_namespace(pack="pack-01", confirm=True))
            self.assertEqual(result, 0)


class RevertPhaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.revert = load_module("agents_revert_phase_tests", SCRIPT_PATH)

    def test_cmd_phase_by_task_id(self):
        """Phase revert matching by task_id."""
        rows = [_make_row("T-01"), _make_row("T-02"), _make_row("T-03")]
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), rows)
            ),
            mock.patch.object(self.revert, "update_task_states_from"),
            mock.patch("builtins.print"),
        ):
            result = self.revert.cmd_phase(_namespace(phase="T-02", confirm=True))
        self.assertEqual(result, 0)

    def test_cmd_phase_by_notes_prefix(self):
        """Phase revert matching by notes prefix."""
        row1 = _make_row("T-01")
        row2 = _make_row("T-02")
        row2.notes = "Phase:cleanup remaining work"
        rows = [row1, row2]
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), rows)
            ),
            mock.patch.object(self.revert, "update_task_states_from"),
            mock.patch("builtins.print"),
        ):
            result = self.revert.cmd_phase(_namespace(phase="cleanup", confirm=True))
        self.assertEqual(result, 0)

    def test_cmd_phase_not_resolvable(self):
        """Phase not found in task board raises."""
        rows = [_make_row("T-01")]
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), rows)
            ),
        ):
            with self.assertRaises(self.revert.ExecutionError):
                self.revert.cmd_phase(_namespace(phase="nonexistent", confirm=True))

    def test_cmd_phase_empty_rows(self):
        """Phase revert with no rows raises."""
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), [])
            ),
        ):
            with self.assertRaises(self.revert.ExecutionError):
                self.revert.cmd_phase(_namespace(phase="T-01", confirm=True))

    def test_cmd_phase_without_confirm(self):
        """Phase revert without confirm shows summary."""
        rows = [_make_row("T-01")]
        with (
            mock.patch.object(self.revert, "_resolve_session_path", return_value=Path("/tmp/s")),
            mock.patch.object(
                self.revert, "_resolve_task_file", return_value=(Path("/tmp/task.md"), rows)
            ),
            mock.patch("builtins.print"),
        ):
            result = self.revert.cmd_phase(_namespace(phase="T-01", confirm=False))
        self.assertEqual(result, 0)


class RevertMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.revert = load_module("agents_revert_main_tests", SCRIPT_PATH)

    def test_main_exception_returns_1(self):
        """main() catches exception and returns 1."""
        with mock.patch.object(self.revert, "build_parser") as mock_parser:
            mock_parser.return_value.parse_args.return_value = mock.Mock(
                func=mock.Mock(side_effect=Exception("boom"))
            )
            with mock.patch("builtins.print"):
                result = self.revert.main()
        self.assertEqual(result, 1)
