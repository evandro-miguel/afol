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
SESSION_ID = "260402_0000_integration"
pytestmark = pytest.mark.integration


def _copytree_ignore_runtime_state(src: str, names: list[str]) -> set[str]:
    """Exclude generated runtime/state folders from isolated repo copies."""
    rel_src = Path(src).resolve().relative_to(ROOT_DIR)
    ignored = {
        name
        for name in names
        if name
        in {
            ".git",
            ".coverage",
            ".pytest_cache",
            "__pycache__",
            ".mypy_cache",
            ".ruff_cache",
            ".venv",
        }
    }

    if rel_src == Path(".agents"):
        ignored.update({"cache", "wb", "z-arq", "tmp"})
    elif rel_src == Path("docs"):
        ignored.add("map")

    return ignored


def isolated_env(repo_root: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["AGENTS_ACTIVE_SESSION_FILE"] = str(repo_root / ".agents" / "wb" / ".active_session")
    env["AGENTS_SCRIPT_PYTHON"] = str(ROOT_DIR / ".agents" / "scripts" / ".venv" / "bin" / "python3")
    env["AGENTS_UV_CACHE_DIR"] = str(repo_root / ".agents" / "cache" / "uv")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PATH"] = f"{ROOT_DIR / '.agents' / 'scripts' / '.venv' / 'bin'}:{env.get('PATH', '')}"
    return env


def run_command(repo_root: Path, cmd):
    """Run command and return completed process."""
    return subprocess.run(
        [str(repo_root / ".agents" / "agents"), *cmd],
        cwd=repo_root,
        env=isolated_env(repo_root),
        capture_output=True,
        text=True,
    )


def build_isolated_repo(tmp_root: Path) -> Path:
    repo_root = tmp_root / ROOT_DIR.name
    shutil.copytree(
        ROOT_DIR,
        repo_root,
        ignore=_copytree_ignore_runtime_state,
    )

    (repo_root / "docs" / "map" / "structure").mkdir(parents=True, exist_ok=True)
    (repo_root / ".agents" / "z-arq").mkdir(parents=True, exist_ok=True)
    (repo_root / ".agents" / "tmp").mkdir(parents=True, exist_ok=True)

    session_dir = repo_root / ".agents" / "wb" / SESSION_ID
    session_dir.mkdir(parents=True, exist_ok=True)
    (repo_root / ".agents" / "wb" / ".active_session").write_text(f"{SESSION_ID}\n", encoding="utf-8")
    (session_dir / f"{SESSION_ID}_plan_01.md").write_text(
        "---\n"
        "doc_type: plan\n"
        "id: integration-plan\n"
        "status: active\n"
        "theme: integration-workflow\n"
        "roadmap_feature: F-10\n"
        "parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01\n"
        "updated_at: '2026-04-02T00:00:00-03:00'\n"
        "---\n\n"
        "# Plan\n\n"
        "## Progress\n"
        "- [x] 2026-04-02 00:00Z - Seeded integration fixture.\n\n"
        "## Concrete Steps\n"
        "1. Exercise the wrapper commands.\n\n"
        "## Validation and Acceptance\n"
        "- Integration tests should run cleanly.\n",
        encoding="utf-8",
    )
    (session_dir / f"{SESSION_ID}_task_01.md").write_text(
        "---\n"
        "doc_type: task\n"
        "id: integration-task\n"
        "status: active\n"
        "theme: integration-workflow\n"
        "roadmap_feature: F-10\n"
        "updated_at: '2026-04-02T00:00:00-03:00'\n"
        "---\n\n"
        "# Tasks\n\n"
        "## Task List\n\n"
        "- [ ] T-01 seed integration session\n",
        encoding="utf-8",
    )
    (session_dir / f"{SESSION_ID}_log_01.md").write_text(
        "---\n"
        "doc_type: log\n"
        "status: active\n"
        "updated_at: '2026-04-02T00:00:00-03:00'\n"
        "---\n\n"
        "# Log\n\n"
        "## Timeline\n\n"
        "- 2026-04-02T00:00:00-03:00 - seeded integration repo\n",
        encoding="utf-8",
    )
    (session_dir / f"{SESSION_ID}_report_01.md").write_text(
        "---\n"
        "doc_type: report\n"
        "status: active\n"
        "theme: integration-workflow\n"
        "updated_at: '2026-04-02T00:00:00-03:00'\n"
        "---\n\n"
        "# Report\n\n"
        "## Summary\n"
        "- Seeded the integration workflow fixture.\n\n"
        "## Delivered Changes\n"
        "- Prepared the isolated repo.\n\n"
        "## Verification\n"
        "- Fixture boot: `pytest` -> pass -> Evidence: repo ready\n",
        encoding="utf-8",
    )
    return repo_root


@pytest.fixture
def isolated_repo() -> Path:
    with tempfile.TemporaryDirectory() as td:
        yield build_isolated_repo(Path(td))


def test_new_quick_workflow(isolated_repo: Path):
    """`.agents/agents new <theme> --quick` should append a task to the active session."""
    result = run_command(isolated_repo, ["new", "integration-test-task", "--quick"])

    assert result.returncode == 0, result.stderr
    assert "✓ Added task:" in result.stdout


def test_new_planning_workflow_creates_brainstorm_and_explorer_check(isolated_repo: Path):
    """`--intent planning` should materialize the governed planning artifact bundle."""
    result = run_command(
        isolated_repo,
        [
            "new",
            "integration-planning-track",
            "--feature-id",
            "F-10",
            "--parent-spec",
            "260323_1704_universal-skills-runtime-integration_spec_01",
            "--intent",
            "planning",
        ],
    )

    assert result.returncode == 0, result.stderr

    session_dirs = sorted((isolated_repo / ".agents" / "wb").glob("*_integration-planning-track"))
    assert session_dirs, "Expected a new planning session directory."
    session_dir = session_dirs[-1]
    session_id = session_dir.name

    assert (session_dir / f"{session_id}_brainstorm_01.md").exists()
    assert (session_dir / f"{session_id}_explorer-check_01.md").exists()
    assert (session_dir / f"{session_id}_plan_01.md").exists()


def test_wb_update_task_workflow(isolated_repo: Path):
    """`.agents/agents wb-update touch` should succeed for an active session."""
    result = run_command(isolated_repo, ["wb-update", "touch", "--session", SESSION_ID])

    assert result.returncode == 0, result.stderr
    assert "updated_at touched" in result.stdout


def test_doctor_workflow(isolated_repo: Path):
    """`.agents/agents doctor` should pass in the scaffold repo."""
    result = run_command(isolated_repo, ["doctor"])

    assert result.returncode == 0, result.stderr
    assert "VALIDATION REPORT" in result.stdout


def test_lint_workflow(isolated_repo: Path):
    """`.agents/agents lint-docs` should pass for `.agents`."""
    result = run_command(isolated_repo, ["lint-docs", ".agents"])

    assert result.returncode == 0, result.stderr
    assert "Issues found: 0" in result.stdout


def test_tools_workflow(isolated_repo: Path):
    """`.agents/agents tools list/validate` should both succeed."""
    list_result = run_command(isolated_repo, ["tools", "list"])
    assert list_result.returncode == 0, list_result.stderr
    assert "Total:" in list_result.stdout

    validate_result = run_command(isolated_repo, ["tools", "validate"])
    assert validate_result.returncode == 0, validate_result.stderr
    assert "✅ Catalog is valid" in validate_result.stdout


def test_repo_map_dry_run_workflow(isolated_repo: Path):
    """`.agents/agents repo-map . --dry-run` should preview without shadow-copying."""
    result = run_command(isolated_repo, ["repo-map", ".", "--dry-run"])

    assert result.returncode == 0, result.stderr
    assert "Analysis shadow repo: <dry-run skipped>" in result.stdout
    assert str(isolated_repo / "docs" / "map") in result.stdout


def test_session_catchup_temp_repo_scenarios():
    """`agents-session.py catchup` should behave coherently across isolated repo scenarios."""
    with tempfile.TemporaryDirectory() as td:
        temp_root = Path(td) / "repo"
        temp_root.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "init"], cwd=temp_root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "codex@example.com"], cwd=temp_root, check=True)
        subprocess.run(["git", "config", "user.name", "Codex"], cwd=temp_root, check=True)

        for rel in [
            ".agents/scripts/agents-session.py",
            ".agents/scripts/lib/agents_config.py",
            ".agents/scripts/lib/artifact_utility.py",
            ".agents/scripts/lib/execution_commands.py",
            ".agents/scripts/lib/markdown_docs.py",
            ".agents/scripts/lib/workflow_manifest.py",
            ".agents/scripts/lib/__init__.py",
        ]:
            dst = temp_root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT_DIR / rel, dst)

        (temp_root / ".agents/wb").mkdir(parents=True, exist_ok=True)
        (temp_root / "docs/standards").mkdir(parents=True, exist_ok=True)
        (temp_root / "docs/knowledge").mkdir(parents=True, exist_ok=True)
        (temp_root / "docs/arc/SPECS").mkdir(parents=True, exist_ok=True)
        (temp_root / "docs/arc/DECISIONS").mkdir(parents=True, exist_ok=True)
        (temp_root / ".agents/agents.config").write_text(
            "version: 1\n"
            "paths:\n"
            "  agents_dir: .agents\n"
            "  docs_dir: docs\n"
            "  wb_dir: .agents/wb\n"
            "  active_session_file: .agents/wb/.active_session\n"
            "  templates_dir: docs/templates\n"
            "  standards_dir: docs/standards\n"
            "  knowledge_dir: docs/knowledge\n"
            "  arc_dir: docs/arc\n"
            "  roadmap_file: docs/arc/GENERAL-ROADMAP.md\n"
            "  specs_dir: docs/arc/SPECS\n"
            "  decisions_dir: docs/arc/DECISIONS\n"
            "time:\n"
            "  default_offset: \"+00:00\"\n"
            "  wb_offset: \"-03:00\"\n"
            "workflow:\n"
            "  feature_id_pattern: \"^F-[0-9]{2,3}$\"\n",
            encoding="utf-8",
        )
        (temp_root / "docs/standards/workflow.md").write_text("# workflow\n", encoding="utf-8")
        (temp_root / "docs/knowledge/INDEX.md").write_text("# knowledge\n", encoding="utf-8")
        (temp_root / "docs/arc/PROJECT-BRIEF.md").write_text("# brief\n", encoding="utf-8")
        (temp_root / "docs/arc/ENGINEERING-GUIDELINES.md").write_text("# guidelines\n", encoding="utf-8")
        (temp_root / "docs/arc/TECH-STACK.md").write_text("# stack\n", encoding="utf-8")
        (temp_root / "docs/arc/GENERAL-ROADMAP.md").write_text("# roadmap\n", encoding="utf-8")

        def write_session(
            name: str,
            *,
            with_plan=True,
            with_task=True,
            with_research=True,
            with_log=True,
            with_report=True,
            research_link=False,
        ):
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
                    "---\n\n# Plan\n\n## Progress\n- [x] 2026-03-07 18:00Z - Session scaffolded.\n\n## Concrete Steps\n1. Continue the governed workflow.\n\n## Validation and Acceptance\n- Catchup should reflect current state.\n",
                    encoding="utf-8",
                )
            if with_task:
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
                    "---\n\n# Research\n\n## Findings\n- The session has repo context to reuse.\n\n## Sources\n- local repo | credibility: high | notes: fixture setup\n",
                    encoding="utf-8",
                )
            if with_log:
                (session / f"{name}_log_01.md").write_text(
                    "---\n"
                    "doc_type: log\n"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Log\n\n## Timeline\n- 2026-03-07 18:00 - Session created - ok\n",
                    encoding="utf-8",
                )
            if with_report:
                (session / f"{name}_report_01.md").write_text(
                    "---\n"
                    "doc_type: report\n"
                    "status: active\n"
                    "updated_at: '2026-03-07T18:00:00-03:00'\n"
                    "---\n\n# Report\n\n## Summary\n- Session baseline exists.\n\n## Delivered Changes\n- Catchup fixture prepared.\n\n## Verification\n- Fixture setup: `git commit` -> pass -> Evidence: repo baseline created\n",
                    encoding="utf-8",
                )
            return session

        clean = write_session("260307_2300_clean")
        missing = write_session(
            "260307_2301_missing-context",
            with_plan=False,
            with_task=False,
            with_log=False,
            with_report=False,
            with_research=False,
        )
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
        assert set(missing_payload["missing_context"]) >= {"task"}

        missing_research_payload = run_catchup(missing_research)
        assert missing_research_payload["catchup_required"] is True
        assert any("research artifact" in warning.lower() for warning in missing_research_payload["warnings"])

        (temp_root / "outside-change.txt").write_text("drift\n", encoding="utf-8")
        drift_payload = run_catchup(clean)
        assert drift_payload["catchup_required"] is True
        assert drift_payload["git"]["repo_changed"] >= 1
        assert any("repo has changes outside the session" in warning.lower() for warning in drift_payload["warnings"])
