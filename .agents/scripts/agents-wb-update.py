#!/usr/bin/env python3
"""
Agents WB Update - automate low-value workbench updates.

Commands:
  touch          Update updated_at in frontmatter
  normalize-time Normalize frontmatter timestamps to configured WB offset
  files-changed  Refresh "## Files Changed" in report file(s)
  evidence       Register execution evidence in session ledger
  task           Mark task checklist/state by task ID
  status         Set frontmatter status in one or more docs
  timeline       Append entry to log timeline
  link           Set frontmatter links.<key> value
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

try:
    import yaml
except ImportError as exc:
    print(f"❌ Missing dependency: {exc}")
    sys.exit(1)

from lib.agents_config import (
    get_active_session_file_path,
    get_cfg_path,
    load_agents_config,
    parse_offset,
)

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
ACTIVE_SESSION_FILE = get_active_session_file_path(ROOT_DIR, CONFIG)
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WB_TZ = parse_offset(WB_OFFSET)

DOC_ALIAS_TO_GLOB = {
    "plan": "*_plan_*.md",
    "task": "*_task_*.md",
    "spec-lite": "*_spec-lite_*.md",
    "report": "*_report_*.md",
    "log": "*_log_*.md",
}

TASK_ACTIONS = {
    "mark-done": ("x", "done"),
    "mark-in-progress": ("/", "in_progress"),
    "mark-pending": (" ", "pending"),
    "mark-ready": ("%", "ready_for_test"),
    "mark-blocked": ("!", "blocked"),
    "mark-skipped": (">", "skipped"),
}
TIMESTAMP_FIELDS = ("created_at", "updated_at")
TASK_ID_RE = re.compile(r"^T-\d{2,3}$")
EVIDENCE_TAG_RE = re.compile(r"\s+\(evidence:\s*([^)]+)\)\s*$", re.IGNORECASE)


def now_iso_gmt3() -> str:
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{WB_OFFSET}")


def now_timeline_label() -> str:
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%d %H:%M{WB_OFFSET[:3]}")


def parse_iso_timestamp(value: str) -> datetime:
    # Support both "...Z" and explicit offsets.
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = f"{candidate[:-1]}+00:00"
    return datetime.fromisoformat(candidate)


def to_iso_gmt3(value: str) -> str:
    dt = parse_iso_timestamp(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=WB_TZ)
    dt = dt.astimezone(WB_TZ)
    return dt.strftime(f"%Y-%m-%dT%H:%M:%S{WB_OFFSET}")


def get_active_session_id() -> str | None:
    if not ACTIVE_SESSION_FILE.exists():
        return None
    value = ACTIVE_SESSION_FILE.read_text().strip()
    if not value:
        return None
    if not (WB_DIR / value).exists():
        return None
    return value


def resolve_session(session: str | None) -> Path:
    if session:
        p = Path(session)
        if not p.is_absolute():
            p = (ROOT_DIR / p).resolve() if "/" in session else (WB_DIR / session).resolve()
        if p.exists() and p.is_dir():
            return p
        raise FileNotFoundError(f"Session folder not found: {session}")

    active = get_active_session_id()
    if not active:
        raise FileNotFoundError("No active session found in .agents/wb/.active_session")
    return (WB_DIR / active).resolve()


def require_explicit_session(args: argparse.Namespace, command: str) -> None:
    """
    Enforce explicit scope for write operations.

    Allowed no-session exceptions:
    - touch/normalize-time with --file or --all-wb
    - files-changed with --report
    """
    if getattr(args, "session", None):
        return

    if command in {"touch", "normalize-time"} and (
        getattr(args, "file", None) or getattr(args, "all_wb", False)
    ):
        return

    if command == "files-changed" and getattr(args, "report", None):
        return

    raise ValueError(
        f"Command '{command}' requires --session for write safety. "
        "Use explicit --session <id/path> (or --file/--all-wb/--report where supported)."
    )


def split_frontmatter(content: str) -> tuple[dict, str] | None:
    if not content.startswith("---\n"):
        return None
    parts = content.split("---", 2)
    if len(parts) < 3:
        return None
    data = yaml.safe_load(parts[1].strip())
    if not isinstance(data, dict):
        return None
    body = parts[2].lstrip("\n")
    return data, body


def write_frontmatter(path: Path, fm: dict, body: str):
    dumped = yaml.safe_dump(fm, sort_keys=False, allow_unicode=False).strip()
    path.write_text(f"---\n{dumped}\n---\n\n{body.rstrip()}\n")


def doc_files(session_dir: Path, alias: str) -> List[Path]:
    if alias == "all":
        return sorted(session_dir.glob("*.md"))
    pattern = DOC_ALIAS_TO_GLOB.get(alias)
    if not pattern:
        raise ValueError(f"Unknown doc alias: {alias}")
    return sorted(session_dir.glob(pattern))


def latest_doc_file(session_dir: Path, alias: str) -> Path:
    files = doc_files(session_dir, alias)
    if not files:
        raise FileNotFoundError(f"No {alias} file found in {session_dir}")
    return files[-1]


def touch_file(path: Path, timestamp: str) -> bool:
    content = path.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        return False
    fm, body = parsed
    fm["updated_at"] = timestamp
    write_frontmatter(path, fm, body)
    return True


def touch_targets(paths: Iterable[Path]) -> int:
    ts = now_iso_gmt3()
    updated = 0
    for p in paths:
        if p.is_file() and p.suffix == ".md":
            updated += 1 if touch_file(p, ts) else 0
    return updated


def normalize_timestamps(path: Path, fields: Iterable[str] = TIMESTAMP_FIELDS) -> bool:
    content = path.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        return False
    fm, body = parsed
    changed = False
    for field in fields:
        raw = fm.get(field)
        if not isinstance(raw, str) or not raw.strip():
            continue
        normalized = to_iso_gmt3(raw)
        if normalized != raw:
            fm[field] = normalized
            changed = True
    if changed:
        write_frontmatter(path, fm, body)
    return changed


def git_changed_files() -> List[str]:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    changed: List[str] = []
    for raw in result.stdout.splitlines():
        if not raw.strip():
            continue
        line = raw[3:] if len(raw) >= 4 else raw
        if " -> " in line:
            line = line.split(" -> ", 1)[1]
        changed.append(line.strip())
    seen = set()
    unique = []
    for p in changed:
        if p in seen:
            continue
        seen.add(p)
        unique.append(p)
    return unique


def replace_section(content: str, section_title: str, lines_to_insert: List[str]) -> str:
    lines = content.splitlines()
    start = None
    end = None
    header = f"## {section_title}"

    for i, line in enumerate(lines):
        if line.strip() == header:
            start = i
            break
    if start is None:
        raise ValueError(f"Section '{header}' not found")

    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break

    new_block = [header, ""] + lines_to_insert
    merged = lines[:start] + new_block + lines[end:]
    return "\n".join(merged).rstrip() + "\n"


def update_files_changed(report_file: Path, include_wb: bool):
    changed = git_changed_files()
    if not include_wb:
        changed = [p for p in changed if not p.startswith(".agents/wb/")]
    changed = sorted(changed)

    content = report_file.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        raise ValueError(f"No valid frontmatter in {report_file}")
    fm, body = parsed
    fm["updated_at"] = now_iso_gmt3()
    items = [f"- `{p}`" for p in changed] if changed else ["- None"]
    body = replace_section(body, "Files Changed", items)
    write_frontmatter(report_file, fm, body)
    return len(changed)


def set_status(paths: Iterable[Path], status: str) -> int:
    count = 0
    for path in paths:
        content = path.read_text()
        parsed = split_frontmatter(content)
        if not parsed:
            continue
        fm, body = parsed
        fm["status"] = status
        fm["updated_at"] = now_iso_gmt3()
        write_frontmatter(path, fm, body)
        count += 1
    return count


def update_link(path: Path, key: str, value: str):
    content = path.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        raise ValueError(f"No valid frontmatter in {path}")
    fm, body = parsed
    links = fm.get("links")
    if not isinstance(links, dict):
        links = {}
    links[key] = value
    fm["links"] = links
    fm["updated_at"] = now_iso_gmt3()
    write_frontmatter(path, fm, body)


def update_task_markers(
    task_file: Path,
    task_id: str,
    marker: str,
    state: str,
    evidence_id: str | None = None,
) -> bool:
    content = task_file.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        raise ValueError(f"No valid frontmatter in {task_file}")
    fm, body = parsed
    lines = body.splitlines()
    found = False

    checklist_re = re.compile(r'^(\s*-\s\[[ /%!>x]\]\s+)(T-\d{2,3})(\s+.+)$')

    for i, line in enumerate(lines):
        # Legacy format: - [x] T-01 description
        m = checklist_re.match(line)
        if m and m.group(2) == task_id:
            prefix = re.sub(r"\[[ /%!>x]\]", f"[{marker}]", m.group(1), count=1)
            description = EVIDENCE_TAG_RE.sub("", m.group(3)).rstrip()
            if marker == "x" and evidence_id:
                description = f"{description} (evidence: {evidence_id})"
            lines[i] = f"{prefix}{m.group(2)}{description}"
            found = True

        # State Board format: | T-01 | state | owner | notes |
        # New format has 4 columns: Task | State | Owner | Notes
        if line.strip().startswith("|"):
            parts = [p.strip() for p in line.split("|")]
            # Filter empty strings from split (first and last are empty due to leading/trailing |)
            cells = [p for p in parts if p or parts.index(p) != 0]
            if len(cells) >= 2:
                row_task = cells[0].strip()
                if row_task == task_id:
                    # Update state (column 2, index 1)
                    cells[1] = state
                    # Reconstruct the row with proper formatting
                    lines[i] = f"| {cells[0]} | {cells[1]} | {cells[2] if len(cells) > 2 else ''} | {cells[3] if len(cells) > 3 else ''} |"
                    found = True

    if not found:
        raise ValueError(f"Task ID {task_id} not found in {task_file.name}")

    fm["updated_at"] = now_iso_gmt3()
    write_frontmatter(task_file, fm, "\n".join(lines))
    return True


def _session_ledger_file(session_dir: Path) -> Path:
    return session_dir / ".evidence.jsonl"


def _new_evidence_id() -> str:
    return datetime.now(WB_TZ).strftime("E-%Y%m%d%H%M%S%f")


def _load_evidence_records(session_dir: Path) -> list[dict]:
    ledger = _session_ledger_file(session_dir)
    if not ledger.exists():
        return []

    records: list[dict] = []
    for raw_line in ledger.read_text().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return records


def append_evidence_record(
    session_dir: Path,
    task_id: str,
    command: str,
    result: str,
    artifacts: list[str] | None = None,
    note: str | None = None,
) -> dict:
    if not TASK_ID_RE.match(task_id):
        raise ValueError(f"Invalid task id '{task_id}'. Expected format like T-01 or T-001")

    ledger = _session_ledger_file(session_dir)
    evidence_id = _new_evidence_id()
    payload = {
        "id": evidence_id,
        "task_id": task_id,
        "created_at": now_iso_gmt3(),
        "command": command.strip(),
        "result": result.strip(),
        "artifacts": [a.strip() for a in (artifacts or []) if a and a.strip()],
        "note": (note or "").strip(),
        "source": "wb-update evidence",
    }
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=True) + "\n")
    return payload


def validate_evidence_reference(session_dir: Path, evidence_id: str, task_id: str) -> None:
    records = _load_evidence_records(session_dir)
    for record in records:
        if record.get("id") != evidence_id:
            continue
        if record.get("task_id") != task_id:
            raise ValueError(
                f"Evidence '{evidence_id}' belongs to task '{record.get('task_id')}', not '{task_id}'"
            )
        return

    raise ValueError(
        f"Evidence '{evidence_id}' not found in {_session_ledger_file(session_dir).relative_to(ROOT_DIR)}"
    )


def append_timeline(log_file: Path, message: str):
    content = log_file.read_text()
    parsed = split_frontmatter(content)
    if not parsed:
        raise ValueError(f"No valid frontmatter in {log_file}")
    fm, body = parsed
    lines = body.splitlines()

    start = None
    end = None
    for i, line in enumerate(lines):
        if line.strip() == "## Timeline":
            start = i
            break
    if start is None:
        raise ValueError("Section '## Timeline' not found")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break

    entry = f"- {now_timeline_label()} - {message}"
    lines.insert(end, entry)

    fm["updated_at"] = now_iso_gmt3()
    write_frontmatter(log_file, fm, "\n".join(lines))


def cmd_touch(args: argparse.Namespace):
    require_explicit_session(args, "touch")
    if args.file:
        count = touch_targets([Path(args.file).resolve()])
        print(f"✓ updated_at touched in {count} file(s)")
        return
    if args.all_wb:
        files = sorted(WB_DIR.rglob("*.md"))
        count = touch_targets(files)
        print(f"✓ updated_at touched in {count} file(s) under .agents/wb")
        return

    session_dir = resolve_session(args.session)
    files = sorted(session_dir.glob("*.md"))
    count = touch_targets(files)
    print(f"✓ updated_at touched in {count} file(s) under {session_dir.relative_to(ROOT_DIR)}")


def cmd_normalize_time(args: argparse.Namespace):
    require_explicit_session(args, "normalize-time")
    if args.file:
        targets = [Path(args.file).resolve()]
    elif args.all_wb:
        targets = sorted(WB_DIR.rglob("*.md"))
    else:
        session_dir = resolve_session(args.session)
        targets = sorted(session_dir.glob("*.md"))

    changed = 0
    for path in targets:
        if path.is_file() and path.suffix == ".md":
            changed += 1 if normalize_timestamps(path) else 0

    if args.file:
        scope = "single file"
    elif args.all_wb:
        scope = ".agents/wb"
    else:
        scope = str(resolve_session(args.session).relative_to(ROOT_DIR))
    print(f"✓ normalized timestamps in {changed} file(s) under {scope}")


def cmd_files_changed(args: argparse.Namespace):
    require_explicit_session(args, "files-changed")
    if args.report:
        report_file = Path(args.report).resolve()
    else:
        session_dir = resolve_session(args.session)
        report_file = latest_doc_file(session_dir, "report")

    count = update_files_changed(report_file, include_wb=args.include_wb)
    print(f"✓ Files Changed updated in {report_file.relative_to(ROOT_DIR)} ({count} entries)")


def cmd_status(args: argparse.Namespace):
    require_explicit_session(args, "status")
    session_dir = resolve_session(args.session)
    paths = doc_files(session_dir, args.file)
    count = set_status(paths, args.value)
    print(f"✓ status='{args.value}' set in {count} file(s)")


def cmd_link(args: argparse.Namespace):
    require_explicit_session(args, "link")
    session_dir = resolve_session(args.session)
    target = latest_doc_file(session_dir, args.file)
    update_link(target, args.key, args.value)
    print(f"✓ link '{args.key}' updated in {target.relative_to(ROOT_DIR)}")


def cmd_timeline(args: argparse.Namespace):
    require_explicit_session(args, "timeline")
    session_dir = resolve_session(args.session)
    log_file = latest_doc_file(session_dir, "log")
    append_timeline(log_file, args.message)
    print(f"✓ timeline appended in {log_file.relative_to(ROOT_DIR)}")


def cmd_task(args: argparse.Namespace):
    require_explicit_session(args, "task")
    session_dir = resolve_session(args.session)
    task_file = latest_doc_file(session_dir, "task")

    action = None
    for key in TASK_ACTIONS:
        if getattr(args, key.replace("-", "_")):
            action = key
            break
    if not action:
        raise ValueError("No task action provided")

    if action == "mark-done":
        if not args.evidence_id and not args.allow_unsafe_done:
            raise ValueError(
                "mark-done requires --evidence-id. Register evidence first via "
                "'wb-update evidence <TASK_ID> ...' or use --allow-unsafe-done (not recommended)."
            )
        if args.evidence_id:
            validate_evidence_reference(session_dir, args.evidence_id, args.task_id)
        if args.allow_unsafe_done and not args.evidence_id:
            print(
                "⚠️  mark-done executed without evidence id (unsafe bypass enabled).",
                file=sys.stderr,
            )

    marker, state = TASK_ACTIONS[action]
    update_task_markers(task_file, args.task_id, marker, state, evidence_id=args.evidence_id)
    print(f"✓ {args.task_id} updated to {state} in {task_file.relative_to(ROOT_DIR)}")


def cmd_evidence(args: argparse.Namespace):
    require_explicit_session(args, "evidence")
    session_dir = resolve_session(args.session)
    record = append_evidence_record(
        session_dir=session_dir,
        task_id=args.task_id,
        command=args.command,
        result=args.result,
        artifacts=args.artifact,
        note=args.note,
    )
    ledger = _session_ledger_file(session_dir).relative_to(ROOT_DIR)
    print(
        f"✓ evidence recorded: {record['id']} for {record['task_id']} "
        f"in {ledger}"
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Automate workbench metadata updates")
    sub = p.add_subparsers(dest="command", required=True)

    p_touch = sub.add_parser("touch", help="update updated_at in frontmatter")
    p_touch.add_argument("--session", help="session id/path (required for session-scoped writes)")
    p_touch.add_argument("--file", help="single file to touch")
    p_touch.add_argument("--all-wb", action="store_true", help="touch all markdown files under .agents/wb")
    p_touch.set_defaults(func=cmd_touch)

    p_norm = sub.add_parser("normalize-time", help="normalize created_at/updated_at to configured WB offset")
    p_norm.add_argument("--session", help="session id/path (required for session-scoped writes)")
    p_norm.add_argument("--file", help="single file to normalize")
    p_norm.add_argument("--all-wb", action="store_true", help="normalize all markdown files under .agents/wb")
    p_norm.set_defaults(func=cmd_normalize_time)

    p_changed = sub.add_parser("files-changed", help="refresh report 'Files Changed' from git status")
    p_changed.add_argument("--session", help="session id/path (required for session-scoped writes)")
    p_changed.add_argument("--report", help="explicit report file")
    p_changed.add_argument("--include-wb", action="store_true", help="include .agents/wb paths in output")
    p_changed.set_defaults(func=cmd_files_changed)

    p_task = sub.add_parser("task", help="update task marker/state by task id")
    p_task.add_argument("task_id", help="Task ID (e.g., T-01 or T-001)")
    p_task.add_argument("--session", help="session id/path (required)")
    p_task.add_argument(
        "--evidence-id",
        help="evidence ID from 'wb-update evidence' (required for --mark-done unless bypassed)",
    )
    p_task.add_argument(
        "--allow-unsafe-done",
        action="store_true",
        help="allow --mark-done without evidence-id (prints warning and is audit-risky)",
    )
    action_group = p_task.add_mutually_exclusive_group(required=True)
    action_group.add_argument("--mark-done", action="store_true")
    action_group.add_argument("--mark-in-progress", action="store_true")
    action_group.add_argument("--mark-pending", action="store_true")
    action_group.add_argument("--mark-ready", action="store_true")
    action_group.add_argument("--mark-blocked", action="store_true")
    action_group.add_argument("--mark-skipped", action="store_true")
    p_task.set_defaults(func=cmd_task)

    p_evidence = sub.add_parser("evidence", help="register evidence for a task in session ledger")
    p_evidence.add_argument("task_id", help="Task ID (e.g., T-01 or T-001)")
    p_evidence.add_argument("--session", help="session id/path (required)")
    p_evidence.add_argument("--command", required=True, help="command or action that produced evidence")
    p_evidence.add_argument("--result", required=True, help="execution result summary")
    p_evidence.add_argument("--artifact", action="append", default=[], help="artifact path/reference (repeatable)")
    p_evidence.add_argument("--note", help="optional note")
    p_evidence.set_defaults(func=cmd_evidence)

    p_status = sub.add_parser("status", help="set frontmatter status in session docs")
    p_status.add_argument("--session", help="session id/path (required)")
    p_status.add_argument("--file", choices=["plan", "task", "spec-lite", "report", "log", "all"], default="all")
    p_status.add_argument("--value", required=True, help="new status value")
    p_status.set_defaults(func=cmd_status)

    p_timeline = sub.add_parser("timeline", help="append timeline entry in log")
    p_timeline.add_argument("--session", help="session id/path (required)")
    p_timeline.add_argument("--message", required=True, help="timeline message")
    p_timeline.set_defaults(func=cmd_timeline)

    p_link = sub.add_parser("link", help="set frontmatter links.<key> for a doc")
    p_link.add_argument("--session", help="session id/path (required)")
    p_link.add_argument("--file", choices=["plan", "task", "spec-lite", "report", "log"], required=True)
    p_link.add_argument("--key", required=True, help="links key")
    p_link.add_argument("--value", required=True, help="links value")
    p_link.set_defaults(func=cmd_link)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(f"❌ {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
