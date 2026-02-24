#!/usr/bin/env python3
"""
Tests for refactored hotspot functions.

Ensures refactored functions maintain correct behavior:
- validate_catalog helpers
- generate_report helpers
- calculate_heat_scores helpers
- check_frontmatter helpers
- validate_frontmatter helpers
"""

import sys
from pathlib import Path

# Add scripts to path
SCRIPTS_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(SCRIPTS_DIR))


def test_validate_catalog_helpers():
    """Test agents-tools.py validation helpers."""
    print("Testing: validate_catalog helpers...")
    
    from agents_tools import _validate_tool_entries, _validate_categories, _validate_execution_modes
    
    errors = []
    
    # Test _validate_tool_entries
    tools = [
        {"id": "test-tool", "name": "Test", "type": "validation", "tool": "test", 
         "wrapper_command": "test", "make_command": "test", "execution_mode": "on-demand",
         "updated_at": "2026-01-01", "description": "Test tool"}
    ]
    ids = []
    type_set = set()
    _validate_tool_entries(tools, ids, type_set, errors)
    
    if len(ids) != 1:
        print(f"  FAIL: Expected 1 id, got {len(ids)}")
        return False
    
    if len(errors) != 0:
        print(f"  FAIL: Unexpected errors: {errors}")
        return False
    
    print("  PASS: validate_catalog helpers work correctly")
    return True


def test_generate_report_helpers():
    """Test agents-telemetry.py report helpers."""
    print("Testing: generate_report helpers...")
    
    from agents_telemetry import _calculate_date_range, _count_outcomes
    
    # Test _calculate_date_range
    since = _calculate_date_range("weekly")
    if since is None:
        print("  FAIL: _calculate_date_range returned None")
        return False
    
    if "Z" not in since:
        print(f"  FAIL: Invalid timestamp format: {since}")
        return False
    
    # Test _count_outcomes
    events = [
        {"metadata": {"outcome": "success"}},
        {"metadata": {"outcome": "success"}},
        {"metadata": {"outcome": "failure"}},
    ]
    outcomes = _count_outcomes(events)
    
    if outcomes.get("success") != 2:
        print(f"  FAIL: Expected 2 success, got {outcomes.get('success')}")
        return False
    
    print("  PASS: generate_report helpers work correctly")
    return True


def test_heat_score_helpers():
    """Test agents-telemetry.py heat score helpers."""
    print("Testing: calculate_heat_scores helpers...")
    
    from agents_telemetry import _get_period_delta, _calculate_element_heat_score
    
    # Test _get_period_delta
    from datetime import timedelta
    delta = _get_period_delta("weekly")
    
    if not isinstance(delta, timedelta):
        print("  FAIL: _get_period_delta did not return timedelta")
        return False
    
    if delta.days != 7:
        print(f"  FAIL: Expected 7 days, got {delta.days}")
        return False
    
    # Test _calculate_element_heat_score
    stats = {
        "element_id": "test-tool",
        "element_type": "tool",
        "access_count": 10,
        "last_access_days_ago": 0,
        "success_count": 10,
        "fail_count": 0,
    }
    score = _calculate_element_heat_score(stats, max_access=10)
    
    if score["heat_level"] != "hot":
        print(f"  FAIL: Expected hot, got {score['heat_level']}")
        return False
    
    if score["heat_score"] < 70:
        print(f"  FAIL: Expected score >= 70, got {score['heat_score']}")
        return False
    
    print("  PASS: calculate_heat_scores helpers work correctly")
    return True


def test_frontmatter_helpers():
    """Test agents-lint-docs.py frontmatter helpers."""
    print("Testing: check_frontmatter helpers...")
    
    # Import the class
    import importlib.util
    spec = importlib.util.spec_from_file_location("agents_lint_docs", SCRIPTS_DIR / "agents-lint-docs.py")
    lint_docs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lint_docs)
    
    # Create linter instance
    linter = lint_docs.DocLinter()
    
    # Test _validate_frontmatter_yaml with valid YAML
    from pathlib import Path
    import tempfile
    
    valid_frontmatter = """---
doc_type: test
status: active
created_at: '2026-02-24T10:00:00-03:00'
---
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
        f.write(valid_frontmatter)
        f.write("# Test\n\nContent\n")
        temp_path = Path(f.name)
    
    try:
        linter.check_frontmatter(temp_path, valid_frontmatter + "# Test\n\nContent\n")
        
        # Should have no errors for valid frontmatter
        if linter.issues:
            print(f"  FAIL: Unexpected issues: {linter.issues}")
            return False
        
        print("  PASS: check_frontmatter helpers work correctly")
        return True
    finally:
        temp_path.unlink()


def test_doctor_frontmatter_helpers():
    """Test agents-doctor.py frontmatter helpers."""
    print("Testing: validate_frontmatter helpers...")
    
    # Import the class
    import importlib.util
    spec = importlib.util.spec_from_file_location("agents_doctor", SCRIPTS_DIR / "agents-doctor.py")
    doctor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(doctor)
    
    # Create doctor instance
    doc = doctor.AgentsDoctor()
    
    # Test with valid frontmatter
    import tempfile
    from pathlib import Path
    
    valid_frontmatter = """---
doc_type: test
id: test_01
created_at: '2026-02-24T10:00:00-03:00'
---
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
        f.write(valid_frontmatter)
        f.write("# Test\n\nContent\n")
        temp_path = Path(f.name)
    
    try:
        doc.validate_frontmatter(temp_path)
        
        # Should have no issues for valid frontmatter
        if doc.issues:
            print(f"  FAIL: Unexpected issues: {doc.issues}")
            return False
        
        print("  PASS: validate_frontmatter helpers work correctly")
        return True
    finally:
        temp_path.unlink()


def main():
    """Run all refactored function tests."""
    print("=" * 60)
    print("TESTS - Refactored Hotspot Functions")
    print("=" * 60)
    print()
    
    tests = [
        test_validate_catalog_helpers,
        test_generate_report_helpers,
        test_heat_score_helpers,
        test_frontmatter_helpers,
        test_doctor_frontmatter_helpers,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            result = test()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
        print()
    
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
