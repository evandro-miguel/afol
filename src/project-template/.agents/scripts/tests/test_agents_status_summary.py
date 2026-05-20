import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


def load_module(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_doc(session_dir: Path, doc_type: str, status: str) -> None:
    bodies = {
        "brainstorm": (
            "# Brainstorm\n\n"
            "## Problem Statement\n"
            "- Need to reduce useless artifact creation.\n\n"
            "## Options\n"
            "1. Keep current package flow.\n"
            "2. Create only artifacts required by intent.\n\n"
            "## Preferred Direction\n"
            "- Selected: create only what the work needs.\n"
        ),
        "research": (
            "# Research\n\n"
            "## Findings\n"
            "- Current flow overcreates workbench artifacts.\n\n"
            "## Sources\n"
            "- .agents/scripts/agents-new.py | credibility: high | notes: creation logic\n"
        ),
        "explorer-check": (
            "# Explorer Check\n\n"
            "## Scope Reviewed\n"
            "- Paths inspected:\n"
            "  - .agents/scripts/agents-new.py\n\n"
            "## Findings\n"
            "- Artifact creation is package-oriented.\n\n"
            "## Impact on the Plan\n"
            "- Plan must move to intent-based creation.\n"
        ),
        "plan": (
            "# Plan\n\n"
            "## Progress\n"
            "- [x] 2026-04-04 09:00Z - Mapped current creation logic.\n\n"
            "## Concrete Steps\n"
            "1. Add intent-based policy.\n\n"
            "## Validation and Acceptance\n"
            "- Unit: pytest targeted suite.\n"
        ),
        "task": (
            "# Tasks\n\n"
            "## State Board\n\n"
            "| Task | State | Owner | Notes |\n"
            "|------|-------|-------|-------|\n"
            "| T-01 | pending | worker | Implement intent-based artifact selection |\n"
        ),
        "log": (
            "# Log\n\n## Timeline\n- 2026-04-04 09:01 - Started implementing artifact policy - ok\n"
        ),
        "report": (
            "# Report\n\n"
            "## Summary\n"
            "- Reduced automatic artifact creation.\n\n"
            "## Delivered Changes\n"
            "- Added intent-based workflow policy.\n\n"
            "## Verification\n"
            "- Unit tests: `pytest` -> pass -> Evidence: targeted suite green\n"
        ),
    }
    (session_dir / f"{session_dir.name}_{doc_type}_01.md").write_text(
        "---\n"
        f"doc_type: {doc_type}\n"
        f"id: {session_dir.name}_{doc_type}_01\n"
        f"status: {status}\n"
        "roadmap_feature: F-08\n"
        "updated_at: '2026-04-04T08:54:11-03:00'\n"
        "---\n\n"
        f"{bodies[doc_type]}\n",
        encoding="utf-8",
    )


class AgentsStatusSummaryTests(unittest.TestCase):
    def test_summarize_session_includes_workflow_artifact_readiness(self):
        script_path = Path(".agents/scripts/agents-status.py").resolve()
        sys.path.insert(0, str(script_path.parent))
        agents_status = load_module("agents_status_summary_test", script_path)

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as td:
            root = Path(td)
            session_dir = root / "260404_0900_status-summary"
            session_dir.mkdir(parents=True, exist_ok=True)

            write_doc(session_dir, "brainstorm", "active")
            write_doc(session_dir, "research", "active")
            write_doc(session_dir, "explorer-check", "active")
            write_doc(session_dir, "plan", "active")
            write_doc(session_dir, "task", "active")
            write_doc(session_dir, "log", "active")
            write_doc(session_dir, "report", "final")

            payload = agents_status.summarize_session(session_dir)
            by_doc_type = {item["doc_type"]: item for item in payload["workflow_artifacts"]}

            self.assertEqual(by_doc_type["brainstorm"]["state"], "blocked")
            self.assertEqual(by_doc_type["plan"]["state"], "ready")
            self.assertEqual(by_doc_type["task"]["state"], "ready")
            self.assertEqual(by_doc_type["report"]["state"], "done")
            self.assertEqual(payload["ready_state"], "blocked")
            self.assertIn("brainstorm blocked", payload["workflow_next"])


if __name__ == "__main__":
    unittest.main()
