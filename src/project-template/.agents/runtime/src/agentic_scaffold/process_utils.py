from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Sequence


class ProcessError(RuntimeError):
    pass


DEFAULT_COMMAND_TIMEOUT_SECONDS = 120


def run_command(
    cmd: Sequence[str],
    *,
    cwd: Path | None = None,
    timeout: int = DEFAULT_COMMAND_TIMEOUT_SECONDS,
    **kwargs: object,
) -> subprocess.CompletedProcess[str]:
    """Run a command with a timeout and normalized default arguments.

    Keeps caller logic explicit while standardizing command execution behavior
    for subprocess calls in runtime surfaces.
    """
    run_kwargs = dict(kwargs)
    run_kwargs.setdefault("text", True)
    full_kwargs = dict(run_kwargs)
    full_kwargs["timeout"] = timeout
    run_kwargs_no_timeout = dict(run_kwargs)

    try:
        return (
            subprocess.run(list(cmd), cwd=cwd, **full_kwargs)
            if cwd is not None
            else subprocess.run(
                list(cmd),
                **full_kwargs,
            )
        )
    except subprocess.TimeoutExpired as exc:
        raise ProcessError(f"Command timed out after {timeout}s: {' '.join(cmd)}") from exc
    except TypeError as exc:
        message = str(exc)
        if "unexpected keyword argument 'timeout'" not in message:
            raise
        try:
            return (
                subprocess.run(list(cmd), cwd=cwd, **run_kwargs_no_timeout)
                if cwd is not None
                else subprocess.run(list(cmd), **run_kwargs_no_timeout)
            )
        except TypeError as secondary:
            if "unexpected keyword argument" not in str(secondary):
                raise
            if "unexpected keyword argument 'text'" not in str(secondary):
                raise
            return (
                subprocess.run(list(cmd), cwd=cwd) if cwd is not None else subprocess.run(list(cmd))
            )
