#!/usr/bin/env python3
"""Guided implementation command for governed task execution."""

from __future__ import annotations

import argparse
from pathlib import Path

from lib.execution_commands import (
    ExecutionError,
    append_timeline_entry,
    assert_task_sequence,
    find_session,
    load_feature_operation_governance,
    find_task_by_id,
    next_task,
    normalize_task_state,
    parse_task_rows,
    parse_state_summary,
    append_evidence,
    update_task_state,
    validate_closure_evidence,
)
from lib.agents_config import load_agents_config

_ROOT_DIR, _CONFIG = load_agents_config(Path(__file__).resolve().parent)


def _get_session_tasks(session_dir: Path):
    task = sorted(session_dir.glob("*_task_*.md"))[-1] if list(session_dir.glob("*_task_*.md")) else None
    if not task:
        raise ExecutionError("No task file found for active session")
    rows = parse_task_rows(task)
    _, done, remaining, _, _ = parse_state_summary(task)
    return task, rows, done, remaining


def _ensure_task_board(task_file: Path, rows):
    if not rows:
        raise ExecutionError(f"No tasks found in {task_file}")


def _ensure_prerequisites(rows, target: str) -> None:
    blocking = assert_task_sequence(rows, target)
    if blocking:
        raise ExecutionError(f"Task {target} is blocked by prior tasks: {'; '.join(blocking)}")


def _emit_feature_operation_governance(session_dir: Path) -> None:
    bundle = load_feature_operation_governance(session_dir)
    if not bundle:
        return

    print("Governance preflight:")
    print(f"  feature: {bundle['feature_id']}")
    print(f"  parent_spec: {bundle['parent_spec']} -> {bundle['parent_spec_path']}")
    if bundle.get("child_spec"):
        print(f"  child_spec: {bundle['child_spec']} -> {bundle['child_spec_path']}")
    print(f"  plan: {bundle['plan_path']}")
    print(f"  task: {bundle['task_path']}")
    print(f"  routing: work_type={bundle.get('work_type', 'delivery')} surfaces={','.join(bundle.get('rule_surfaces', []))}")
    route_metadata = bundle.get("route_metadata")
    if isinstance(route_metadata, dict):
        routing = route_metadata.get("routing", {})
        route_surfaces = routing.get("surfaces", [])
        route_rule_ids = routing.get("rule_ids", [])
        print(
            "  delegation_transport: "
            f"payload={route_metadata.get('payload_key', 'rule_skill_context_payload')} "
            f"schema={route_metadata.get('payload_schema_version', 'n/a')} "
            f"work_type={routing.get('work_type', bundle.get('work_type', 'delivery'))} "
            f"surfaces={','.join(route_surfaces) if isinstance(route_surfaces, list) else ''} "
            f"rules={','.join(route_rule_ids) if isinstance(route_rule_ids, list) else ''}"
        )
    for warning in bundle.get("rule_warnings", []):
        print(f"  warning: {warning}")
    print("  rules loaded:")
    for rule in bundle["rules"]:
        print(f"    - {rule['id']} -> {rule['path']}")
    print()


def cmd_next(args: argparse.Namespace) -> int:
    session_dir = find_session(args.session)
    _emit_feature_operation_governance(session_dir)
    task_file, rows, done, remaining = _get_session_tasks(session_dir)
    _ensure_task_board(task_file, rows)
    nxt = next_task(rows)
    if not nxt:
        print(f"session={session_dir.name} status=complete done={done} remaining={remaining}")
        return 0

    print(f"next={nxt.task_id}")
    print(f"state={nxt.state}")
    print(f"owner={nxt.owner}")
    print(f"notes={nxt.notes}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    session_dir = find_session(args.session)
    _emit_feature_operation_governance(session_dir)
    task_file, rows, _, _ = _get_session_tasks(session_dir)
    _ensure_task_board(task_file, rows)

    target = args.task_id
    if not target:
        nxt = next_task(rows)
        if not nxt:
            print("No pending action remains")
            return 0
        target = nxt.task_id

    row = find_task_by_id(rows, target)
    if not row:
        raise ExecutionError(f"Task {target} not found")
    row_state = normalize_task_state(row.state)
    if row_state == "done":
        raise ExecutionError(f"Task {target} is already done")
    if row_state == "in_progress":
        print(f"Task {target} already in progress")
        return 0
    if row_state != "pending":
        raise ExecutionError(f"Task {target} cannot be started from state {row.state}")

    _ensure_prerequisites(rows, target)

    update_task_state(task_file, target, "in_progress")
    log_files = sorted(session_dir.glob("*_log_*.md"))
    if log_files:
        append_timeline_entry(log_files[-1], f"implement start: {target}")
    print(f"✓ started {target} in session {session_dir.name}")
    return 0


def cmd_complete(args: argparse.Namespace) -> int:
    session_dir = find_session(args.session)
    _emit_feature_operation_governance(session_dir)
    task_file, rows, _, _ = _get_session_tasks(session_dir)
    _ensure_task_board(task_file, rows)

    target = args.task_id
    if not target:
        nxt = next_task(rows)
        if not nxt:
            print("No actionable task to complete")
            return 0
        target = nxt.task_id

    row = find_task_by_id(rows, target)
    if not row:
        raise ExecutionError(f"Task {target} not found")
    row_state = normalize_task_state(row.state)
    if row_state == "done":
        raise ExecutionError(f"Task {target} is already done")
    if row_state not in {"in_progress", "implemented_untested", "tested_needs_spec_validation"}:
        raise ExecutionError(
            f"Task {target} cannot be completed from state {row.state}; start it first or move it to a validated intermediate state"
        )

    _ensure_prerequisites(rows, target)

    if getattr(args, "no_evidence", False):
        raise ExecutionError("--no-evidence is no longer supported for task completion")

    command = (args.command or "").strip()
    result = (args.result or "").strip()
    artifacts = args.artifact or []
    validate_closure_evidence(command=command, result=result, artifacts=artifacts, note=args.note)
    evidence_id = append_evidence(session_dir, target, command=command, result=result, artifacts=artifacts, note=args.note)

    update_task_state(task_file, target, "done", evidence_id=evidence_id)

    log_files = sorted(session_dir.glob("*_log_*.md"))
    if log_files:
        append_timeline_entry(log_files[-1], f"implement complete: {target} with evidence {evidence_id}")

    print(f"✓ completed {target} in {session_dir.name}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Guided execution command",
        epilog=(
            "Governed delivery lifecycle: create or target a session with "
            "`./.agents/agents new ...`, run `implement start` before product "
            "edits, verify the product change, then run `implement complete` "
            "with the verification command/result/artifact so evidence and done "
            "state are written together."
        ),
    )
    sub = p.add_subparsers(dest="command", required=True)

    p_next = sub.add_parser("next", help="Show next governed task")
    p_next.add_argument("--session")
    p_next.set_defaults(func=cmd_next)

    p_start = sub.add_parser("start", help="Move a task to in_progress")
    p_start.add_argument("--session")
    p_start.add_argument("--task-id", help="Task id (e.g., T-01). Defaults to next actionable")
    p_start.set_defaults(func=cmd_start)

    p_complete = sub.add_parser("complete", help="Mark task done with evidence")
    p_complete.add_argument("--session")
    p_complete.add_argument("--task-id", help="Task id (e.g., T-01). Defaults to next actionable")
    p_complete.add_argument("--command", help="Command or gate used for closure evidence", required=True)
    p_complete.add_argument("--result", help="Execution result for closure evidence", required=True)
    p_complete.add_argument("--artifact", action="append", help="Evidence artifact")
    p_complete.add_argument("--note", help="Evidence note")
    p_complete.set_defaults(func=cmd_complete)

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
