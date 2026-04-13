import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(".agents/scripts").resolve()))

from lib.process_utils import DEFAULT_COMMAND_TIMEOUT_SECONDS, ScriptProcessError, run_command


def test_run_command_rejects_empty_command():
    with pytest.raises(ValueError, match="command must not be empty"):
        run_command([])


def test_run_command_rejects_non_positive_timeout():
    with pytest.raises(ValueError, match="timeout must be positive"):
        run_command(["echo", "ok"], timeout=0)


def test_run_command_translates_timeout(monkeypatch):
    def _timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd=["sleep"], timeout=5)

    monkeypatch.setattr(subprocess, "run", _timeout)

    with pytest.raises(
        ScriptProcessError,
        match=f"Command timed out after {DEFAULT_COMMAND_TIMEOUT_SECONDS}s",
    ):
        run_command(["sleep", "99"])


def test_run_command_forwards_kwargs(monkeypatch, tmp_path):
    captured = {}

    def _fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["cwd"] = kwargs.get("cwd")
        captured["text"] = kwargs.get("text")
        captured["env"] = kwargs.get("env")
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, "run", _fake_run)

    run_command(["echo", "ok"], cwd=tmp_path, text=True, env={"PATH": "override"})

    assert captured["cmd"] == ["echo", "ok"]
    assert captured["cwd"] == tmp_path
    assert captured["text"] is True
    assert captured["env"] == {"PATH": "override"}


def test_run_command_propagates_non_timeout_failure(monkeypatch):
    def _run_raises(*_args, **_kwargs):
        raise FileNotFoundError("boom")

    monkeypatch.setattr(subprocess, "run", _run_raises)

    with pytest.raises(FileNotFoundError, match="boom"):
        run_command(["this-command-does-not-exist"])
