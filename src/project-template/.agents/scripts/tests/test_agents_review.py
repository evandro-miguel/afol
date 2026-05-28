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


SCRIPT_PATH = Path(".agents/scripts/agents-review.py").resolve()


class ReviewInspectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = load_module("agents_review_inspect_tests", SCRIPT_PATH)

    def _make_session(self, plan_fm=None, task_fm=None, spec_body=None, report_body=None):
        """Create a temp session directory with specified artifacts."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "260401_review_test"
        session_dir.mkdir()
        if plan_fm:
            (session_dir / "260401_plan_01.md").write_text(f"---\n{plan_fm}\n---\n# Plan\n")
        if task_fm:
            (session_dir / "260401_task_01.md").write_text(f"---\n{task_fm}\n---\n# Task\n| Task | State | Owner | Slice | Acceptance |\n|------|-------|-------|-------|------------|\n| T-01 | done | dev | S-01 | Accept |")
        if spec_body:
            (session_dir / "260401_spec-child_01.md").write_text(f"---\nstatus: final\n---\n{spec_body}")
        if report_body:
            (session_dir / "260401_report_01.md").write_text(f"---\nstatus: final\n---\n{report_body}")
        return session_dir

    def test_inspect_artifacts_no_task(self):
        """Missing task artifact reports error."""
        session_dir = self._make_session()
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        errors = [f for f in findings if f["severity"] == "error"]
        self.assertTrue(any("task" in f["scope"] for f in errors))

    def test_inspect_artifacts_no_plan(self):
        """Missing plan artifact reports info."""
        session_dir = self._make_session(task_fm="id: t1\nroadmap_feature: F-01\nlinks:\n  plan: p1")
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("plan" in f["scope"] for f in findings))

    def test_inspect_artifacts_plan_no_frontmatter(self):
        """Plan with no frontmatter reports error."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        (session_dir / "260401_plan_01.md").write_text("# Plan with no frontmatter\n")
        (session_dir / "260401_task_01.md").write_text(
            "---\nid: t1\nroadmap_feature: F-01\nlinks:\n  plan: p1\n---\n# Task\n"
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("frontmatter" in f["message"].lower() for f in findings))

    def test_inspect_artifacts_roadmap_mismatch(self):
        """Task and plan roadmap_feature mismatch reports error."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        (session_dir / "260401_plan_01.md").write_text("---\nid: p1\nroadmap_feature: F-01\n---\n# Plan\n")
        (session_dir / "260401_task_01.md").write_text(
            "---\nid: t1\nroadmap_feature: F-02\nlinks:\n  plan: p1\n---\n# Task\n"
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("roadmap_feature" in f["message"] for f in findings))

    def test_inspect_artifacts_link_mismatch(self):
        """Task plan link mismatch reports warning."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        (session_dir / "260401_plan_01.md").write_text("---\nid: p1\nroadmap_feature: F-01\n---\n# Plan\n")
        (session_dir / "260401_task_01.md").write_text(
            "---\nid: t1\nroadmap_feature: F-01\nlinks:\n  plan: wrong-id\n---\n# Task\n"
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("link" in f["message"].lower() for f in findings))

    def test_inspect_artifacts_no_spec(self):
        """Missing spec artifact reports info."""
        session_dir = self._make_session(
            plan_fm="id: p1\nroadmap_feature: F-01",
            task_fm="id: t1\nroadmap_feature: F-01\nlinks:\n  plan: p1",
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("spec" in f["scope"] for f in findings))

    def test_inspect_artifacts_no_report(self):
        """Missing report artifact reports warning."""
        session_dir = self._make_session(
            plan_fm="id: p1\nroadmap_feature: F-01",
            task_fm="id: t1\nroadmap_feature: F-01\nlinks:\n  plan: p1",
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("report" in f["scope"] for f in findings))

    def test_inspect_artifacts_planning_intent_no_plan(self):
        """Planning intent without plan reports error."""
        session_dir = self._make_session()
        with mock.patch.object(self.review, "infer_session_intent", return_value="planning"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": [], "stale_artifacts": []}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("plan" in f["scope"] and f["severity"] == "error" for f in findings))

    def test_inspect_artifacts_with_warnings(self):
        """Catchup warnings propagate to findings."""
        session_dir = self._make_session(
            plan_fm="id: p1\nroadmap_feature: F-01",
            task_fm="id: t1\nroadmap_feature: F-01\nlinks:\n  plan: p1",
        )
        with mock.patch.object(self.review, "infer_session_intent", return_value="delivery"), \
             mock.patch.object(self.review, "build_session_catchup",
                               return_value={"warnings": ["drift detected"], "stale_artifacts": ["plan"]}):
            findings = self.review.inspect_artifacts(session_dir)
        self.assertTrue(any("drift" in f["message"] for f in findings))


class ReviewScopeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = load_module("agents_review_scope_tests", SCRIPT_PATH)

    def test_cmd_scope_verify_failure(self):
        """Verify failure reports error."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        (session_dir / "260401_task_01.md").write_text("---\nstatus: active\n---\n# Task\n")
        with mock.patch.object(self.review, "inspect_artifacts", return_value=[]), \
             mock.patch.object(self.review, "run_verify_tasks",
                               return_value=(1, "fail output", "")), \
             mock.patch("builtins.print"):
            result = self.review.cmd_scope(session_dir, "all")
        self.assertEqual(result, 1)

    def test_cmd_scope_filtered(self):
        """Scope filter limits findings."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        findings = [
            {"scope": "task", "severity": "warning", "message": "task issue"},
            {"scope": "plan", "severity": "info", "message": "plan note"},
        ]
        with mock.patch.object(self.review, "inspect_artifacts", return_value=findings), \
             mock.patch.object(self.review, "run_verify_tasks",
                               return_value=(0, "ok", "")), \
             mock.patch("builtins.print"):
            result = self.review.cmd_scope(session_dir, "task")
        self.assertEqual(result, 0)

    def test_cmd_scope_all_success(self):
        """All scope with no errors returns 0."""
        td = tempfile.mkdtemp()
        session_dir = Path(td) / "session"
        session_dir.mkdir()
        with mock.patch.object(self.review, "inspect_artifacts", return_value=[]), \
             mock.patch.object(self.review, "run_verify_tasks",
                               return_value=(0, "ok", "")), \
             mock.patch("builtins.print"):
            result = self.review.cmd_scope(session_dir, "all")
        self.assertEqual(result, 0)

    def test_run_verify_tasks_uses_strict_flag(self):
        """run_verify_tasks always calls verify-tasks with --strict."""
        session_dir = Path("/tmp/session")
        completed = mock.Mock(returncode=0, stdout="ok", stderr="")
        with mock.patch.object(self.review.subprocess, "run", return_value=completed) as run_mock:
            code, out, err = self.review.run_verify_tasks(session_dir)
        cmd = run_mock.call_args.args[0]
        self.assertIn("--strict", cmd)
        self.assertEqual(code, 0)
        self.assertEqual(out, "ok")
        self.assertEqual(err, "")


class ReviewMainTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = load_module("agents_review_main_tests", SCRIPT_PATH)

    def test_main_exception_returns_1(self):
        """main() catches exception and returns 1."""
        with mock.patch.object(self.review, "build_parser") as mock_parser:
            mock_parser.return_value.parse_args.return_value = argparse.Namespace(
                session=None, scope="all"
            )
            with mock.patch.object(self.review, "find_session", side_effect=Exception("boom")), \
                 mock.patch("builtins.print"):
                result = self.review.main()
        self.assertEqual(result, 1)

    def test_main_happy_path(self):
        """main() success returns 0."""
        with mock.patch.object(self.review, "build_parser") as mock_parser:
            mock_parser.return_value.parse_args.return_value = argparse.Namespace(
                session=None, scope="all"
            )
            with mock.patch.object(self.review, "find_session", return_value=Path("/tmp/s")), \
                 mock.patch.object(self.review, "cmd_scope", return_value=0):
                result = self.review.main()
        self.assertEqual(result, 0)
