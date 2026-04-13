#!/usr/bin/env python3
"""Session lifecycle helpers for governed workstreams."""

from __future__ import annotations

import argparse
import subprocess
import json
import sys
from pathlib import Path
from typing import Dict, Optional

from lib.agents_config import get_active_session_file_path, load_agents_config
from lib.execution_commands import ExecutionError, build_session_catchup, find_session

try:
    from lib.process_utils import run_command
except ImportError:

    def run_command(
        cmd,
        *,
        cwd: Path | None = None,
        timeout: int = 120,
        **kwargs,
    ):
        return subprocess.run(list(cmd), cwd=cwd, timeout=timeout, **kwargs)

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
ACTIVE_SESSION_FILE = get_active_session_file_path(ROOT_DIR, CONFIG)
VERIFY_TASKS_SCRIPT = Path(__file__).resolve().parent / "verify-tasks.py"


def _read_active_session() -> str:
    if not ACTIVE_SESSION_FILE.exists():
        return ""
    return ACTIVE_SESSION_FILE.read_text(encoding="utf-8").strip()


def _write_active_session(session_id: str) -> None:
    ACTIVE_SESSION_FILE.write_text(f"{session_id}\n", encoding="utf-8")


def _print_items(label: str, items: list[str]) -> None:
    if not items:
        return
    print(f"{label}:")
    for item in items:
        print(f" - {item}")


def _run_strict_verify(session_dir: Path) -> subprocess.CompletedProcess[str]:
    return run_command(
        [sys.executable, str(VERIFY_TASKS_SCRIPT), "--strict", str(session_dir)],
        capture_output=True,
        text=True,
        check=False,
    )


def _resolve_next_session(reference: Optional[str], target: Path) -> Optional[Path]:
    if not reference:
        return None
    next_session = find_session(reference)
    if next_session == target:
        raise ExecutionError("--next-session must differ from the session being closed")
    return next_session


def _print_task_summary(tasks: Dict[str, object]) -> None:
    print(f"tasks: {tasks['done']}/{tasks['total']} done, {tasks['remaining']} remaining")
    nxt = tasks.get("next")
    if nxt:
        print(f"next_task: {nxt['task_id']} {nxt['state']} {nxt['notes']}")
    _print_items("blocked_tasks", list(tasks.get("blocked", [])))


def _print_git_summary(git_data: Dict[str, object]) -> None:
    print(
        "git_changes: "
        f"total={git_data['changed']} repo={git_data['repo_changed']} session={git_data['session_changed']}"
    )
    _print_items("repo_paths", list(git_data.get("repo_paths", [])))
    _print_items("session_paths", list(git_data.get("session_paths", [])))


def cmd_close(args: argparse.Namespace) -> int:
    target = find_session(args.session)
    next_session = _resolve_next_session(args.next_session, target)
    verify = _run_strict_verify(target)
    if verify.returncode != 0:
        if verify.stdout.strip():
            print(verify.stdout.rstrip())
        if verify.stderr.strip():
            print(verify.stderr.rstrip())
        print(f"❌ Session {target.name} failed strict verification; closure aborted.")
        return 1

    active_before = _read_active_session()
    pointer_action = "unchanged"
    active_after = active_before

    if next_session is not None:
        _write_active_session(next_session.name)
        pointer_action = "repointed"
        active_after = next_session.name
    elif active_before == target.name:
        pointer_action = "retained"

    payload = {
        "session": target.name,
        "closed": True,
        "strict_verify": "passed",
        "active_session_before": active_before or None,
        "active_session_after": active_after or None,
        "pointer_action": pointer_action,
        "next_session": next_session.name if next_session else None,
    }

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print(f"✓ session closed: {target.name}")
    print("strict_verify: passed")
    if pointer_action == "repointed":
        print(f"active_session: {active_before or 'unset'} -> {active_after}")
    elif pointer_action == "retained":
        print(f"active_session: {active_after} (closed session remains the default pointer)")
    else:
        print(f"active_session: unchanged ({active_after or 'unset'})")
    return 0


def _print_catchup(payload: Dict[str, object]) -> None:
    print("Agents Session Catchup")
    print(f"session: {payload['session']}")
    print(f"roadmap_feature: {payload['roadmap_feature']}")
    print(f"catchup_required: {payload['catchup_required']}")
    print(f"context_ready: {payload['context_ready']}")
    _print_items("missing_context", list(payload.get("missing_context", [])))
    _print_task_summary(payload["tasks"])
    _print_git_summary(payload["git"])
    _print_items("stale_artifacts", list(payload.get("stale_artifacts", [])))
    _print_items("warnings", list(payload.get("warnings", [])))
    print(f"next_step: {payload['next_step']}")


def cmd_catchup(args: argparse.Namespace) -> int:
    target = find_session(args.session)
    payload = build_session_catchup(target, paths_limit=args.paths_limit)

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    _print_catchup(payload)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage session lifecycle actions")
    sub = parser.add_subparsers(dest="command", required=True)

    p_close = sub.add_parser(
        "close",
        help="Run strict closure checks and optionally repoint the active session",
    )
    p_close.add_argument("--session", help="Session id/path (default: active session)")
    p_close.add_argument(
        "--next-session",
        help="Optional session id/path to become the new active-session pointer after successful closure",
    )
    p_close.add_argument("--json", action="store_true", help="Emit JSON payload")
    p_close.set_defaults(func=cmd_close)

    p_catchup = sub.add_parser(
        "catchup",
        help="Summarize working-tree drift, session artifact freshness, and the next safe resume step",
    )
    p_catchup.add_argument("--session", help="Session id/path (default: active session)")
    p_catchup.add_argument("--json", action="store_true", help="Emit JSON payload")
    p_catchup.add_argument("--paths-limit", type=int, default=10, help="Limit listed git paths in output")
    p_catchup.set_defaults(func=cmd_catchup)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
