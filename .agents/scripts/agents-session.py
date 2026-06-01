#!/usr/bin/env python3
"""Session lifecycle helpers for governed workstreams."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from lib.agents_config import get_active_session_file_path, get_cfg_path, load_agents_config
from lib.cli_output import to_json_text
from lib.execution_commands import (
    TERMINAL_ARTIFACT_STATUSES,
    ExecutionError,
    artifact_snapshot,
    build_session_catchup,
    find_session,
    parse_state_summary,
    resolve_artifact,
)

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
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
VERIFY_TASKS_SCRIPT = Path(__file__).resolve().parent / "verify-tasks.py"


def _read_active_session() -> str:
    if not ACTIVE_SESSION_FILE.exists():
        return ""
    return ACTIVE_SESSION_FILE.read_text(encoding="utf-8").strip()


def _write_active_session(session_id: str) -> None:
    ACTIVE_SESSION_FILE.write_text(f"{session_id}\n", encoding="utf-8")


def _clear_active_session() -> None:
    ACTIVE_SESSION_FILE.write_text("", encoding="utf-8")


def _print_items(label: str, items: list[str]) -> None:
    if not items:
        return
    print(f"{label}:")
    for item in items:
        print(f" - {item}")


def _emit_json(payload: Dict[str, Any], pretty: bool) -> None:
    print(to_json_text(payload, pretty=pretty, sort_keys=True))


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
        _clear_active_session()
        pointer_action = "cleared"
        active_after = ""

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
        _emit_json(payload, getattr(args, "pretty", False))
        return 0

    print(f"✓ session closed: {target.name}")
    print("strict_verify: passed")
    if pointer_action == "repointed":
        print(f"active_session: {active_before or 'unset'} -> {active_after}")
    elif pointer_action == "cleared":
        print("active_session: unset (closed session cannot remain the default pointer)")
    else:
        print(f"active_session: unchanged ({active_after or 'unset'})")
    return 0


def _iter_project_sessions() -> list[Path]:
    if not WB_DIR.exists():
        return []
    return sorted(
        [entry for entry in WB_DIR.iterdir() if entry.is_dir() and not entry.name.startswith(".")],
        key=lambda entry: entry.name,
    )


def _artifact_status(session_dir: Path, alias: str) -> Optional[str]:
    snapshot = artifact_snapshot(resolve_artifact(session_dir, alias))
    value = str(snapshot.get("status") or "").strip()
    return value or None


def _build_session_overview(session_dir: Path, active_session: str) -> Dict[str, Any]:
    task_file = resolve_artifact(session_dir, "task")
    total, done, remaining, blocked_rows, _ = parse_state_summary(task_file)
    blocked_count = len(blocked_rows)
    report_status = _artifact_status(session_dir, "report")
    postmortem_status = _artifact_status(session_dir, "postmortem")

    normalized_report = (report_status or "").strip().lower()
    normalized_postmortem = (postmortem_status or "").strip().lower()
    report_terminal = normalized_report in TERMINAL_ARTIFACT_STATUSES
    postmortem_terminal = normalized_postmortem in TERMINAL_ARTIFACT_STATUSES

    catchup_signal = (task_file is None) or remaining > 0 or blocked_count > 0
    stale_reasons: list[str] = []
    if report_terminal and remaining > 0:
        stale_reasons.append("report is terminal but tasks remain")
    if postmortem_terminal and not report_terminal:
        stale_reasons.append("postmortem is terminal without a terminal report")

    return {
        "active": active_session == session_dir.name,
        "session": session_dir.name,
        "tasks": {
            "total": total,
            "done": done,
            "remaining": remaining,
            "blocked": blocked_count,
        },
        "report_status": report_status,
        "postmortem_status": postmortem_status,
        "catchup_signal": catchup_signal,
        "stale_signal": bool(stale_reasons),
        "stale_reasons": stale_reasons,
        "close_candidate": bool(
            report_terminal and total > 0 and remaining == 0 and not stale_reasons
        ),
    }


def _print_session_list(payload: Dict[str, Any]) -> None:
    print(
        f"sessions: {payload['count']} active={payload['active_session'] or 'unset'} scope={payload['scope']}"
    )
    if not payload["sessions"]:
        return

    for entry in payload["sessions"]:
        marker = "*" if entry["active"] else "-"
        tasks = entry["tasks"]
        report_status = entry["report_status"] or "none"
        postmortem_status = entry["postmortem_status"] or "none"
        print(
            f"{marker} {entry['session']} "
            f"tasks={tasks['done']}/{tasks['total']} remaining={tasks['remaining']} blocked={tasks['blocked']} "
            f"report={report_status} postmortem={postmortem_status} "
            f"catchup={'yes' if entry['catchup_signal'] else 'no'} stale={'yes' if entry['stale_signal'] else 'no'}"
        )


def cmd_list(args: argparse.Namespace) -> int:
    active_session = _read_active_session()
    sessions = [
        _build_session_overview(session_dir, active_session)
        for session_dir in _iter_project_sessions()
    ]
    payload = {
        "scope": str(WB_DIR.resolve()),
        "active_session": active_session or None,
        "count": len(sessions),
        "sessions": sessions,
    }

    if args.json:
        _emit_json(payload, getattr(args, "pretty", False))
        return 0

    _print_session_list(payload)
    return 0


def _classify_for_sweep(entry: Dict[str, Any]) -> str:
    if entry["stale_signal"]:
        return "stale"
    if entry["close_candidate"]:
        return "close_candidate"
    return "open"


def _print_session_sweep(payload: Dict[str, Any]) -> None:
    print(
        "sweep: "
        f"scanned={payload['count']} active={payload['active_session'] or 'unset'} scope={payload['scope']}"
    )
    _print_items("stale", payload["stale"])
    _print_items("open", payload["open"])
    _print_items("close_candidates", payload["close_candidates"])


def cmd_sweep(args: argparse.Namespace) -> int:
    _ = args
    active_session = _read_active_session()
    sessions = [
        _build_session_overview(session_dir, active_session)
        for session_dir in _iter_project_sessions()
    ]

    stale: list[str] = []
    open_sessions: list[str] = []
    close_candidates: list[str] = []
    for entry in sessions:
        item = entry["session"]
        if entry["active"]:
            item = f"{item} [active]"
        if entry["stale_reasons"]:
            item = f"{item} ({'; '.join(entry['stale_reasons'])})"

        bucket = _classify_for_sweep(entry)
        if bucket == "stale":
            stale.append(item)
        elif bucket == "close_candidate":
            close_candidates.append(item)
        else:
            open_sessions.append(item)

    payload = {
        "scope": str(WB_DIR.resolve()),
        "active_session": active_session or None,
        "count": len(sessions),
        "read_only": True,
        "stale": stale,
        "open": open_sessions,
        "close_candidates": close_candidates,
        "sessions": sessions,
    }

    if args.json:
        _emit_json(payload, getattr(args, "pretty", False))
        return 0

    _print_session_sweep(payload)
    return 0


def _print_catchup(payload: Dict[str, object]) -> None:
    print(
        "catchup: "
        f"session={payload['session']} roadmap_feature={payload['roadmap_feature']} "
        f"catchup_required={payload['catchup_required']} context_ready={payload['context_ready']}"
    )
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
        _emit_json(payload, getattr(args, "pretty", False))
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
    p_close.add_argument(
        "--json", action="store_true", help="Emit JSON payload (compact by default)"
    )
    p_close.add_argument(
        "--pretty", action="store_true", help="Pretty-print JSON output (requires --json)"
    )
    p_close.set_defaults(func=cmd_close)

    p_catchup = sub.add_parser(
        "catchup",
        help="Summarize working-tree drift, session artifact freshness, and the next safe resume step",
    )
    p_catchup.add_argument("--session", help="Session id/path (default: active session)")
    p_catchup.add_argument(
        "--json", action="store_true", help="Emit JSON payload (compact by default)"
    )
    p_catchup.add_argument(
        "--pretty", action="store_true", help="Pretty-print JSON output (requires --json)"
    )
    p_catchup.add_argument(
        "--paths-limit", type=int, default=10, help="Limit listed git paths in output"
    )
    p_catchup.set_defaults(func=cmd_catchup)

    p_list = sub.add_parser(
        "list",
        help="List project-local workbench sessions under .agents/wb with lightweight lifecycle signals",
    )
    p_list.add_argument(
        "--json", action="store_true", help="Emit JSON payload (compact by default)"
    )
    p_list.add_argument(
        "--pretty", action="store_true", help="Pretty-print JSON output (requires --json)"
    )
    p_list.set_defaults(func=cmd_list)

    p_sweep = sub.add_parser(
        "sweep",
        help="Read-only sweep of project-local workbench sessions (stale/open/close-candidate)",
    )
    p_sweep.add_argument(
        "--json", action="store_true", help="Emit JSON payload (compact by default)"
    )
    p_sweep.add_argument(
        "--pretty", action="store_true", help="Pretty-print JSON output (requires --json)"
    )
    p_sweep.set_defaults(func=cmd_sweep)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    if getattr(args, "pretty", False) and not getattr(args, "json", False):
        print("--pretty requires --json")
        return 2
    try:
        return args.func(args)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
