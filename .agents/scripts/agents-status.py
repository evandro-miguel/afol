#!/usr/bin/env python3
"""Context-driven status command."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List

from lib.agents_config import load_agents_config, now_iso_with_offset
from lib.cli_output import to_json_text
from lib.execution_commands import (
    ExecutionError,
    context_readiness,
    find_session,
    next_task,
    next_workflow_artifact,
    parse_state_summary,
    resolve_artifact,
    split_frontmatter,
    workflow_artifact_states,
)

_, CONFIG = load_agents_config(Path(__file__).resolve().parent)
WB_TZ = CONFIG.get("time", {}).get("wb_offset", "-03:00")


DOCS_TO_DISPLAY = [
    "plan",
    "task",
    "spec",
    "report",
    "log",
    "roadmap",
    "architecture",
    "workflow",
    "product",
    "guidelines",
    "tech-stack",
    "current-state-map",
    "knowledge",
]


def _ready_state_to_status(ready_state: str) -> str:
    normalized = str(ready_state or "").strip().lower()
    if normalized == "complete":
        return "DONE"
    if normalized == "blocked":
        return "BLOCKED"
    return "PARTIAL"


def _build_compact_handoff(
    *,
    session_name: str,
    ready_state: str,
    tasks: Dict[str, object],
    artifacts: Dict[str, str],
    blocked_tasks: List[str],
    workflow_next: str | None,
) -> Dict[str, object]:
    next_task = str(tasks.get("next") or "").strip()
    task_value = next_task.split(" ", 1)[0] if next_task else "none"
    files_written = [f"{alias}: {path}" for alias, path in artifacts.items() if alias in {"task", "plan", "report", "log"} and path]
    summary = (
        f"session={session_name} ready_state={ready_state} tasks={tasks.get('done', 0)}/{tasks.get('total', 0)}"
    )
    return {
        "STATUS": _ready_state_to_status(ready_state),
        "TASK": task_value,
        "FILES_WRITTEN": files_written or ["none"],
        "VALIDATION_OR_CHECKS": [f"ready_state={ready_state}", f"workflow_next={workflow_next or 'none'}"],
        "SUMMARY": [summary],
        "BLOCKERS": blocked_tasks or ["none"],
        "NEXT": [workflow_next or "none"],
    }


def print_status(data: Dict[str, object]) -> None:
    compact = data.get("compact_handoff", {})
    if not isinstance(compact, dict) or not compact:
        compact = _build_compact_handoff(
            session_name=str(data.get("session", "")),
            ready_state=str(data.get("ready_state", "idle")),
            tasks=data.get("tasks", {}) if isinstance(data.get("tasks"), dict) else {},
            artifacts=data.get("artifacts", {}) if isinstance(data.get("artifacts"), dict) else {},
            blocked_tasks=data.get("blocked_tasks", []) if isinstance(data.get("blocked_tasks"), list) else [],
            workflow_next=data.get("workflow_next") if isinstance(data.get("workflow_next"), str) else None,
        )
    if isinstance(compact, dict) and compact:
        print(f"STATUS: {compact.get('STATUS', 'PARTIAL')}")
        print(f"TASK: {compact.get('TASK', 'none')}")
        print("FILES_WRITTEN:")
        for line in compact.get("FILES_WRITTEN", []):
            print(f"- {line}")
        print("VALIDATION_OR_CHECKS:")
        for line in compact.get("VALIDATION_OR_CHECKS", []):
            print(f"- {line}")
        print("SUMMARY:")
        for line in compact.get("SUMMARY", []):
            print(f"- {line}")
        print("BLOCKERS:")
        for line in compact.get("BLOCKERS", []):
            print(f"- {line}")
        print("NEXT:")
        for line in compact.get("NEXT", []):
            print(f"- {line}")

    print(f"session: {data['session']}")
    print(f"ready_state: {data['ready_state']} context_ready={data['context_ready']} roadmap_feature={data['roadmap_feature']}")

    _print_missing_context(data["missing_context"])

    tasks = data["tasks"]
    print(f"tasks: {tasks['done']}/{tasks['total']} done, {tasks['remaining']} remaining")
    if tasks['next']:
        print(f"next_task: {tasks['next']}")
    if data["ready_state"] != "complete" and data["workflow_next"]:
        print(f"next_artifact: {data['workflow_next']}")
    _print_blocked_tasks(data["blocked_tasks"])

    _print_workflow_artifacts(data["workflow_artifacts"])
    _print_artifacts(data["artifacts"])


def _print_missing_context(missing_context) -> None:
    if missing_context:
        print(f"missing_context ({len(missing_context)}):")
        for item in missing_context:
            print(f" - {item}")


def _print_blocked_tasks(blocked_tasks) -> None:
    if blocked_tasks:
        print(f"blocked_tasks ({len(blocked_tasks)}):")
        for line in blocked_tasks:
            print(f" - {line}")


def _print_workflow_artifacts(workflow_artifacts) -> None:
    if workflow_artifacts:
        artifacts = list(workflow_artifacts)
        blocked_count = sum(1 for item in artifacts if item["state"] == "blocked")
        invalid_count = sum(1 for item in artifacts if item["state"] == "invalid")
        print(
            "workflow_artifacts: "
            f"total={len(artifacts)} blocked={blocked_count} invalid={invalid_count}"
        )
        for item in artifacts:
            if item["state"] == "done":
                continue
            status = item["status"] or "n/a"
            blockers = f" blockers={'; '.join(item['blockers'])}" if item["blockers"] else ""
            utility = item.get("utility", {})
            utility_notes = ""
            if item["state"] == "invalid" and utility.get("reasons"):
                utility_notes = f" reasons={'; '.join(utility['reasons'])}"
            print(f" - {item['doc_type']}: {item['state']} (status={status}){blockers}{utility_notes}")


def _print_artifacts(artifacts) -> None:
    present_artifacts = [name for name, path in artifacts.items() if path]
    print(
        "artifacts: "
        f"present={len(present_artifacts)} missing={len(artifacts) - len(present_artifacts)}"
    )
    for alias in ("task", "plan", "report", "log", "spec"):
        path = artifacts.get(alias, "")
        if path:
            print(f" - {alias}: {path}")


def summarize_session(session_path: Path, check_context: bool = False) -> Dict[str, object]:
    artifacts: Dict[str, str] = {}
    for alias in DOCS_TO_DISPLAY:
        resolved = resolve_artifact(session_path, alias)
        if resolved:
            artifacts[alias] = str(resolved)

    task = resolve_artifact(session_path, "task")

    total, done, remaining, blocked_rows, rows = parse_state_summary(task)
    manifest_states = workflow_artifact_states(session_path)
    optional_open_blockers = [
        item
        for item in manifest_states
        if item.get("doc_type") in {"brainstorm", "research", "explorer-check", "postmortem"}
        and item.get("exists")
        and str(item.get("status") or "").strip().lower() != "final"
    ]

    ready_state = "blocked" if optional_open_blockers else "idle"
    if ready_state != "blocked":
        if task and total and done == total:
            ready_state = "complete"
        elif total:
            ready_state = "ready"

    roadmap_feature = ""
    if task and task.exists():
        frontmatter, _ = split_frontmatter(task.read_text(encoding="utf-8"))
        roadmap_feature = str(frontmatter.get("roadmap_feature", ""))

    context_ready, missing_context = context_readiness(session_path)
    if not check_context:
        missing_context = []
    next_artifact = next_workflow_artifact(manifest_states)

    workflow_next = None if ready_state == "complete" else _format_next_artifact(next_artifact)

    return {
        "session": session_path.name,
        "artifacts": artifacts,
        "tasks": {
            "total": total,
            "done": done,
            "remaining": remaining,
            "next": _format_next_task(rows),
        },
        "blocked_tasks": blocked_rows,
        "ready_state": ready_state,
        "roadmap_feature": roadmap_feature,
        "generated_at": now_iso_with_offset(WB_TZ),
        "context_ready": context_ready,
        "missing_context": missing_context,
        "workflow_artifacts": manifest_states,
        "workflow_next": workflow_next,
        "compact_handoff": _build_compact_handoff(
            session_name=session_path.name,
            ready_state=ready_state,
            tasks={
                "total": total,
                "done": done,
                "remaining": remaining,
                "next": _format_next_task(rows),
            },
            artifacts=artifacts,
            blocked_tasks=blocked_rows,
            workflow_next=workflow_next,
        ),
    }


def _format_next_task(rows):
    next_row = next_task(rows)
    if not next_row:
        return None
    if next_row.state == "in_progress":
        return f"{next_row.task_id} currently in progress ({next_row.owner}): {next_row.notes}"
    return f"{next_row.task_id} {next_row.state} ({next_row.owner}): {next_row.notes}"


def _format_next_artifact(item):
    if not item:
        return None
    if item["blockers"]:
        return f"{item['doc_type']} {item['state']}: {'; '.join(item['blockers'])}"
    if item.get("utility", {}).get("reasons") and item["state"] == "invalid":
        return f"{item['doc_type']} invalid: {'; '.join(item['utility']['reasons'])}"
    return f"{item['doc_type']} {item['state']}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Show workstream status from canonical .agents artifacts")
    parser.add_argument("--session", help="Session id/path (default: active session)")
    parser.add_argument("--json", action="store_true", help="Emit JSON payload (compact by default)")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output (requires --json)")
    parser.add_argument("--artifact", action="append", help="Resolve a logical artifact name")
    parser.add_argument("--check-context", action="store_true", help="Include missing context details")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        session = find_session(args.session)
    except ExecutionError as exc:
        print(str(exc))
        return 1

    if args.artifact:
        lines: List[str] = []
        for name in args.artifact:
            path = resolve_artifact(session, name)
            lines.append(f"{name}: {path if path else 'missing'}")
        print("\n".join(lines))
        return 0

    payload = summarize_session(session, check_context=args.check_context)
    if args.pretty and not args.json:
        print("--pretty requires --json")
        return 2

    if args.json:
        print(to_json_text(payload, pretty=args.pretty, sort_keys=True))
    else:
        print_status(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
