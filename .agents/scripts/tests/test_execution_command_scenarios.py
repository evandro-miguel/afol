import argparse
import contextlib
import importlib
import importlib.util
import io
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


def write_task_file(session_dir: Path, body: str) -> Path:
    task_file = session_dir / f"{session_dir.name}_task_01.md"
    task_file.write_text(
        "---\n"
        "doc_type: task\n"
        "id: scenario-task\n"
        "updated_at: '2026-03-06T21:28:26-03:00'\n"
        "roadmap_feature: F-08\n"
        "links:\n"
        "  plan: scenario-plan\n"
        "---\n\n"
        "# Tasks\n\n"
        "## State Board\n\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return task_file


def write_plan_file(session_dir: Path) -> Path:
    plan_file = session_dir / f"{session_dir.name}_plan_01.md"
    plan_file.write_text(
        "---\n"
        "doc_type: plan\n"
        "id: scenario-plan\n"
        "roadmap_feature: F-08\n"
        "---\n\n"
        "# Plan\n",
        encoding="utf-8",
    )
    return plan_file


def write_report_file(session_dir: Path, status: str = "active") -> Path:
    report_file = session_dir / f"{session_dir.name}_report_01.md"
    report_file.write_text(
        "---\n"
        "doc_type: report\n"
        f"status: {status}\n"
        "updated_at: '2026-03-06T21:28:26-03:00'\n"
        "---\n\n"
        "# Report\n",
        encoding="utf-8",
    )
    return report_file


def write_log_file(session_dir: Path) -> Path:
    log_file = session_dir / f"{session_dir.name}_log_01.md"
    log_file.write_text(
        "---\n"
        "doc_type: log\n"
        "updated_at: '2026-03-06T21:28:26-03:00'\n"
        "---\n\n"
        "# Log\n\n"
        "## Timeline\n",
        encoding="utf-8",
    )
    return log_file


class ExecutionCommandsScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scripts_dir = Path(".agents/scripts").resolve()
        sys.path.insert(0, str(scripts_dir))
        cls.execution_commands = importlib.import_module("lib.execution_commands")

    def test_parse_task_rows_checklist_markers(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0100_markers"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_task_file(
                session_dir,
                "- [ ] T-01 pending\n"
                "- [/] T-02 in progress\n"
                "- [%] T-03 ready\n"
                "- [x] T-04 done\n"
                "- [!] T-05 blocked\n"
                "- [>] T-06 skipped",
            )

            rows = self.execution_commands.parse_task_rows(task_file)
            states = {row.task_id: row.state for row in rows}
            self.assertEqual(states["T-01"], "pending")
            self.assertEqual(states["T-02"], "in_progress")
            self.assertEqual(states["T-03"], "ready_for_test")
            self.assertEqual(states["T-04"], "done")
            self.assertEqual(states["T-05"], "blocked")
            self.assertEqual(states["T-06"], "skipped")

    def test_next_task_prefers_first_actionable_when_no_in_progress(self):
        rows = [
            self.execution_commands.TaskRow("T-01", "ready_for_test", "qa", "ready", 0, "table"),
            self.execution_commands.TaskRow("T-02", "pending", "worker", "pending", 1, "table"),
        ]
        nxt = self.execution_commands.next_task(rows)
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.task_id, "T-01")

    def test_assert_task_sequence_reports_prior_non_done(self):
        rows = [
            self.execution_commands.TaskRow("T-01", "done", "worker", "ok", 0, "table"),
            self.execution_commands.TaskRow("T-02", "blocked", "worker", "blocked", 1, "table"),
            self.execution_commands.TaskRow("T-03", "pending", "worker", "later", 2, "table"),
        ]
        blocking = self.execution_commands.assert_task_sequence(rows, "T-03")
        self.assertEqual(blocking, ["T-02 is blocked"])

    def test_update_task_state_table_row(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0101_update-table"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | note |",
            )

            changed = self.execution_commands.update_task_state(task_file, "T-01", "in_progress")
            self.assertTrue(changed)
            content = task_file.read_text(encoding="utf-8")
            self.assertIn("| T-01 | in_progress | worker | note |", content)

    def test_update_task_state_checklist_row(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0102_update-check"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_task_file(session_dir, "- [ ] T-01 checklist item")

            changed = self.execution_commands.update_task_state(task_file, "T-01", "done")
            self.assertTrue(changed)
            content = task_file.read_text(encoding="utf-8")
            self.assertIn("- [x] T-01 checklist item", content)

    def test_update_task_state_invalid_state_raises(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0103_invalid-state"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_task_file(session_dir, "- [ ] T-01 item")
            with self.assertRaises(self.execution_commands.ExecutionError):
                self.execution_commands.update_task_state(task_file, "T-01", "testing")

    def test_update_task_states_from_updates_suffix_only(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0104_suffix"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | first |\n"
                "| T-02 | done | worker | second |\n"
                "| T-03 | in_progress | worker | third |",
            )

            updated = self.execution_commands.update_task_states_from(task_file, "T-02", "pending")
            self.assertEqual(updated, 2)
            content = task_file.read_text(encoding="utf-8")
            self.assertIn("| T-01 | done |", content)
            self.assertIn("| T-02 | pending |", content)
            self.assertIn("| T-03 | pending |", content)

    def test_append_evidence_and_count_ignores_invalid_json(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0105_evidence"
            session_dir.mkdir(parents=True, exist_ok=True)
            self.execution_commands.append_evidence(
                session_dir,
                "T-01",
                command="make test-scripts",
                result="passed",
            )
            evidence_path = session_dir / ".evidence.jsonl"
            evidence_path.write_text(evidence_path.read_text(encoding="utf-8") + "{invalid\n", encoding="utf-8")
            count = self.execution_commands.evidence_count(session_dir, "T-01")
            self.assertEqual(count, 1)

    def test_context_readiness_missing_when_session_has_no_docs(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0106_missing"
            session_dir.mkdir(parents=True, exist_ok=True)
            ready, missing = self.execution_commands.context_readiness(session_dir)
            self.assertFalse(ready)
            self.assertIn("task", missing)
            self.assertIn("plan", missing)
            self.assertIn("report", missing)
            self.assertIn("log", missing)

    def test_resolve_artifact_tech_stack_alias_variants(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0107_alias"
            session_dir.mkdir(parents=True, exist_ok=True)
            a = self.execution_commands.resolve_artifact(session_dir, "tech-stack")
            b = self.execution_commands.resolve_artifact(session_dir, "tech_stack")
            self.assertIsNotNone(a)
            self.assertEqual(a, b)


class ImplementAndReviewScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scripts_dir = Path(".agents/scripts").resolve()
        sys.path.insert(0, str(scripts_dir))
        cls.agents_implement = load_module("agents_implement_scenario_test", scripts_dir / "agents-implement.py")
        cls.agents_review = load_module("agents_review_scenario_test", scripts_dir / "agents-review.py")
        cls.execution_commands = importlib.import_module("lib.execution_commands")

    def test_implement_start_defaults_to_next_task(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0200_start-default"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | first |",
            )
            write_log_file(session_dir)
            args = argparse.Namespace(session=str(session_dir), task_id=None)
            code = self.agents_implement.cmd_start(args)
            self.assertEqual(code, 0)
            content = (session_dir / f"{session_dir.name}_task_01.md").read_text(encoding="utf-8")
            self.assertIn("| T-01 | in_progress |", content)

    def test_implement_start_rejects_blocked_task(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0201_start-blocked"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | blocked | worker | first |",
            )
            args = argparse.Namespace(session=str(session_dir), task_id="T-01")
            with self.assertRaises(self.agents_implement.ExecutionError):
                self.agents_implement.cmd_start(args)

    def test_implement_complete_writes_evidence_and_done(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0202_complete-evidence"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | in_progress | worker | first |",
            )
            write_log_file(session_dir)
            args = argparse.Namespace(
                session=str(session_dir),
                task_id="T-01",
                command="make test-scripts",
                result="passed",
                artifact=[".agents/scripts/tests"],
                note="scenario",
                no_evidence=False,
                force=False,
            )
            code = self.agents_implement.cmd_complete(args)
            self.assertEqual(code, 0)
            task_content = (session_dir / f"{session_dir.name}_task_01.md").read_text(encoding="utf-8")
            self.assertIn("| T-01 | done |", task_content)
            evidence_path = session_dir / ".evidence.jsonl"
            data = [json.loads(line) for line in evidence_path.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["task_id"], "T-01")
            self.assertEqual(data[0]["command"], "make test-scripts")

    def test_review_scope_verify_success(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0203_review-verify-ok"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_plan_file(session_dir)
            write_task_file(
                session_dir,
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | done | worker | first |",
            )
            write_report_file(session_dir, status="final")
            with mock.patch.object(self.agents_review, "run_verify_tasks", return_value=(0, "ok\n", "")):
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    code = self.agents_review.cmd_scope(session_dir, "verify")
            self.assertEqual(code, 0)
            self.assertIn("[INFO][verify]: verify-tasks checks passed", buf.getvalue())

    def test_review_scope_filters_to_task_findings(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0204_review-task-scope"
            session_dir.mkdir(parents=True, exist_ok=True)
            with mock.patch.object(
                self.agents_review,
                "inspect_artifacts",
                return_value=[
                    {"scope": "plan", "severity": "warning", "message": "plan warn"},
                    {"scope": "task", "severity": "error", "message": "task error"},
                ],
            ):
                with mock.patch.object(self.agents_review, "run_verify_tasks", return_value=(0, "", "")):
                    buf = io.StringIO()
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_review.cmd_scope(session_dir, "task")
            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("[ERROR][task]: task error", output)
            self.assertNotIn("plan warn", output)

    def test_review_scope_verify_failure_is_error(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0205_review-verify-fail"
            session_dir.mkdir(parents=True, exist_ok=True)
            with mock.patch.object(self.agents_review, "inspect_artifacts", return_value=[]):
                with mock.patch.object(self.agents_review, "run_verify_tasks", return_value=(1, "bad\n", "err\n")):
                    buf = io.StringIO()
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_review.cmd_scope(session_dir, "verify")
            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("[ERROR][verify]: verify-tasks reports failures", output)


class SessionCloseScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scripts_dir = Path(".agents/scripts").resolve()
        sys.path.insert(0, str(scripts_dir))
        cls.agents_session = load_module("agents_session_scenario_test", scripts_dir / "agents-session.py")

    def test_resolve_next_session_rejects_same_target(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "260307_0300_target"
            target.mkdir(parents=True, exist_ok=True)
            with self.assertRaises(self.agents_session.ExecutionError):
                self.agents_session._resolve_next_session(str(target), target)

    def test_close_json_with_missing_active_file(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "260307_0301_close-json"
            target.mkdir(parents=True, exist_ok=True)
            args = argparse.Namespace(session=str(target), next_session=None, json=True)
            verify = mock.Mock(returncode=0, stdout="ok\n", stderr="")
            missing_active = Path(td) / ".active_missing"
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", missing_active):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)
            self.assertEqual(code, 0)
            payload = json.loads(buf.getvalue())
            self.assertEqual(payload["pointer_action"], "unchanged")
            self.assertIsNone(payload["active_session_before"])

    def test_close_failure_prints_stderr_and_preserves_active(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "260307_0302_close-fail"
            target.mkdir(parents=True, exist_ok=True)
            active_file = Path(td) / ".active_session"
            active_file.write_text("260307_0302_close-fail\n", encoding="utf-8")
            args = argparse.Namespace(session=str(target), next_session=None, json=False)
            verify = mock.Mock(returncode=1, stdout="stdout fail\n", stderr="stderr fail\n")
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", active_file):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)
            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("stdout fail", output)
            self.assertIn("stderr fail", output)
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), "260307_0302_close-fail")

    def test_close_repoint_from_unset_active(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            target = Path(td) / "260307_0303_close-target"
            next_session = Path(td) / "260307_0304_close-next"
            target.mkdir(parents=True, exist_ok=True)
            next_session.mkdir(parents=True, exist_ok=True)
            active_file = Path(td) / ".active_session"
            args = argparse.Namespace(session=str(target), next_session=str(next_session), json=False)
            verify = mock.Mock(returncode=0, stdout="ok\n", stderr="")
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", active_file):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)
            self.assertEqual(code, 0)
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), next_session.name)
            self.assertIn("active_session: unset ->", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
