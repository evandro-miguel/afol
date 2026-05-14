from __future__ import annotations

import inspect
import socket
from pathlib import Path

import pytest


def _socketpair_available() -> bool:
    try:
        left, right = socket.socketpair()
    except (NotImplementedError, OSError, PermissionError):
        return False

    left.close()
    right.close()
    return True


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    if _socketpair_available():
        return

    skip_asyncio = pytest.mark.skip(
        reason="sandbox blocks socket.socketpair required by pytest-asyncio event loops"
    )
    for item in items:
        test_obj = getattr(item, "obj", None)
        if inspect.iscoroutinefunction(test_obj):
            item.add_marker(skip_asyncio)


@pytest.fixture()
def scaffold_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()

    (repo / "AGENTS.md").write_text("# AGENTS\n", encoding="utf-8")
    for runtime_doc in ["CLAUDE.md"]:
        (repo / runtime_doc).write_text(f"# {runtime_doc}\n", encoding="utf-8")

    for rel in [
        "docs/templates",
        "docs/standards",
        "docs/knowledge",
        "docs/lessons",
        "docs/patterns",
        "docs/agentic",
        "docs/telemetry",
        "docs/arc/SPECS",
        "docs/arc/DECISIONS",
        "docs/map/structure",
        "docs/map",
        ".agents/tmp",
        ".agents/wb",
        ".agents/rules",
        ".agents/scripts/tests",
        ".agents/skills/demo-skill",
        ".agents/z-arq",
    ]:
        (repo / rel).mkdir(parents=True, exist_ok=True)

    for template in [
        "plan.md",
        "task.md",
        "report.md",
        "log.md",
        "research.md",
        "brainstorm.md",
        "explorer-check.md",
        "postmortem.md",
        "blocks.md",
        "spec.md",
        "spec-child.md",
        "spec-test.md",
        "spec-lite.md",
        "adr.md",
        "architecture.md",
        "roadmap.md",
    ]:
        (repo / "docs" / "templates" / template).write_text("---\ndoc_type: template\n---\n", encoding="utf-8")

    (repo / "docs" / "arc" / "GENERAL-ROADMAP.md").write_text("# Roadmap\n", encoding="utf-8")
    (repo / "docs" / "arc" / "ARCHITECTURE.md").write_text("# Architecture\n", encoding="utf-8")
    (repo / "docs" / "arc" / "README.md").write_text("# Arc\n", encoding="utf-8")
    (repo / "docs" / "arc" / "SPECS" / "INDEX.md").write_text("# Specs\n", encoding="utf-8")
    (repo / "docs" / "arc" / "DECISIONS" / "INDEX.md").write_text("# Decisions\n", encoding="utf-8")
    (repo / "docs" / "agentic" / "agents-mcp.md").write_text(
        "---\ndoc_type: standard\nupdated_at: \"2026-04-11T00:00:00+00:00\"\n---\n# MCP\nUseful guide\n",
        encoding="utf-8",
    )
    (repo / "docs" / "knowledge" / "INDEX.md").write_text(
        "---\ndoc_type: index\nupdated_at: \"2026-04-11T00:00:00+00:00\"\n---\n# Knowledge\nroadmap overview\n",
        encoding="utf-8",
    )
    (repo / ".agents" / "skills" / "demo-skill" / "SKILL.md").write_text(
        "---\ndescription: demo skill\n---\n\n# Demo Skill\n",
        encoding="utf-8",
    )
    (repo / ".agents" / "scripts" / "agents-tools.py").write_text("print('ok')\n", encoding="utf-8")
    (repo / ".agents" / "scripts" / "tests" / "test_dummy.py").write_text("def test_dummy():\n    assert True\n", encoding="utf-8")
    (repo / ".agents" / "tools.json").write_text(
        '{"tools": [{"id": "doctor", "type": "validation", "wrapper_command": ".agents/agents doctor"}]}',
        encoding="utf-8",
    )
    (repo / ".agents" / "agents.config").write_text(
        """
version: 1
paths:
  docs_dir: docs
  wb_dir: .agents/wb
  knowledge_dir: docs/knowledge
  map_dir: docs/map
  arc_dir: docs/arc
  agentic_docs_dir: docs/agentic
doctor:
  required_folders:
    - docs/templates
    - docs/standards
    - docs/knowledge
    - docs/lessons
    - docs/patterns
    - docs/agentic
    - docs/telemetry
    - docs/arc
    - docs/arc/SPECS
    - docs/arc/DECISIONS
    - docs/map/structure
    - docs/map
    - .agents/tmp
    - .agents/wb
    - .agents/rules
    - .agents/scripts
    - .agents/skills
    - .agents/z-arq
  required_templates:
    - plan.md
    - task.md
    - report.md
    - log.md
    - research.md
    - brainstorm.md
    - explorer-check.md
    - postmortem.md
    - blocks.md
    - spec.md
    - spec-child.md
    - spec-test.md
    - spec-lite.md
    - adr.md
    - architecture.md
    - roadmap.md
""".strip()
        + "\n",
        encoding="utf-8",
    )
    return repo
