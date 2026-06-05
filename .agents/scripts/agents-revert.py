#!/usr/bin/env python3
"""Logical revert helpers for context-driven execution."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Optional

from lib.agents_config import load_agents_config, now_iso_with_offset
from lib.execution_commands import (
    ExecutionError,
    append_timeline_entry,
    find_session,
    find_task_by_id,
    parse_task_rows,
    split_frontmatter,
    update_task_state,
    update_task_states_from,
    write_frontmatter,
)

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)


def _resolve_session_path(session: Optional[str]) -> Path:
    return find_session(session)


def _resolve_task_file(session_dir: Path) -> tuple[Path, list]:
    task_files = sorted(session_dir.glob("*_task_*.md"))
    if not task_files:
        raise ExecutionError("No task artifact found")
    task_file = task_files[-1]
    rows = parse_task_rows(task_file)
    return task_file, rows


def _require_confirm(args: argparse.Namespace, summary: str) -> bool:
    if getattr(args, "confirm", False):
        return True
    print(summary)
    print("Re-run with --confirm to apply changes.")
    return False


def cmd_task(args: argparse.Namespace) -> int:
    session_dir = _resolve_session_path(args.session)
    task_file, rows = _resolve_task_file(session_dir)
    row = find_task_by_id(rows, args.task_id)
    if not row:
        raise ExecutionError(f"Task {args.task_id} not found")

    affected = [row.task_id]
    if args.to_state == "pending":
        ids = [r.task_id for r in rows]
        affected = ids[ids.index(args.task_id) :]

    if not _require_confirm(
        args,
        f"Task revert summary: session={session_dir.name} target={row.task_id} to_state={args.to_state} affected={affected}",
    ):
        return 0

    if args.to_state == "pending":
        update_task_states_from(task_file, row.task_id, "pending")
    elif args.to_state == "in_progress":
        update_task_state(task_file, row.task_id, "in_progress")
    elif args.to_state == "blocked":
        update_task_state(task_file, row.task_id, "blocked")
    else:
        update_task_state(task_file, row.task_id, "pending")

    log_files = sorted(session_dir.glob("*_log_*.md"))
    if log_files:
        append_timeline_entry(log_files[-1], f"revert task {row.task_id} -> {args.to_state}")

    print(f"✓ reverted {row.task_id} to {args.to_state}")
    return 0


def cmd_session(args: argparse.Namespace) -> int:
    session_dir = _resolve_session_path(args.session)
    task_file, rows = _resolve_task_file(session_dir)
    if not _require_confirm(
        args,
        f"Session revert summary: session={session_dir.name} tasks_reset={[row.task_id for row in rows]} report_status=active",
    ):
        return 0

    for row in rows:
        update_task_state(task_file, row.task_id, "pending")

    # remove ready/final report status only
    report_files = sorted(session_dir.glob("*_report_*.md"))
    if report_files:
        fm, body = split_frontmatter(report_files[-1].read_text(encoding="utf-8"))
        fm["status"] = "active"
        fm["updated_at"] = now_iso_with_offset(CONFIG.get("time", {}).get("wb_offset", "-03:00"))
        write_frontmatter(report_files[-1], fm, body)

    log_files = sorted(session_dir.glob("*_log_*.md"))
    if log_files:
        append_timeline_entry(log_files[-1], "revert session -> all tasks reset to pending")
    print(f"✓ reverted session {session_dir.name} governance state")
    return 0


def cmd_pack(args: argparse.Namespace) -> int:
    session_dir = _resolve_session_path(args.session)
    if not args.pack:
        raise ExecutionError("--pack is required")

    candidates = sorted((session_dir / "packs").glob("*"))
    matching = [p for p in candidates if p.name == args.pack and p.is_dir()]
    if not matching:
        raise ExecutionError(f"Pack not found: {args.pack}")

    pack_dir = matching[0]
    changed = [str(p.relative_to(ROOT_DIR)) for p in pack_dir.rglob("*") if p.is_file()]
    if not args.confirm:
        print(f"Pack revert requires --confirm. Files in scope: {changed[:20]}")
        return 0

    if changed:
        result = subprocess.run(
            ["git", "restore", *changed], cwd=ROOT_DIR, check=False, capture_output=True, text=True
        )
        if result.returncode != 0:
            raise ExecutionError(
                result.stderr.strip() or f"git restore failed for pack {args.pack}"
            )
    print(f"✓ pack revert executed for {args.pack}")
    return 0


def cmd_phase(args: argparse.Namespace) -> int:
    # Phase is logical; map to a task anchor when possible.
    session_dir = _resolve_session_path(args.session)
    task_file, rows = _resolve_task_file(session_dir)
    if not rows:
        raise ExecutionError("No task rows to revert")

    phase_seed = args.phase
    anchor = None
    for row in rows:
        if row.task_id == phase_seed or row.notes.lower().startswith(f"phase:{phase_seed.lower()}"):
            anchor = row.task_id
            break

    if anchor is None:
        raise ExecutionError("phase not resolvable from task board")

    ids = [r.task_id for r in rows]
    affected = ids[ids.index(anchor) :]
    if not _require_confirm(
        args,
        f"Phase revert summary: session={session_dir.name} phase={args.phase} affected={affected}",
    ):
        return 0

    update_task_states_from(task_file, anchor, "pending")

    log_files = sorted(session_dir.glob("*_log_*.md"))
    if log_files:
        append_timeline_entry(log_files[-1], f"revert phase {args.phase}")
    print(f"✓ reverted phase {args.phase}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Logical revert against plan/task structures")
    sub = p.add_subparsers(dest="scope", required=True)

    p_task = sub.add_parser("task", help="Revert by task id")
    p_task.add_argument("--session")
    p_task.add_argument("--task-id", required=True, help="Task id to revert")
    p_task.add_argument(
        "--to-state", choices=["pending", "in_progress", "blocked"], default="pending"
    )
    p_task.add_argument(
        "--confirm", action="store_true", help="Apply the revert after showing explicit intent"
    )
    p_task.set_defaults(func=cmd_task)

    p_phase = sub.add_parser("phase", help="Revert from a phase marker")
    p_phase.add_argument("--session")
    p_phase.add_argument("--phase", required=True)
    p_phase.add_argument(
        "--confirm", action="store_true", help="Apply the revert after showing explicit intent"
    )
    p_phase.set_defaults(func=cmd_phase)

    p_pack = sub.add_parser("pack", help="Revert a pack workspace")
    p_pack.add_argument("--session")
    p_pack.add_argument("--pack", required=True)
    p_pack.add_argument("--confirm", action="store_true")
    p_pack.set_defaults(func=cmd_pack)

    p_session = sub.add_parser("session", help="Reset session execution state")
    p_session.add_argument("--session")
    p_session.add_argument(
        "--confirm", action="store_true", help="Apply the revert after showing explicit intent"
    )
    p_session.set_defaults(func=cmd_session)

    return p


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except Exception as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
