#!/usr/bin/env python3
"""Integration tests for critical .agents workflows."""

import subprocess
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
