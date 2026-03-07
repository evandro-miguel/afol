import argparse
import contextlib
import importlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
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


def write_session_task(session_dir: Path, body: str) -> Path:
    task_file = session_dir / f"{session_dir.name}_task_01.md"
    task_file.write_text(
        "---\n"
        "doc_type: task\n"
        "id: task-test\n"
        "updated_at: '2026-03-06T21:28:26-03:00'\n"
        "roadmap_feature: F-08\n"
        "links:\n"
        "  plan: test-plan\n"
        "---\n\n"
        "# Tasks\n\n"
        "## State Board\n\n"
        "| Task | State | Owner | Notes |\n"
        "|------|-------|-------|-------|\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return task_file


def write_session_plan(session_dir: Path) -> None:
    plan_file = session_dir / f"{session_dir.name}_plan_01.md"
    plan_file.write_text(
        "---\n"
        "doc_type: plan\n"
        "id: test-plan\n"
        "roadmap_feature: F-08\n"
        "---\n\n"
        "# Plan\n",
        encoding="utf-8",
    )


def write_session_log(session_dir: Path) -> None:
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


def write_session_report(session_dir: Path, status: str = "final") -> None:
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


def write_session_research(session_dir: Path) -> None:
    research_file = session_dir / f"{session_dir.name}_research_01.md"
    research_file.write_text(
        "---\n"
        "doc_type: research\n"
        "updated_at: '2026-03-06T21:28:26-03:00'\n"
        "---\n\n"
        "# Research\n",
        encoding="utf-8",
    )


class ExecutionCommandFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scripts_dir = Path(".agents/scripts").resolve()
        sys.path.insert(0, str(scripts_dir))
        cls.execution_commands = importlib.import_module("lib.execution_commands")
        cls.agents_implement = load_module("agents_implement_flow_test", scripts_dir / "agents-implement.py")
        cls.agents_review = load_module("agents_review_flow_test", scripts_dir / "agents-review.py")
        cls.agents_revert = load_module("agents_revert_flow_test", scripts_dir / "agents-revert.py")
        cls.agents_session = load_module("agents_session_flow_test", scripts_dir / "agents-session.py")

    def test_next_task_prioritizes_in_progress(self):
        rows = [
            self.execution_commands.TaskRow("T-01", "pending", "worker", "first", 0, "table"),
            self.execution_commands.TaskRow("T-02", "in_progress", "worker", "second", 1, "table"),
            self.execution_commands.TaskRow("T-03", "pending", "worker", "third", 2, "table"),
        ]
        nxt = self.execution_commands.next_task(rows)
        self.assertIsNotNone(nxt)
        self.assertEqual(nxt.task_id, "T-02")

    def test_resolve_artifact_supports_context_aliases(self):
        session_dir = Path(".agents/wb/260306_2128_context-driven-execution-commands").resolve()
        product = self.execution_commands.resolve_artifact(session_dir, "product")
        guidelines = self.execution_commands.resolve_artifact(session_dir, "guidelines")
        tech_stack = self.execution_commands.resolve_artifact(session_dir, "tech-stack")
        active_task = self.execution_commands.resolve_artifact(session_dir, "active_task")

        self.assertIsNotNone(product)
        self.assertIsNotNone(guidelines)
        self.assertIsNotNone(tech_stack)
        self.assertIsNotNone(active_task)
        self.assertEqual(product.name, "PROJECT-BRIEF.md")
        self.assertEqual(guidelines.name, "ENGINEERING-GUIDELINES.md")
        self.assertEqual(tech_stack.name, "TECH-STACK.md")
        self.assertTrue(active_task.name.endswith("_task_01.md"))

    def test_implement_start_rejects_out_of_order_task(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0000_flow-test"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(
                session_dir,
                "| T-01 | pending | worker | first |\n"
                "| T-02 | pending | worker | second |",
            )

            args = argparse.Namespace(session=str(session_dir), task_id="T-02")
            with self.assertRaises(self.agents_implement.ExecutionError):
                self.agents_implement.cmd_start(args)

    def test_implement_complete_requires_started_state(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0001_complete-gate"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_session_task(session_dir, "| T-01 | pending | worker | first |")

            args = argparse.Namespace(
                session=str(session_dir),
                task_id="T-01",
                command="implement complete",
                result="passed",
                artifact=None,
                note=None,
                no_evidence=True,
                force=True,
            )
            with self.assertRaises(self.agents_implement.ExecutionError):
                self.agents_implement.cmd_complete(args)

    def test_review_scope_task_reports_verify_failure(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0002_review-scope"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_session_plan(session_dir)
            write_session_task(session_dir, "| T-01 | pending | worker | first |")

            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = self.agents_review.cmd_scope(session_dir, "task")

            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertIn("[ERROR][task]: Task verification reports failures", output)

    def test_revert_task_requires_confirm_before_mutation(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0003_revert-task"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_session_task(
                session_dir,
                "| T-01 | done | worker | first |\n"
                "| T-02 | done | worker | second |",
            )
            write_session_log(session_dir)

            args = argparse.Namespace(
                session=str(session_dir),
                task_id="T-01",
                to_state="pending",
                confirm=False,
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = self.agents_revert.cmd_task(args)

            output = buf.getvalue()
            content = task_file.read_text(encoding="utf-8")
            self.assertEqual(code, 0)
            self.assertIn("Re-run with --confirm", output)
            self.assertIn("| T-01 | done |", content)
            self.assertIn("| T-02 | done |", content)

    def test_revert_session_confirm_resets_tasks_and_report(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260307_0004_revert-session"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = write_session_task(
                session_dir,
                "| T-01 | done | worker | first |\n"
                "| T-02 | in_progress | worker | second |",
            )
            report_file = session_dir / f"{session_dir.name}_report_01.md"
            write_session_report(session_dir, status="final")
            write_session_log(session_dir)

            args = argparse.Namespace(session=str(session_dir), confirm=True)
            code = self.agents_revert.cmd_session(args)

            self.assertEqual(code, 0)
            task_content = task_file.read_text(encoding="utf-8")
            report_content = report_file.read_text(encoding="utf-8")
            self.assertIn("| T-01 | pending |", task_content)
            self.assertIn("| T-02 | pending |", task_content)
            self.assertIn("status: active", report_content)

    def test_revert_pack_raises_when_git_restore_fails(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0005_revert-pack"
            pack_dir = session_dir / "packs" / "alpha"
            pack_dir.mkdir(parents=True, exist_ok=True)
            (pack_dir / "artifact.md").write_text("# artifact\n", encoding="utf-8")

            args = argparse.Namespace(session=str(session_dir), pack="alpha", confirm=True)
            result = mock.Mock(returncode=1, stderr="restore failed")
            with mock.patch.object(self.agents_revert, "ROOT_DIR", temp_root):
                with mock.patch.object(self.agents_revert.subprocess, "run", return_value=result):
                    with self.assertRaises(self.agents_revert.ExecutionError):
                        self.agents_revert.cmd_pack(args)

    def test_session_close_repoints_active_session_when_requested(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0006_close-target"
            next_session = temp_root / "260307_0007_close-next"
            session_dir.mkdir(parents=True, exist_ok=True)
            next_session.mkdir(parents=True, exist_ok=True)
            active_file = temp_root / ".active_session"
            active_file.write_text(f"{session_dir.name}\n", encoding="utf-8")

            args = argparse.Namespace(
                session=str(session_dir),
                next_session=str(next_session),
                json=False,
            )
            verify = mock.Mock(returncode=0, stdout="strict ok\n", stderr="")
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", active_file):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), next_session.name)
            self.assertIn("✓ session closed", output)
            self.assertIn("->", output)

    def test_session_close_keeps_active_pointer_by_default(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0008_close-retain"
            session_dir.mkdir(parents=True, exist_ok=True)
            active_file = temp_root / ".active_session"
            active_file.write_text(f"{session_dir.name}\n", encoding="utf-8")

            args = argparse.Namespace(
                session=str(session_dir),
                next_session=None,
                json=False,
            )
            verify = mock.Mock(returncode=0, stdout="strict ok\n", stderr="")
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", active_file):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), session_dir.name)
            self.assertIn("remains the default pointer", output)

    def test_session_close_aborts_when_strict_verify_fails(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0009_close-fail"
            session_dir.mkdir(parents=True, exist_ok=True)
            active_file = temp_root / ".active_session"
            active_file.write_text(f"{session_dir.name}\n", encoding="utf-8")

            args = argparse.Namespace(
                session=str(session_dir),
                next_session=None,
                json=False,
            )
            verify = mock.Mock(returncode=1, stdout="strict failed\n", stderr="")
            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", active_file):
                with mock.patch.object(self.agents_session, "_run_strict_verify", return_value=verify):
                    with contextlib.redirect_stdout(buf):
                        code = self.agents_session.cmd_close(args)

            output = buf.getvalue()
            self.assertEqual(code, 1)
            self.assertEqual(active_file.read_text(encoding="utf-8").strip(), session_dir.name)
            self.assertIn("closure aborted", output)

    def test_session_catchup_reports_repo_drift_and_next_step(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0010_catchup"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_session_plan(session_dir)
            write_session_task(session_dir, "| T-01 | pending | worker | first |")
            write_session_log(session_dir)
            write_session_report(session_dir, status="active")
            (temp_root / "src").mkdir(parents=True, exist_ok=True)
            changed_file = temp_root / "src" / "app.py"
            changed_file.write_text("print('drift')\n", encoding="utf-8")
            future = time.time() + 120
            os.utime(changed_file, (future, future))

            args = argparse.Namespace(session=str(session_dir), json=True, paths_limit=10)
            git_status = mock.Mock(returncode=0, stdout=" M src/app.py\n", stderr="")

            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ROOT_DIR", temp_root):
                with mock.patch.object(self.agents_session, "ACTIVE_SESSION_FILE", temp_root / ".active_session"):
                    with mock.patch.object(self.execution_commands, "ROOT_DIR", temp_root):
                        with mock.patch.object(self.execution_commands.subprocess, "run", return_value=git_status):
                            with contextlib.redirect_stdout(buf):
                                code = self.agents_session.cmd_catchup(args)

            payload = json.loads(buf.getvalue())
            self.assertEqual(code, 0)
            self.assertTrue(payload["catchup_required"])
            self.assertEqual(payload["git"]["repo_changed"], 1)
            self.assertIn("src/app.py", payload["git"]["repo_paths"])
            self.assertIn("session log", payload["next_step"].lower())

    def test_session_catchup_warns_when_research_missing_for_governed_plan(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0011_catchup-research"
            session_dir.mkdir(parents=True, exist_ok=True)
            (session_dir / f"{session_dir.name}_plan_01.md").write_text(
                "---\n"
                "doc_type: plan\n"
                "id: test-plan\n"
                "roadmap_feature: F-09\n"
                "links:\n"
                "  research: test-research\n"
                "---\n\n"
                "# Plan\n",
                encoding="utf-8",
            )
            write_session_task(session_dir, "| T-01 | pending | worker | first |")
            write_session_log(session_dir)
            write_session_report(session_dir, status="active")

            args = argparse.Namespace(session=str(session_dir), json=True, paths_limit=10)
            git_status = mock.Mock(returncode=0, stdout="", stderr="")

            buf = io.StringIO()
            with mock.patch.object(self.agents_session, "ROOT_DIR", temp_root):
                with mock.patch.object(self.execution_commands, "ROOT_DIR", temp_root):
                    with mock.patch.object(self.execution_commands.subprocess, "run", return_value=git_status):
                        with contextlib.redirect_stdout(buf):
                            code = self.agents_session.cmd_catchup(args)

            payload = json.loads(buf.getvalue())
            self.assertEqual(code, 0)
            self.assertTrue(payload["catchup_required"])
            self.assertTrue(any("research artifact" in warning.lower() for warning in payload["warnings"]))

    def test_review_reports_catchup_warning_when_git_drift_exists(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            temp_root = Path(td)
            session_dir = temp_root / "260307_0012_review-catchup"
            session_dir.mkdir(parents=True, exist_ok=True)
            write_session_plan(session_dir)
            write_session_task(session_dir, "| T-01 | pending | worker | first |")
            write_session_log(session_dir)
            write_session_report(session_dir, status="active")
            write_session_research(session_dir)
            (temp_root / "src").mkdir(parents=True, exist_ok=True)
            changed_file = temp_root / "src" / "app.py"
            changed_file.write_text("print('drift')\n", encoding="utf-8")
            future = time.time() + 120
            os.utime(changed_file, (future, future))

            git_status = mock.Mock(returncode=0, stdout=" M src/app.py\n", stderr="")
            buf = io.StringIO()
            with mock.patch.object(self.execution_commands, "ROOT_DIR", temp_root):
                with mock.patch.object(self.execution_commands.subprocess, "run", return_value=git_status):
                    with mock.patch.object(self.agents_review, "run_verify_tasks", return_value=(0, "verify ok\n", "")):
                        with contextlib.redirect_stdout(buf):
                            code = self.agents_review.cmd_scope(session_dir, "all")

            output = buf.getvalue()
            self.assertEqual(code, 0)
            self.assertIn("Session catchup advised", output)


if __name__ == "__main__":
    unittest.main()
