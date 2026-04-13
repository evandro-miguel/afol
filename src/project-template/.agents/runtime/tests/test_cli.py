from __future__ import annotations

import json
import sys

from typer.testing import CliRunner

from agentic_scaffold.cli import app

runner = CliRunner()



def test_cli_manifest(scaffold_repo):
    result = runner.invoke(app, ["manifest", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["skill_count"] == 1



def test_cli_validate(scaffold_repo):
    result = runner.invoke(app, ["validate", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True


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
    assert {"status", "knowledge", "session", "doctor", "skills-sync", "verify-tasks"} <= set(commands)
    assert commands["status"]["script_name"] == "agents-status.py"
    assert commands["verify"]["alias_of"] == "verify-tasks"

    help_commands = {item["name"]: item for item in payload["help_commands"]}
    assert "lint-docs" in help_commands
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


def test_cli_run_forwards_help_to_registered_command(scaffold_repo):
    _write_argv_script(scaffold_repo, "agents-doctor.py", "doctor")
    result = runner.invoke(app, ["run", "doctor", "--help", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "doctor:--help\n"
