import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parents[1]


def load_module(module_name: str, relative_path: str):
    script_path = SCRIPTS_DIR / relative_path
    lib_dir = SCRIPTS_DIR / "lib"
    for candidate in (SCRIPTS_DIR, lib_dir, script_path.parent):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_execution_commands_find_session_resolution_order_and_strict(tmp_path, monkeypatch):
    execution_commands = load_module(
        "execution_commands_session_contract_test", "lib/execution_commands.py"
    )

    wb_dir = tmp_path / ".agents" / "wb"
    wb_dir.mkdir(parents=True, exist_ok=True)
    explicit_dir = wb_dir / "260426_1400_explicit"
    env_dir = wb_dir / "260426_1401_env"
    active_dir = wb_dir / "260426_1402_active"
    for session_dir in (explicit_dir, env_dir, active_dir):
        session_dir.mkdir(parents=True, exist_ok=True)
    active_file = wb_dir / ".active_session"
    active_file.write_text(active_dir.name + "\n", encoding="utf-8")

    monkeypatch.setattr(execution_commands, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(execution_commands, "WB_DIR", wb_dir)
    monkeypatch.setattr(execution_commands, "CANONICAL_WB_DIR", wb_dir)
    monkeypatch.setattr(
        execution_commands,
        "get_active_session_file_path",
        lambda root_dir, cfg: active_file,
    )

    monkeypatch.setenv("AGENTS_SESSION_ID", env_dir.name)
    assert execution_commands.find_session(explicit_dir.name) == explicit_dir.resolve()
    assert execution_commands.find_session(None) == env_dir.resolve()

    monkeypatch.delenv("AGENTS_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENTS_SESSION_STRICT", raising=False)
    assert execution_commands.find_session(None) == active_dir.resolve()

    monkeypatch.setenv("AGENTS_SESSION_STRICT", "1")
    with pytest.raises(
        execution_commands.ExecutionError, match="Pass --session <id/path> or set AGENTS_SESSION_ID"
    ):
        execution_commands.find_session(None)


def test_wb_update_resolve_session_order_and_strict(tmp_path, monkeypatch):
    wb_update = load_module("agents_wb_update_session_contract_test", "agents-wb-update.py")

    wb_dir = tmp_path / ".agents" / "wb"
    wb_dir.mkdir(parents=True, exist_ok=True)
    explicit_dir = wb_dir / "260426_1410_explicit"
    env_dir = wb_dir / "260426_1411_env"
    active_dir = wb_dir / "260426_1412_active"
    for session_dir in (explicit_dir, env_dir, active_dir):
        session_dir.mkdir(parents=True, exist_ok=True)
    active_file = wb_dir / ".active_session"
    active_file.write_text(active_dir.name + "\n", encoding="utf-8")

    monkeypatch.setattr(wb_update, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(wb_update, "WB_DIR", wb_dir)
    monkeypatch.setattr(wb_update, "CANONICAL_WB_DIR", wb_dir)
    monkeypatch.setattr(wb_update, "ACTIVE_SESSION_FILE", active_file)

    monkeypatch.setenv("AGENTS_SESSION_ID", env_dir.name)
    assert wb_update.resolve_session(explicit_dir.name) == explicit_dir.resolve()
    assert wb_update.resolve_session(None) == env_dir.resolve()

    monkeypatch.delenv("AGENTS_SESSION_ID", raising=False)
    monkeypatch.delenv("AGENTS_SESSION_STRICT", raising=False)
    assert wb_update.resolve_session(None) == active_dir.resolve()

    monkeypatch.setenv("AGENTS_SESSION_STRICT", "1")
    with pytest.raises(
        FileNotFoundError, match="Pass --session <id/path> or set AGENTS_SESSION_ID"
    ):
        wb_update.resolve_session(None)


def test_wb_update_require_explicit_session_accepts_agents_session_id(monkeypatch):
    wb_update = load_module("agents_wb_update_env_session_contract_test", "agents-wb-update.py")

    args = SimpleNamespace(session=None, file=None, all_wb=False, report=None)
    monkeypatch.setenv("AGENTS_SESSION_ID", "260426_1413_env")
    wb_update.require_explicit_session(args, "task")
