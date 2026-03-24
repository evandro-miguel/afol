#!/usr/bin/env python3
"""Context-driven status command."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

from lib.agents_config import load_agents_config, now_iso_with_offset
from lib.execution_commands import (
    ExecutionError,
    context_readiness,
    find_session,
    next_task,
    parse_state_summary,
    resolve_artifact,
    split_frontmatter,
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


def print_status(data: Dict[str, object]) -> None:
    print("Agents Status")
    print(f"session: {data['session']}")
    print(f"context_ready: {data['context_ready']}")
    if data["missing_context"]:
        print("missing_context:")
        for item in data["missing_context"]:
            print(f" - {item}")
    print(f"roadmap_feature: {data['roadmap_feature']}")

    tasks = data["tasks"]
    print(f"tasks: {tasks['done']}/{tasks['total']} done, {tasks['remaining']} remaining")
    if tasks['next']:
        print(f"next_task: {tasks['next']}")
    if data['blocked_tasks']:
        print("blocked_tasks:")
        for line in data['blocked_tasks']:
            print(f" - {line}")

    print(f"plan: {data['artifacts'].get('plan', '')}")
    print(f"task: {data['artifacts'].get('task', '')}")
    print(f"spec: {data['artifacts'].get('spec', '')}")
    print(f"report: {data['artifacts'].get('report', '')}")
    print(f"log: {data['artifacts'].get('log', '')}")
    print(f"architecture: {data['artifacts'].get('architecture', '')}")
    print(f"product: {data['artifacts'].get('product', '')}")
    print(f"guidelines: {data['artifacts'].get('guidelines', '')}")
    print(f"tech_stack: {data['artifacts'].get('tech-stack', '')}")
    print(f"current_state_map: {data['artifacts'].get('current-state-map', '')}")
    print(f"ready_state: {data['ready_state']}")


def summarize_session(session_path: Path, check_context: bool = False) -> Dict[str, object]:
    artifacts: Dict[str, str] = {}
    for alias in DOCS_TO_DISPLAY:
        resolved = resolve_artifact(session_path, alias)
        if resolved:
            artifacts[alias] = str(resolved)

    task = resolve_artifact(session_path, "task")

    total, done, remaining, blocked_rows, rows = parse_state_summary(task)
    ready_state = "idle"
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
    }


def _format_next_task(rows):
    next_row = next_task(rows)
    if not next_row:
        return None
    if next_row.state == "in_progress":
        return f"{next_row.task_id} currently in progress ({next_row.owner}): {next_row.notes}"
    return f"{next_row.task_id} {next_row.state} ({next_row.owner}): {next_row.notes}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Show workstream status from canonical .agents artifacts")
    parser.add_argument("--session", help="Session id/path (default: active session)")
    parser.add_argument("--json", action="store_true", help="Emit JSON payload")
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
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
