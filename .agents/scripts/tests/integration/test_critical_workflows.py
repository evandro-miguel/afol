#!/usr/bin/env python3
"""
Integration tests for critical .agents workflows.

Tests real command execution end-to-end:
- new --quick workflow
- wb-update task workflow
- doctor workflow
- lint workflow
- tools workflow
"""

import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).parent.parent.parent.parent.parent
AGENTS_WRAPPER = ROOT_DIR / ".agents" / "agents"
ACTIVE_SESSION_FILE = ROOT_DIR / ".agents" / "wb" / ".active_session"


def run_command(cmd, cwd=None):
    """Run command and return (returncode, stdout, stderr)."""
    result = subprocess.run(
        cmd,
        cwd=cwd or ROOT_DIR,
        capture_output=True,
        text=True,
        shell=isinstance(cmd, str)
    )
    return result.returncode, result.stdout, result.stderr


def test_new_quick_workflow():
    """Test .agents/agents new <theme> --quick workflow."""
    print("Testing: new --quick workflow...")
    
    # Check active session exists
    if not ACTIVE_SESSION_FILE.exists():
        print("  SKIP: No active session for quick mode")
        return True
    
    active_session = ACTIVE_SESSION_FILE.read_text().strip()
    session_path = ROOT_DIR / ".agents" / "wb" / active_session
    
    if not session_path.exists():
        print("  SKIP: Active session folder not found")
        return True
    
    # Run quick task
    cmd = [str(AGENTS_WRAPPER), "new", "integration-test-task", "--quick"]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    # Verify task was added
    if "✓ Added task:" not in stdout:
        print(f"  FAIL: Task not added. Output: {stdout}")
        return False
    
    print("  PASS: Quick task added successfully")
    return True


def test_wb_update_task_workflow():
    """Test .agents/agents wb-update task workflow."""
    print("Testing: wb-update task workflow...")

    if not ACTIVE_SESSION_FILE.exists():
        print("  SKIP: No active session for wb-update")
        return True

    active_session = ACTIVE_SESSION_FILE.read_text().strip()
    if not active_session:
        print("  SKIP: Active session pointer is empty")
        return True

    cmd = [str(AGENTS_WRAPPER), "wb-update", "touch", "--session", active_session]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    if "updated_at touched" not in stdout:
        print(f"  FAIL: Touch did not work. Output: {stdout}")
        return False
    
    print("  PASS: wb-update touch successful")
    return True


def test_doctor_workflow():
    """Test .agents/agents doctor workflow."""
    print("Testing: doctor workflow...")

    cmd = [str(AGENTS_WRAPPER), "doctor"]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    if "✅ No issues found!" not in stdout:
        print(f"  FAIL: Doctor found issues. Output: {stdout}")
        return False
    
    print("  PASS: Doctor validation passed")
    return True


def test_lint_workflow():
    """Test .agents/agents lint-docs workflow."""
    print("Testing: lint-docs workflow...")

    cmd = [str(AGENTS_WRAPPER), "lint-docs", ".agents"]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    if "Issues found: 0" not in stdout:
        print(f"  FAIL: Lint found issues. Output: {stdout}")
        return False
    
    print("  PASS: Lint validation passed")
    return True


def test_tools_workflow():
    """Test .agents/agents tools workflow."""
    print("Testing: tools workflow...")

    # Test tools list
    cmd = [str(AGENTS_WRAPPER), "tools", "list"]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    if "Total:" not in stdout:
        print(f"  FAIL: Tools list invalid. Output: {stdout}")
        return False
    
    # Test tools validate
    cmd = [str(AGENTS_WRAPPER), "tools", "validate"]
    returncode, stdout, stderr = run_command(cmd)
    
    if returncode != 0:
        print(f"  FAIL: {stderr}")
        return False
    
    if "✅ Catalog is valid" not in stdout:
        print(f"  FAIL: Tools validate failed. Output: {stdout}")
        return False
    
    print("  PASS: Tools workflow passed")
    return True


def main():
    """Run all integration tests."""
    print("=" * 60)
    print("INTEGRATION TESTS - Critical Workflows")
    print("=" * 60)
    print()
    
    tests = [
        test_new_quick_workflow,
        test_wb_update_task_workflow,
        test_doctor_workflow,
        test_lint_workflow,
        test_tools_workflow,
    ]
    
    passed = 0
    failed = 0
    skipped = 0
    
    for test in tests:
        try:
            result = test()
            if result is True:
                passed += 1
            elif result == "SKIP":
                skipped += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1
        print()
    
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {skipped} skipped")
    print("=" * 60)
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
