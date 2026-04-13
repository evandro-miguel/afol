import subprocess
import sys
from pathlib import Path

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
