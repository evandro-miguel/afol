from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from typer.testing import CliRunner

from agentic_scaffold.cli import app
from agentic_scaffold.runtime import AgenticRuntime

runner = CliRunner()


def _registered_cli_commands() -> set[str]:
    names: set[str] = set()
    for command in app.registered_commands:
        if command.name:
            names.add(command.name)
            continue
        callback = getattr(command, "callback", None)
        callback_name = getattr(callback, "__name__", "")
        if callback_name:
            names.add(callback_name.replace("_", "-"))
    return names


def test_cli_action_commands_are_registered_from_shared_specs(scaffold_repo):
    _ = scaffold_repo
    command_names = _registered_cli_commands()
    action_specs = AgenticRuntime.action_specs()
    assert {spec.cli_command for spec in action_specs} <= command_names



def test_cli_manifest(scaffold_repo):
    result = runner.invoke(app, ["manifest", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["skill_count"] == 1
    assert "\n  " not in result.stdout


def test_cli_manifest_pretty_mode(scaffold_repo):
    result = runner.invoke(app, ["manifest", "--pretty", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["skill_count"] == 1
    assert "\n  " in result.stdout



def test_cli_validate(scaffold_repo):
    result = runner.invoke(app, ["validate", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True


def test_cli_inspect_matches_core_action(scaffold_repo):
    result = runner.invoke(
        app,
        ["inspect", "--depth", "2", "--max-entries", "10", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == 0

    cli_payload = json.loads(result.stdout)
    assert cli_payload["max_depth"] == 2

    core_payload = AgenticRuntime.from_repo_root(scaffold_repo).run_action("inspect", depth=2, max_entries=10)
    assert core_payload.status == "ok"
    assert cli_payload["max_depth"] == core_payload.payload["max_depth"]


def test_cli_inspect_invalid_depth_returns_action_error(scaffold_repo):
    result = runner.invoke(app, ["inspect", "--depth", "99", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "error"
    assert payload["message"] == "depth must be between 0 and 10"


def test_cli_inspect_invalid_max_entries_returns_core_error(scaffold_repo):
    result = runner.invoke(app, ["inspect", "--max-entries", "0", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "error"
    assert payload["message"] == "max_entries must be between 1 and 5000"


def test_cli_health(scaffold_repo):
    result = runner.invoke(app, ["health", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["status"] == "healthy"
    assert payload["checks"]["command_registry"]["required_available"] is True
    assert "required" in payload["checks"]["command_registry"]


def test_cli_adoption_plan(scaffold_repo):
    result = runner.invoke(app, ["adoption-plan", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["repo_root"] == str(scaffold_repo)
    assert payload["inspection"]["has_runtime_wrapper"] is False
    kinds = [item["kind"] for item in payload["actions"]]
    assert "add-wrapper" in kinds
    assert "reconcile-skills" in kinds
    assert "benchmark" in kinds


def test_cli_inspect_target(scaffold_repo):
    result = runner.invoke(app, ["inspect-target", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["repo_root"] == str(scaffold_repo)
    assert payload["has_justfile"] is False
    assert payload["has_mcp_wrapper"] is False


def _write_argv_script(scaffold_repo, script_name: str, label: str) -> None:
    script = scaffold_repo / ".agents" / "scripts" / script_name
    script.write_text(
        "import sys\n"
        f"print('{label}:' + ' '.join(sys.argv[1:]))\n",
        encoding="utf-8",
    )


def _stage_runtime_script(scaffold_repo, script_name: str) -> Path:
    source_scripts_dir = Path(__file__).resolve().parents[3] / ".agents" / "scripts"
    target_scripts_dir = scaffold_repo / ".agents" / "scripts"
    target_scripts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_scripts_dir / script_name, target_scripts_dir / script_name)
    shutil.copytree(source_scripts_dir / "lib", target_scripts_dir / "lib", dirs_exist_ok=True)
    return target_scripts_dir / script_name


def _stage_status_script(scaffold_repo) -> Path:
    return _stage_runtime_script(scaffold_repo, "agents-status.py")


def _stage_knowledge_script(scaffold_repo) -> Path:
    return _stage_runtime_script(scaffold_repo, "agents-knowledge.py")


def _seed_status_session(scaffold_repo) -> str:
    session_id = "260401_1200_status-parity"
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text(
        "---\n"
        "doc_type: plan\n"
        f"id: {session_id}_plan_01\n"
        "status: active\n"
        "roadmap_feature: F-13\n"
        "updated_at: '2026-04-04T08:54:11-03:00'\n"
        "---\n\n"
        "# Plan\n\n"
        "## Progress\n"
        "- [x] seeded plan\n\n"
        "## Concrete Steps\n"
        "1. Seed status parity fixtures.\n",
        encoding="utf-8",
    )
    (session_dir / f"{session_id}_task_01.md").write_text(
        "---\n"
        "doc_type: task\n"
        f"id: {session_id}_task_01\n"
        "status: active\n"
        "roadmap_feature: F-13\n"
        "updated_at: '2026-04-04T08:54:11-03:00'\n"
        "---\n\n"
        "# Tasks\n\n"
        "## State Board\n\n"
        "| Task | State | Owner | Notes |\n"
        "|------|-------|-------|-------|\n"
        "| T-01 | pending | worker | Validate status parity |\n",
        encoding="utf-8",
    )
    return session_id


def _seed_knowledge_session(scaffold_repo) -> str:
    session_id = "260401_1300_knowledge-parity"
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_research_01.md").write_text(
        "---\n"
        "doc_type: research\n"
        f"id: {session_id}_research_01\n"
        "theme: runtime\n"
        "status: active\n"
        "---\n\n"
        "# Research: knowledge parity\n\n"
        "Runtime knowledge pull parity keeps output aligned with legacy script behavior.\n"
        "This line repeats runtime to generate snippet matches for runtime queries.\n",
        encoding="utf-8",
    )
    return session_id


def test_cli_command_registry_manifest(scaffold_repo):
    result = runner.invoke(app, ["command-registry", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    commands = {item["name"]: item for item in payload["commands"]}
    assert {
        "status",
        "knowledge",
        "session",
        "local-state",
        "doctor",
        "benchmark",
        "scaffold-update",
        "skills-sync",
        "verify-tasks",
    } <= set(commands)
    assert commands["status"]["script_name"] == "agents-status.py"
    assert commands["status"]["phase"] == "native"
    assert commands["scaffold-update"]["script_name"] == "agents-scaffold-update.py"
    assert commands["verify"]["alias_of"] == "verify-tasks"

    help_commands = {item["name"]: item for item in payload["help_commands"]}
    assert "lint-docs" in help_commands
    assert "scaffold-update" in help_commands
    assert "lint" not in help_commands
    assert help_commands["lint-docs"]["aliases"] == ["lint"]
    assert help_commands["structure-map"]["aliases"] == ["map"]


def test_cli_registered_status_matches_script(scaffold_repo):
    status_script = _stage_status_script(scaffold_repo)
    session_id = _seed_status_session(scaffold_repo)
    legacy = subprocess.run(
        [sys.executable, str(status_script), "--session", session_id, "--json"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["status", "--session", session_id, "--json", "--repo-root", str(scaffold_repo)])

    assert legacy.returncode == 0
    assert result.exit_code == 0
    legacy_payload = json.loads(legacy.stdout)
    runtime_payload = json.loads(result.stdout)
    legacy_payload.pop("generated_at", None)
    runtime_payload.pop("generated_at", None)
    assert runtime_payload == legacy_payload
    assert sys.executable


def test_cli_registered_status_matches_script_error_contract(scaffold_repo):
    status_script = _stage_status_script(scaffold_repo)
    session_id = _seed_status_session(scaffold_repo)
    legacy = subprocess.run(
        [sys.executable, str(status_script), "--session", session_id, "--pretty"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["status", "--session", session_id, "--pretty", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 2
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_status_uses_in_process_path(scaffold_repo, monkeypatch):
    _stage_status_script(scaffold_repo)
    session_id = _seed_status_session(scaffold_repo)

    def _unexpected_run_command(*_args, **_kwargs):
        raise AssertionError("status should not call run_command subprocess path")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _unexpected_run_command)
    result = runner.invoke(app, ["status", "--session", session_id, "--json", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["session"] == session_id


def test_cli_registered_knowledge_pull_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    _seed_knowledge_session(scaffold_repo)

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "pull", "runtime", "--limit", "5", "--snippets", "2"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(
        app,
        ["knowledge", "pull", "runtime", "--limit", "5", "--snippets", "2", "--repo-root", str(scaffold_repo)],
    )
    assert legacy.returncode == 0
    assert result.exit_code == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_pull_no_match_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    _seed_knowledge_session(scaffold_repo)

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "pull", "nonexistent-topic"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "pull", "nonexistent-topic", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_pull_uses_native_path(scaffold_repo, monkeypatch):
    _seed_knowledge_session(scaffold_repo)

    def _unexpected_run_command(*_args, **_kwargs):
        raise AssertionError("knowledge pull should not call run_command subprocess path")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _unexpected_run_command)
    result = runner.invoke(app, ["knowledge", "pull", "runtime", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert "# Knowledge Pull: runtime" in result.stdout


def test_cli_registered_session_matches_script(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-session.py", "session")
    result = runner.invoke(app, ["session", "catchup", "--json", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "session:catchup --json\n"


def test_cli_run_registered_command(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-doctor.py", "doctor")
    result = runner.invoke(app, ["run", "doctor", "--fix", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "doctor:--fix\n"


def test_cli_run_registered_benchmark_command(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-benchmark.py", "benchmark")
    result = runner.invoke(app, ["run", "benchmark", "list", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "benchmark:list\n"


def test_cli_run_forwards_help_to_registered_command(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-doctor.py", "doctor")
    result = runner.invoke(app, ["run", "doctor", "--help", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "doctor:--help\n"
