from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from typer.testing import CliRunner

from agentic_scaffold.cli import app
from agentic_scaffold.runtime import AgenticRuntime

runner = CliRunner()


def _normalize_catchup_payload(payload: dict[str, object]) -> dict[str, object]:
    payload.pop("generated_at", None)
    artifacts = payload.get("artifacts")
    if isinstance(artifacts, dict):
        for artifact in artifacts.values():
            if isinstance(artifact, dict):
                artifact.pop("mtime", None)
    return payload


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


def _stage_session_script(scaffold_repo) -> Path:
    return _stage_runtime_script(scaffold_repo, "agents-session.py")


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


def _write_malformed_knowledge_markdown(scaffold_repo, session_id: str, name: str = "malformed.md") -> Path:
    path = scaffold_repo / ".agents" / "wb" / session_id / name
    path.write_bytes(
        b"---\n"
        b"doc_type: research\n"
        b"id: malformed_utf8\n"
        b"theme: runtime\n"
        b"status: active\n"
        b"---\n\n"
        b"# Malformed utf8 fixture\n\n"
        b"Invalid byte: \xff\n"
    )
    return path


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


def test_cli_registered_knowledge_pull_malformed_utf8_matches_legacy_failure(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    _write_malformed_knowledge_markdown(scaffold_repo, session_id)

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "pull", "runtime"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "pull", "runtime", "--repo-root", str(scaffold_repo)])

    assert legacy.returncode == 1
    assert "UnicodeDecodeError" in legacy.stderr
    assert result.exit_code == legacy.returncode == 1
    assert isinstance(result.exception, UnicodeDecodeError)
    assert result.stdout == legacy.stdout == ""


def test_cli_registered_knowledge_list_type_limit_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    (session_dir / f"{session_id}_postmortem_01.md").write_text(
        "---\n"
        "doc_type: postmortem\n"
        f"id: {session_id}_postmortem_01\n"
        "theme: runtime\n"
        "status: final\n"
        "---\n\n"
        "# Postmortem: parity gap\n\n"
        "Runtime list parity sample.\n",
        encoding="utf-8",
    )

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "list", "--type", "research", "--limit", "1"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(
        app,
        ["knowledge", "list", "--type", "research", "--limit", "1", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_list_empty_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "list"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "list", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_list_malformed_utf8_matches_legacy_failure(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    _write_malformed_knowledge_markdown(scaffold_repo, session_id)

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "list"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "list", "--repo-root", str(scaffold_repo)])

    assert legacy.returncode == 1
    assert "UnicodeDecodeError" in legacy.stderr
    assert result.exit_code == legacy.returncode == 1
    assert isinstance(result.exception, UnicodeDecodeError)
    assert result.stdout == legacy.stdout == ""


def test_cli_registered_knowledge_search_order_limit_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    (session_dir / f"{session_id}_research_02.md").write_text(
        "---\n"
        "doc_type: research\n"
        f"id: {session_id}_research_02\n"
        "theme: runtime\n"
        "status: active\n"
        "---\n\n"
        "# Research: additional runtime evidence\n\n"
        "Runtime runtime runtime repeated for ranking coverage.\n",
        encoding="utf-8",
    )

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "search", "runtime", "--limit", "1"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(
        app,
        ["knowledge", "search", "runtime", "--limit", "1", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr
    assert result.stdout.count("\n[") <= 1


def test_cli_registered_knowledge_search_no_match_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    _seed_knowledge_session(scaffold_repo)
    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "search", "nonexistent-topic"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "search", "nonexistent-topic", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_show_by_doc_id_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    doc_id = f"{session_id}_research_01"
    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "show", doc_id],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "show", doc_id, "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_show_by_path_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    relative_path = f".agents/wb/{session_id}/{session_id}_research_01.md"
    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "show", relative_path],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "show", relative_path, "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_show_missing_reference_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    _seed_knowledge_session(scaffold_repo)
    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "show", "missing-reference"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(app, ["knowledge", "show", "missing-reference", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == legacy.returncode == 1
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr


def test_cli_registered_knowledge_list_search_show_use_native_path(scaffold_repo, monkeypatch):
    session_id = _seed_knowledge_session(scaffold_repo)
    doc_id = f"{session_id}_research_01"

    def _unexpected_run_command(*_args, **_kwargs):
        raise AssertionError("knowledge list/search/show should not call run_command subprocess path")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _unexpected_run_command)

    list_result = runner.invoke(app, ["knowledge", "list", "--repo-root", str(scaffold_repo)])
    assert list_result.exit_code == 0
    assert doc_id in list_result.stdout

    search_result = runner.invoke(app, ["knowledge", "search", "runtime", "--repo-root", str(scaffold_repo)])
    assert search_result.exit_code == 0
    assert doc_id in search_result.stdout

    show_result = runner.invoke(app, ["knowledge", "show", doc_id, "--repo-root", str(scaffold_repo)])
    assert show_result.exit_code == 0
    assert f"id: {doc_id}" in show_result.stdout


def test_cli_registered_knowledge_index_stays_delegated_subprocess(scaffold_repo, monkeypatch):
    _stage_knowledge_script(scaffold_repo)
    calls: list[list[str]] = []

    def _capture_run_command(cmd, **_kwargs):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="delegated-index\n", stderr="")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _capture_run_command)
    result = runner.invoke(app, ["knowledge", "index", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert result.stdout == "delegated-index\n"
    assert len(calls) == 1
    assert Path(calls[0][1]).name == "agents-knowledge.py"
    assert calls[0][2:] == ["index"]


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


def test_cli_registered_knowledge_pull_multi_hit_order_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    (session_dir / f"{session_id}_research_02.md").write_text(
        "---\n"
        "doc_type: research\n"
        f"id: {session_id}_research_02\n"
        "theme: runtime\n"
        "status: active\n"
        "---\n\n"
        "# Research: secondary runtime note\n\n"
        "Runtime fallback coverage check.\n",
        encoding="utf-8",
    )

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
    assert sum(1 for line in result.stdout.splitlines() if line.startswith("- ")) >= 2


def test_cli_registered_knowledge_pull_snippet_limit_boundary_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    session_id = _seed_knowledge_session(scaffold_repo)
    session_dir = scaffold_repo / ".agents" / "wb" / session_id
    knowledge_doc = session_dir / f"{session_id}_research_01.md"
    knowledge_doc.write_text(
        knowledge_doc.read_text(encoding="utf-8")
        + "Runtime boundary line to exercise snippet limit behavior.\n",
        encoding="utf-8",
    )

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "pull", "runtime", "--limit", "5", "--snippets", "1"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(
        app,
        ["knowledge", "pull", "runtime", "--limit", "5", "--snippets", "1", "--repo-root", str(scaffold_repo)],
    )

    assert legacy.returncode == 0
    assert result.exit_code == 0
    assert result.stdout == legacy.stdout
    assert result.stderr == legacy.stderr
    assert result.stdout.count("  snippet L") == 1


def test_cli_registered_knowledge_pull_invalid_arg_stderr_contract_matches_script(scaffold_repo):
    knowledge_script = _stage_knowledge_script(scaffold_repo)
    _seed_knowledge_session(scaffold_repo)

    legacy = subprocess.run(
        [sys.executable, str(knowledge_script), "pull", "runtime", "--bad-flag"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
    )
    result = runner.invoke(
        app,
        ["knowledge", "pull", "runtime", "--bad-flag", "--repo-root", str(scaffold_repo)],
    )

    assert result.exit_code == legacy.returncode == 2
    assert result.stdout == legacy.stdout == ""
    legacy_error = [line for line in legacy.stderr.splitlines() if "error:" in line][-1]
    runtime_error = [line for line in result.stderr.splitlines() if "error:" in line][-1]
    assert legacy_error.split("error:", maxsplit=1)[1].strip() == runtime_error.split("error:", maxsplit=1)[1].strip()
    assert "usage:" in legacy.stderr
    assert "usage:" in result.stderr


def test_cli_registered_knowledge_pull_uses_native_path(scaffold_repo, monkeypatch):
    _seed_knowledge_session(scaffold_repo)

    def _unexpected_run_command(*_args, **_kwargs):
        raise AssertionError("knowledge pull should not call run_command subprocess path")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _unexpected_run_command)
    result = runner.invoke(app, ["knowledge", "pull", "runtime", "--repo-root", str(scaffold_repo)])
    assert result.exit_code == 0
    assert "# Knowledge Pull: runtime" in result.stdout


def test_cli_registered_session_matches_script(scaffold_repo, monkeypatch):
    session_script = _stage_session_script(scaffold_repo)
    session_id = _seed_status_session(scaffold_repo)
    monkeypatch.setattr(sys, "dont_write_bytecode", True)

    legacy = subprocess.run(
        [sys.executable, str(session_script), "catchup", "--session", session_id, "--json"],
        cwd=scaffold_repo,
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
    )
    result = runner.invoke(
        app,
        ["session", "catchup", "--session", session_id, "--json", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == legacy.returncode == 0
    legacy_payload = _normalize_catchup_payload(json.loads(legacy.stdout))
    runtime_payload = _normalize_catchup_payload(json.loads(result.stdout))
    assert runtime_payload == legacy_payload
    assert result.stderr == legacy.stderr


def test_cli_registered_session_catchup_uses_in_process_path(scaffold_repo, monkeypatch):
    _stage_session_script(scaffold_repo)
    session_id = _seed_status_session(scaffold_repo)

    def _unexpected_run_command(*_args, **_kwargs):
        raise AssertionError("session catchup should not call run_command subprocess path")

    monkeypatch.setattr("agentic_scaffold.registry.run_command", _unexpected_run_command)
    result = runner.invoke(
        app,
        ["session", "catchup", "--session", session_id, "--json", "--repo-root", str(scaffold_repo)],
    )
    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["session"] == session_id


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
