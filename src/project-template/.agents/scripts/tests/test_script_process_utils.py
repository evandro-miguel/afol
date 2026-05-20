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


def test_run_command_fallback_on_timeout_kwarg_error(monkeypatch):
    """First call raises TypeError for 'timeout' kwarg; second call succeeds."""
    call_count = {"n": 0}
    expected = SimpleNamespace(returncode=0)

    def _fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TypeError("unexpected keyword argument 'timeout'")
        return expected

    monkeypatch.setattr(subprocess, "run", _fake_run)
    result = run_command(["echo", "fallback"])
    assert result.returncode == 0
    assert call_count["n"] == 2


def test_run_command_fallback_on_timeout_kwarg_error_with_cwd(monkeypatch, tmp_path):
    """First call raises TypeError for 'timeout' kwarg with cwd; second call succeeds."""
    call_count = {"n": 0}
    expected = SimpleNamespace(returncode=0)

    def _fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TypeError("unexpected keyword argument 'timeout'")
        return expected

    monkeypatch.setattr(subprocess, "run", _fake_run)
    result = run_command(["echo", "fallback"], cwd=tmp_path)
    assert result.returncode == 0


def test_run_command_double_fallback_text_kwarg_error(monkeypatch):
    """First call raises TypeError for 'timeout', second for 'text', third succeeds."""
    call_count = {"n": 0}
    expected = SimpleNamespace(returncode=0)

    def _fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TypeError("unexpected keyword argument 'timeout'")
        if call_count["n"] == 2:
            raise TypeError("unexpected keyword argument 'text'")
        return expected

    monkeypatch.setattr(subprocess, "run", _fake_run)
    result = run_command(["echo", "double-fallback"])
    assert result.returncode == 0
    assert call_count["n"] == 3


def test_run_command_double_fallback_text_kwarg_error_with_cwd(monkeypatch, tmp_path):
    """Double fallback with cwd path."""
    call_count = {"n": 0}
    expected = SimpleNamespace(returncode=0)

    def _fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TypeError("unexpected keyword argument 'timeout'")
        if call_count["n"] == 2:
            raise TypeError("unexpected keyword argument 'text'")
        return expected

    monkeypatch.setattr(subprocess, "run", _fake_run)
    result = run_command(["echo", "double-fallback"], cwd=tmp_path)
    assert result.returncode == 0


def test_run_command_unexpected_typeerror_reraises(monkeypatch):
    """Non-timeout/non-text TypeError should reraise."""

    def _fake_run(cmd, **kwargs):
        raise TypeError("unexpected keyword argument 'capture_output'")

    monkeypatch.setattr(subprocess, "run", _fake_run)
    with pytest.raises(TypeError, match="capture_output"):
        run_command(["echo", "bad"])


def test_run_command_secondary_unexpected_typeerror_reraises(monkeypatch):
    """Secondary fallback TypeError that is not 'text' should reraise."""
    call_count = {"n": 0}

    def _fake_run(cmd, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise TypeError("unexpected keyword argument 'timeout'")
        raise TypeError("unexpected keyword argument 'encoding'")

    monkeypatch.setattr(subprocess, "run", _fake_run)
    with pytest.raises(TypeError, match="encoding"):
        run_command(["echo", "bad-secondary"])
