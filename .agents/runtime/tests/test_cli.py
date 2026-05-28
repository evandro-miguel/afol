from __future__ import annotations

import json
import sys

from typer.testing import CliRunner

from agentic_scaffold.cli import app
from agentic_scaffold.runtime import AgenticRuntime

runner = CliRunner()



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
        ["inspect", "--depth", "2", "--max-entries", "60", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == 0

    cli_payload = json.loads(result.stdout)
    assert cli_payload["max_depth"] == 2

    core_payload = AgenticRuntime.from_repo_root(scaffold_repo).run_action("inspect", depth=2, max_entries=60)
    assert core_payload.status == "ok"
    assert cli_payload["max_depth"] == core_payload.payload["max_depth"]


def test_cli_inspect_invalid_depth_returns_action_error(scaffold_repo):
    result = runner.invoke(app, ["inspect", "--depth", "99", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "error"
    assert payload["message"] == "depth must be between 0 and 10"


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


def test_cli_command_registry_manifest(scaffold_repo):
    result = runner.invoke(app, ["command-registry", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    commands = {item["name"]: item for item in payload["commands"]}
    assert {
        "status",
        "knowledge",
        "session",
        "doctor",
        "benchmark",
        "scaffold-update",
        "skills-sync",
        "verify-tasks",
    } <= set(commands)
    assert commands["status"]["script_name"] == "agents-status.py"
    assert commands["scaffold-update"]["script_name"] == "agents-scaffold-update.py"
    assert commands["verify"]["alias_of"] == "verify-tasks"

    help_commands = {item["name"]: item for item in payload["help_commands"]}
    assert "lint-docs" in help_commands
    assert "scaffold-update" in help_commands
    assert "lint" not in help_commands
    assert help_commands["lint-docs"]["aliases"] == ["lint"]
    assert help_commands["structure-map"]["aliases"] == ["map"]


def test_cli_registered_status_matches_script(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-status.py", "status")
    result = runner.invoke(app, ["status", "--json", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "status:--json\n"
    assert sys.executable


def test_cli_registered_knowledge_matches_script(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-knowledge.py", "knowledge")
    result = runner.invoke(app, ["knowledge", "pull", "runtime", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "knowledge:pull runtime\n"


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
