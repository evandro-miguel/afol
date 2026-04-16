#!/usr/bin/env python3
"""Unit tests for refactored hotspot helper functions."""

import importlib.util
import sys
import tempfile
from datetime import timedelta
from pathlib import Path


SCRIPTS_DIR = Path(__file__).parent.parent.parent


def load_module_from_path(name: str, path: Path):
    """Load a Python module from a file path."""
    lib_dir = path.parent / "lib"
    if lib_dir.exists() and str(lib_dir) not in sys.path:
        sys.path.insert(0, str(lib_dir))
    if str(path.parent) not in sys.path:
        sys.path.insert(0, str(path.parent))

    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_validate_catalog_helpers():
    """agents-tools.py validation helpers should accept a valid tool entry."""
    tools = load_module_from_path("agents_tools", SCRIPTS_DIR / "agents-tools.py")

    tools_data = [
        {
            "id": "test-tool",
            "name": "Test",
            "type": "validation",
            "tool": "test",
            "wrapper_command": "test",
            "just_command": "test",
            "execution_mode": "on-demand",
            "updated_at": "2026-01-01",
            "description": "Test tool",
        }
    ]
    ids = []
    type_set = set()
    errors = []

    tools._validate_tool_entries(tools_data, ids, type_set, errors)

    assert len(ids) == 1
    assert errors == []


def test_generate_report_helpers():
    """agents-telemetry.py report helpers should return sensible aggregates."""
    telemetry = load_module_from_path("agents_telemetry", SCRIPTS_DIR / "agents-telemetry.py")

    since = telemetry._calculate_date_range("weekly")
    assert since is not None
    assert "Z" in since

    events = [
        {"metadata": {"outcome": "success"}},
        {"metadata": {"outcome": "success"}},
        {"metadata": {"outcome": "failure"}},
    ]
    outcomes = telemetry._count_outcomes(events)

    assert outcomes.get("success") == 2
    assert outcomes.get("failure") == 1


def test_heat_score_helpers():
    """agents-telemetry.py heat helpers should classify hot/high-use elements."""
    telemetry = load_module_from_path("agents_telemetry_heat", SCRIPTS_DIR / "agents-telemetry.py")

    delta = telemetry._get_period_delta("weekly")
    assert isinstance(delta, timedelta)
    assert delta.days == 7

    stats = {
        "element_id": "test-tool",
        "element_type": "tool",
        "access_count": 10,
        "last_access_days_ago": 0,
        "success_count": 10,
        "fail_count": 0,
    }
    score = telemetry._calculate_element_heat_score(stats, max_access=10)

    assert score["heat_level"] == "hot"
    assert score["heat_score"] >= 70


def test_frontmatter_helpers():
    """agents-lint-docs.py should accept valid frontmatter without issues."""
    lint_docs = load_module_from_path("agents_lint_docs", SCRIPTS_DIR / "agents-lint-docs.py")
    linter = lint_docs.DocLinter()

    valid_frontmatter = """---
doc_type: standard
id: 260306_2200_frontmatter-standard_01
status: active
created_at: '2026-02-24T10:00:00-03:00'
updated_at: '2026-02-24T10:05:00-03:00'
---
# Test

Content
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as handle:
        handle.write(valid_frontmatter)
        temp_path = Path(handle.name)

    try:
        linter.check_frontmatter(temp_path, valid_frontmatter)
        assert linter.issues == []
    finally:
        temp_path.unlink()


def test_doctor_frontmatter_helpers():
    """agents-doctor.py should accept valid frontmatter without issues."""
    doctor = load_module_from_path("agents_doctor", SCRIPTS_DIR / "agents-doctor.py")
    doc = doctor.AgentsDoctor()

    valid_frontmatter = """---
doc_type: standard
id: 260306_2200_frontmatter-standard_01
created_at: '2026-02-24T10:00:00-03:00'
updated_at: '2026-02-24T10:05:00-03:00'
---
# Test

Content
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as handle:
        handle.write(valid_frontmatter)
        temp_path = Path(handle.name)

    try:
        doc.validate_frontmatter(temp_path)
        assert all(issue.severity != "error" for issue in doc.issues)
    finally:
        temp_path.unlink()
