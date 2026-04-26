import importlib.util
import argparse
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


class AgentsWbUpdateTaskMarkerTests(unittest.TestCase):
    @staticmethod
    def _valid_postmortem_body() -> str:
        return (
            "# Postmortem\n\n"
            "## Governance Promotion Review\n\n"
            "- Lesson entry needed: no\n"
            "- Rule update needed: yes\n"
            "- ADR or decision record needed: no\n"
            "- Skill or doc update needed: yes\n"
            "- Evidence reviewed: task_01, report_01, ./.agents/agents verify-tasks --strict\n"
            "- Follow-up recorded: yes\n"
        )

    @staticmethod
    def _build_task_args(session: str, task_id: str, **overrides):
        args = {
            "session": session,
            "task_id": task_id,
            "evidence_id": None,
            "allow_unsafe_done": False,
            "mark_done": False,
            "mark_in_progress": False,
            "mark_pending": False,
            "mark_ready": False,
            "mark_blocked": False,
            "mark_skipped": False,
        }
        args.update(overrides)
        return argparse.Namespace(**args)

    def test_require_explicit_session_for_write_commands(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_require_session_test", script_path)

        no_scope_args = argparse.Namespace(
            session=None,
            file=None,
            all_wb=False,
            report=None,
        )
        with self.assertRaises(ValueError):
            wb_update.require_explicit_session(no_scope_args, "task")

        explicit_session_args = argparse.Namespace(
            **{
                "sess" + "ion": "260224_1030_scripts-lean-efficiency",
                "file": None,
                "all_wb": False,
                "report": None,
            }
        )
        wb_update.require_explicit_session(explicit_session_args, "task")

        file_scoped_args = argparse.Namespace(
            session=None,
            file=".agents/wb/260224_1030_scripts-lean-efficiency/260224_1030_scripts-lean-efficiency_plan_01.md",
            all_wb=False,
            report=None,
        )
        wb_update.require_explicit_session(file_scoped_args, "touch")

        report_scoped_args = argparse.Namespace(
            session=None,
            file=None,
            all_wb=False,
            report=".agents/wb/260224_1030_scripts-lean-efficiency/260224_1030_scripts-lean-efficiency_report_01.md",
        )
        wb_update.require_explicit_session(report_scoped_args, "files-changed")

    def test_update_task_marker_does_not_break_checkbox_format(self):
        """Test that updating task markers preserves State Board format."""
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            task_file = Path(td) / "task.md"
            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Tasks\n\n"
                "## State Board\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | Fix auth\n"
            )

            wb_update.update_task_markers(task_file, "T-01", "x", "done")
            content = task_file.read_text()

            # State Board format should be updated
            self.assertIn("| T-01 | done | worker |", content)

    def test_latest_doc_file_spec_child_alias_reads_historical_spec_lite(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_spec_alias_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_spec-alias"
            session_dir.mkdir(parents=True, exist_ok=True)
            spec_lite = session_dir / "260224_0000_spec-alias_spec-lite_01.md"
            spec_lite.write_text(
                "---\n"
                "doc_type: spec-lite\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Spec Lite\n",
                encoding="utf-8",
            )

            resolved = wb_update.latest_doc_file(session_dir, "spec-child")
            self.assertEqual(resolved, spec_lite)

    def test_mark_done_requires_evidence_unless_bypassed(self):
        """Test that mark-done requires evidence unless bypassed."""
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_mark_done_gate_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_gate-test"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = session_dir / "260224_0000_gate-test_task_01.md"
            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Tasks\n\n"
                "## State Board\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | Add gate\n"
            )

            args_missing = self._build_task_args(
                session=str(session_dir),
                task_id="T-01",
                mark_done=True,
            )
            with self.assertRaises(ValueError):
                wb_update.cmd_task(args_missing)

            args_unsafe = self._build_task_args(
                session=str(session_dir),
                task_id="T-01",
                mark_done=True,
                allow_unsafe_done=True,
            )
            wb_update.cmd_task(args_unsafe)
            content = task_file.read_text()
            self.assertIn("| T-01 | done |", content)

    def test_evidence_ledger_validates_mark_done_reference(self):
        """Test that evidence ledger validates mark-done reference."""
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_evidence_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_evidence-test"
            session_dir.mkdir(parents=True, exist_ok=True)
            task_file = session_dir / "260224_0000_evidence-test_task_01.md"
            task_file.write_text(
                "---\n"
                "doc_type: task\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Tasks\n\n"
                "## State Board\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | Add evidence flow\n"
            )

            record = wb_update.append_evidence_record(
                session_dir=session_dir,
                task_id="T-01",
                command="just verify-tasks --strict",
                result="passed",
                artifacts=[".agents/scripts/verify-tasks.py"],
                note="strict run evidence",
            )
            ledger_file = session_dir / ".evidence.jsonl"
            self.assertTrue(ledger_file.exists())
            loaded = [json.loads(line) for line in ledger_file.read_text().splitlines() if line.strip()]
            self.assertEqual(len(loaded), 1)
            self.assertEqual(loaded[0]["id"], record["id"])

            args_done = self._build_task_args(
                session=str(session_dir),
                task_id="T-01",
                mark_done=True,
                evidence_id=record["id"],
            )
            wb_update.cmd_task(args_done)
            content = task_file.read_text()
            self.assertIn("| T-01 | done |", content)

            args_mismatch = self._build_task_args(
                session=str(session_dir),
                task_id="T-02",
                mark_done=True,
                evidence_id=record["id"],
            )
            with self.assertRaises(ValueError):
                wb_update.cmd_task(args_mismatch)

    def test_status_final_on_report_records_session_end(self):
        """Setting the report to final should emit a session_end telemetry event."""
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_session_end_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_report-final"
            session_dir.mkdir(parents=True, exist_ok=True)
            report_file = session_dir / "260224_0000_report-final_report_01.md"
            postmortem_file = session_dir / "260224_0000_report-final_postmortem_01.md"
            report_file.write_text(
                "---\n"
                "doc_type: report\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Report\n"
            )
            postmortem_file.write_text(
                "---\n"
                "doc_type: postmortem\n"
                "status: final\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Postmortem\n"
            )

            args = argparse.Namespace(session=str(session_dir), file="report", value="final")
            with mock.patch.object(wb_update, "maybe_record_session_end") as record_mock:
                wb_update.cmd_status(args)

            content = report_file.read_text()
            self.assertIn("status: final", content)
            record_mock.assert_called_once_with(session_dir, "wb-update status")

    def test_status_final_on_report_passes_without_optional_artifacts(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_report_final_no_optional_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_report-final-no-optional"
            session_dir.mkdir(parents=True, exist_ok=True)
            report_file = session_dir / "260224_0000_report-final-no-optional_report_01.md"
            report_file.write_text(
                "---\n"
                "doc_type: report\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Report\n"
            )

            args = argparse.Namespace(session=str(session_dir), file="report", value="final")
            with mock.patch.object(wb_update, "maybe_record_session_end") as record_mock:
                wb_update.cmd_status(args)

            self.assertIn("status: final", report_file.read_text())
            record_mock.assert_called_once_with(session_dir, "wb-update status")

    def test_status_final_on_report_blocks_with_active_optional_artifact(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_report_final_block_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_report-final-blocked"
            session_dir.mkdir(parents=True, exist_ok=True)
            report_file = session_dir / "260224_0000_report-final-blocked_report_01.md"
            report_file.write_text(
                "---\n"
                "doc_type: report\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Report\n"
            )
            (session_dir / "260224_0000_report-final-blocked_brainstorm_01.md").write_text(
                "---\n"
                "doc_type: brainstorm\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Brainstorm\n"
            )

            args = argparse.Namespace(session=str(session_dir), file="report", value="final")
            with self.assertRaises(ValueError):
                wb_update.cmd_status(args)
            self.assertIn("status: active", report_file.read_text())

    def test_status_final_on_postmortem_blocks_without_governance_review(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_postmortem_final_block_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_postmortem-final-blocked"
            session_dir.mkdir(parents=True, exist_ok=True)
            postmortem_file = session_dir / "260224_0000_postmortem-final-blocked_postmortem_01.md"
            postmortem_file.write_text(
                "---\n"
                "doc_type: postmortem\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                "# Postmortem\n"
            )

            args = argparse.Namespace(session=str(session_dir), file="postmortem", value="final")
            with self.assertRaises(ValueError):
                wb_update.cmd_status(args)

            self.assertIn("status: active", postmortem_file.read_text())

    def test_status_final_on_postmortem_passes_with_governance_review(self):
        script_path = Path(".agents/scripts/agents-wb-update.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        wb_update = load_module("agents_wb_update_postmortem_final_ok_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            session_dir = Path(td) / "260224_0000_postmortem-final-ok"
            session_dir.mkdir(parents=True, exist_ok=True)
            postmortem_file = session_dir / "260224_0000_postmortem-final-ok_postmortem_01.md"
            postmortem_file.write_text(
                "---\n"
                "doc_type: postmortem\n"
                "status: active\n"
                "updated_at: \"2026-02-23T00:00:00-03:00\"\n"
                "---\n\n"
                + self._valid_postmortem_body()
            )

            args = argparse.Namespace(session=str(session_dir), file="postmortem", value="final")
            wb_update.cmd_status(args)

            self.assertIn("status: final", postmortem_file.read_text())


if __name__ == "__main__":
    unittest.main()
