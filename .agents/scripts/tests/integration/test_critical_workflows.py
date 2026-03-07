#!/usr/bin/env python3
"""Integration tests for critical .agents workflows."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).parent.parent.parent.parent.parent
AGENTS_WRAPPER = ROOT_DIR / ".agents" / "agents"
ACTIVE_SESSION_FILE = ROOT_DIR / ".agents" / "wb" / ".active_session"
pytestmark = pytest.mark.integration


def run_command(cmd, cwd=None):
    """Run command and return completed process."""
    return subprocess.run(
        cmd,
        cwd=cwd or ROOT_DIR,
        capture_output=True,
        text=True,
        shell=isinstance(cmd, str),
    )


def require_active_session() -> str:
    """Return active session or skip the test."""
    if not ACTIVE_SESSION_FILE.exists():
        pytest.skip("No active session for workflow integration test")
    active_session = ACTIVE_SESSION_FILE.read_text().strip()
    if not active_session:
        pytest.skip("Active session pointer is empty")
    if not (ROOT_DIR / ".agents" / "wb" / active_session).exists():
        pytest.skip("Active session folder not found")
    return active_session


def test_new_quick_workflow():
    """`.agents/agents new <theme> --quick` should append a task to the active session."""
    require_active_session()

    result = run_command([str(AGENTS_WRAPPER), "new", "integration-test-task", "--quick"])

    assert result.returncode == 0, result.stderr
    assert "✓ Added task:" in result.stdout


def test_wb_update_task_workflow():
    """`.agents/agents wb-update touch` should succeed for an active session."""
    active_session = require_active_session()

    result = run_command([str(AGENTS_WRAPPER), "wb-update", "touch", "--session", active_session])

    assert result.returncode == 0, result.stderr
    assert "updated_at touched" in result.stdout


def test_doctor_workflow():
    """`.agents/agents doctor` should pass in the scaffold repo."""
    result = run_command([str(AGENTS_WRAPPER), "doctor"])

    assert result.returncode == 0, result.stderr
    assert "VALIDATION REPORT" in result.stdout


def test_lint_workflow():
    """`.agents/agents lint-docs` should pass for `.agents`."""
    result = run_command([str(AGENTS_WRAPPER), "lint-docs", ".agents"])

    assert result.returncode == 0, result.stderr
    assert "Issues found: 0" in result.stdout


def test_tools_workflow():
    """`.agents/agents tools list/validate` should both succeed."""
    list_result = run_command([str(AGENTS_WRAPPER), "tools", "list"])
    assert list_result.returncode == 0, list_result.stderr
    assert "Total:" in list_result.stdout

    validate_result = run_command([str(AGENTS_WRAPPER), "tools", "validate"])
    assert validate_result.returncode == 0, validate_result.stderr
    assert "✅ Catalog is valid" in validate_result.stdout


def test_session_catchup_temp_repo_scenarios():
    """`agents-session.py catchup` should behave coherently across isolated repo scenarios."""
    with tempfile.TemporaryDirectory(dir=ROOT_DIR) as td:
        temp_root = Path(td) / "repo"
        temp_root.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "init"], cwd=temp_root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "codex@example.com"], cwd=temp_root, check=True)
        subprocess.run(["git", "config", "user.name", "Codex"], cwd=temp_root, check=True)

        for rel in [
            ".agents/scripts/agents-session.py",
            ".agents/scripts/lib/agents_config.py",
            ".agents/scripts/lib/execution_commands.py",
            ".agents/scripts/lib/__init__.py",
        ]:
            dst = temp_root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT_DIR / rel, dst)

        (temp_root / ".agents/wb").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/a-docs/standards").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/a-docs/knowledge").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/arc/SPECS").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/arc/DECISIONS").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/agents.config").write_text(
            "version: 1\n"
            "paths:\n"
            "  agents_dir: .agents\n"
            "  wb_dir: .agents/wb\n"
            "  active_session_file: .agents/wb/.active_session\n"
            "  templates_dir: .agents/a-docs/templates\n"
            "  arc_dir: .agents/arc\n"
            "  roadmap_file: .agents/arc/GENERAL-ROADMAP.md\n"
            "  specs_dir: .agents/arc/SPECS\n"
            "  decisions_dir: .agents/arc/DECISIONS\n"
            "time:\n"
            "  default_offset: \"+00:00\"\n"
            "  wb_offset: \"-03:00\"\n"
            "workflow:\n"
            "  feature_id_pattern: \"^F-[0-9]{2,3}$\"\n",
            encoding="utf-8",
        )
        (temp_root / ".agents/a-docs/standards/workflow.md").write_text("# workflow\n", encoding="utf-8")
        (temp_root / ".agents/a-docs/knowledge/INDEX.md").write_text("# knowledge\n", encoding="utf-8")
        (temp_root / ".agents/arc/PROJECT-BRIEF.md").write_text("# brief\n", encoding="utf-8")
        (temp_root / ".agents/arc/ENGINEERING-GUIDELINES.md").write_text("# guidelines\n", encoding="utf-8")
        (temp_root / ".agents/arc/TECH-STACK.md").write_text("# stack\n", encoding="utf-8")
        (temp_root / ".agents/arc/GENERAL-ROADMAP.md").write_text("# roadmap\n", encoding="utf-8")

        def write_session(name: str, *, with_plan=True, with_research=True, with_log=True, with_report=True, research_link=False):
            session = temp_root / ".agents/wb" / name
            session.mkdir(parents=True, exist_ok=True)
            if with_plan:
                links = "links:\n  research: test-research\n" if research_link else ""
                (session / f"{name}_plan_01.md").write_text(
                    "---\n"
                    "doc_type: plan\n"
                    "id: test-plan\n"
                    "status: active\n"
                    "roadmap_feature: F-09\n"
                    f"{links}"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Plan\n",
                    encoding="utf-8",
                )
            (session / f"{name}_task_01.md").write_text(
                "---\n"
                "doc_type: task\n"
                "id: test-task\n"
                "roadmap_feature: F-09\n"
                "updated_at: '2026-03-07T18:00:00-03:00'\n"
                "---\n\n# Tasks\n\n## State Board\n\n"
                "| Task | State | Owner | Notes |\n"
                "|------|-------|-------|-------|\n"
                "| T-01 | pending | worker | first |\n",
                encoding="utf-8",
            )
            if with_research:
                (session / f"{name}_research_01.md").write_text(
                    "---\n"
                    "doc_type: research\n"
                    "id: test-research\n"
                    "status: active\n"
                    "roadmap_feature: F-09\n"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Research\n",
                    encoding="utf-8",
                )
            if with_log:
                (session / f"{name}_log_01.md").write_text(
                    "---\n"
                    "doc_type: log\n"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Log\n\n## Timeline\n",
                    encoding="utf-8",
                )
            if with_report:
                (session / f"{name}_report_01.md").write_text(
                    "---\n"
                    "doc_type: report\n"
                    "status: active\n"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Report\n",
                    encoding="utf-8",
                )
            return session

        clean = write_session("260307_2300_clean")
        missing = write_session("260307_2301_missing-context", with_plan=False, with_log=False, with_report=False, with_research=False)
        missing_research = write_session("260307_2302_missing-research", with_research=False, research_link=True)

        subprocess.run(["git", "add", "."], cwd=temp_root, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", "baseline"], cwd=temp_root, check=True, capture_output=True)
        script = temp_root / ".agents/scripts/agents-session.py"
        env = os.environ.copy()
        env["PYTHONPATH"] = str(temp_root / ".agents/scripts")
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        def run_catchup(session: Path):
            proc = subprocess.run(
                [str(ROOT_DIR / ".agents/scripts/.venv/bin/python"), str(script), "catchup", "--session", str(session), "--json"],
                cwd=temp_root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            assert proc.returncode == 0, proc.stderr
            return json.loads(proc.stdout)

        clean_payload = run_catchup(clean)
        assert clean_payload["catchup_required"] is False
        assert clean_payload["warnings"] == []

        missing_payload = run_catchup(missing)
        assert missing_payload["catchup_required"] is True
        assert set(missing_payload["missing_context"]) >= {"plan", "report", "log"}

        missing_research_payload = run_catchup(missing_research)
        assert missing_research_payload["catchup_required"] is True
        assert any("research artifact" in warning.lower() for warning in missing_research_payload["warnings"])

        (temp_root / "outside-change.txt").write_text("drift\n", encoding="utf-8")
        drift_payload = run_catchup(clean)
        assert drift_payload["catchup_required"] is True
        assert drift_payload["git"]["repo_changed"] >= 1
        assert any("repo has changes outside the session" in warning.lower() for warning in drift_payload["warnings"])
