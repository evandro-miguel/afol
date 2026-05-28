#!/usr/bin/env python3
"""Local state index and event log for compact project queries."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Tuple

from lib.agents_config import get_cfg_path, load_agents_config, now_iso_with_offset
from lib.cli_output import to_json_text
from lib.execution_commands import parse_state_summary
from lib.markdown_docs import parse_markdown_doc

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
RULES_DIR = AGENTS_DIR / "rules"
SKILLS_DIR = AGENTS_DIR / "skills"
SPECS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "specs_dir")

DATA_DIR = AGENTS_DIR / "data"
EVENTS_DIR = DATA_DIR / "events"
EVENTS_FILE = EVENTS_DIR / "events.jsonl"
INDEX_DIR = DATA_DIR / "index"
INDEX_MANIFEST = INDEX_DIR / "manifest.json"

EVENT_VERSION = 1
INDEX_VERSION = 1

CATEGORY_ORDER = ["workbench", "rules", "skills", "specs", "files"]

IGNORED_PATH_PREFIXES = {
    ".git/",
    ".agents/.venv/",
    ".agents/scripts/.venv/",
    ".agents/scripts/__pycache__/",
    ".agents/scripts/.ruff_cache/",
    ".agents/runtime/.venv/",
    ".agents/tools/",
    ".agents/data/events/",
    ".agents/data/index/",
    ".agents/wb/archive/",
    "src/project-template/.agents/scripts/.venv/",
    "src/project-template/.agents/scripts/__pycache__/",
}


def now_iso() -> str:
    return now_iso_with_offset("Z")


def normalize_timestamp(value: str) -> str:
    text = str(value).strip()
    if not text:
        raise ValueError("timestamp must be a non-empty string")

    candidate = text
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"

    parsed = datetime.fromisoformat(candidate)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def derive_event_id(event: Dict[str, Any]) -> str:
    payload = {k: v for k, v in event.items() if k != "id"}
    return hashlib.sha256(stable_json(payload).encode("utf-8")).hexdigest()[:24]


def normalize_event(raw: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("event must be a JSON object")

    missing = [key for key in ("version", "timestamp", "type", "source") if key not in raw]
    if missing:
        raise ValueError(f"missing required fields: {', '.join(missing)}")

    version = raw.get("version")
    if not isinstance(version, int) or version < 1:
        raise ValueError("version must be a positive integer")

    event_type = str(raw.get("type", "")).strip()
    source = str(raw.get("source", "")).strip()
    if not event_type:
        raise ValueError("type must be a non-empty string")
    if not source:
        raise ValueError("source must be a non-empty string")

    payload = raw.get("payload", {})
    metadata = raw.get("metadata", {})
    if payload is None:
        payload = {}
    if metadata is None:
        metadata = {}
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    if not isinstance(metadata, dict):
        raise ValueError("metadata must be an object")

    event: Dict[str, Any] = {
        "version": version,
        "timestamp": normalize_timestamp(str(raw.get("timestamp"))),
        "type": event_type,
        "source": source,
        "payload": payload,
        "metadata": metadata,
    }

    event_id = raw.get("id")
    if event_id is not None:
        event_id = str(event_id).strip()
    if not event_id:
        event_id = derive_event_id(event)
    event["id"] = event_id

    return event


def append_event(event: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_event(event)
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    with EVENTS_FILE.open("a", encoding="utf-8") as handle:
        handle.write(stable_json(normalized) + "\n")
    return normalized


def record_event(event_type: str, source: str, payload: Dict[str, Any] | None = None, metadata: Dict[str, Any] | None = None) -> Dict[str, Any]:
    event = {
        "version": EVENT_VERSION,
        "timestamp": now_iso(),
        "type": event_type,
        "source": source,
        "payload": payload or {},
        "metadata": metadata or {},
    }
    return append_event(event)


def load_events(path: Path = EVENTS_FILE) -> Dict[str, Any]:
    if not path.exists():
        return {"events": [], "total_lines": 0, "invalid_lines": 0, "invalid_samples": []}

    events: List[Dict[str, Any]] = []
    invalid_lines = 0
    invalid_samples: List[Dict[str, Any]] = []

    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        try:
            parsed = json.loads(line)
            event = normalize_event(parsed)
            event["_line"] = line_no
            events.append(event)
        except (json.JSONDecodeError, ValueError) as exc:
            invalid_lines += 1
            if len(invalid_samples) < 5:
                invalid_samples.append({"line": line_no, "error": str(exc)})

    return {
        "events": events,
        "total_lines": len(path.read_text(encoding="utf-8").splitlines()),
        "invalid_lines": invalid_lines,
        "invalid_samples": invalid_samples,
    }


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR.resolve()))
    except ValueError:
        return str(path)


def should_skip(relative_path: str) -> bool:
    for prefix in IGNORED_PATH_PREFIXES:
        if relative_path == prefix.rstrip("/") or relative_path.startswith(prefix):
            return True
    return False


def iter_repo_files() -> Iterable[Path]:
    for path in ROOT_DIR.rglob("*"):
        if not path.is_file():
            continue
        relative = rel(path)
        if should_skip(relative):
            continue
        yield path


def source_signature(paths: Iterable[Path]) -> Dict[str, Any]:
    ordered: List[Tuple[str, int, int]] = []
    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        stat = path.stat()
        ordered.append((rel(path), stat.st_mtime_ns, stat.st_size))

    ordered.sort(key=lambda item: item[0])

    digest = hashlib.sha256()
    for path_label, mtime_ns, size in ordered:
        digest.update(f"{path_label}|{mtime_ns}|{size}\n".encode("utf-8"))

    return {
        "count": len(ordered),
        "hash": digest.hexdigest(),
        "paths": [item[0] for item in ordered],
    }


def collect_workbench() -> Tuple[List[Dict[str, Any]], List[Path]]:
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []

    if not WB_DIR.exists():
        return records, sources

    for session in sorted(WB_DIR.iterdir()):
        if not session.is_dir() or session.name == "archive":
            continue

        task_files = sorted(session.glob("*_task_*.md"))
        if not task_files:
            continue
        task_file = task_files[0]
        total, done, remaining, blocked, rows = parse_state_summary(task_file)
        in_progress = sum(1 for row in rows if row.state == "in_progress")
        state = "done" if total and done == total else "in_progress" if in_progress else "pending"

        records.append(
            {
                "session": session.name,
                "state": state,
                "tasks_total": total,
                "tasks_done": done,
                "tasks_remaining": remaining,
                "tasks_blocked": len(blocked),
                "task_file": rel(task_file),
            }
        )

        sources.extend(path for path in session.rglob("*.md") if path.is_file())
        evidence = session / ".evidence.jsonl"
        if evidence.exists():
            sources.append(evidence)

    return records, sources


def collect_markdown_frontmatter(base_dir: Path, glob_pattern: str, *, label_key: str) -> Tuple[List[Dict[str, Any]], List[Path]]:
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []

    if not base_dir.exists():
        return records, sources

    for path in sorted(base_dir.glob(glob_pattern)):
        if not path.is_file():
            continue
        if path.name.startswith("TEMPLATE_") or path.name == "INDEX.md":
            continue
        parsed = parse_markdown_doc(path)
        if not parsed:
            continue

        fm, _, _ = parsed
        record = {
            "id": str(fm.get("id", path.stem)),
            "status": str(fm.get("status", "")),
            label_key: str(fm.get(label_key, fm.get("theme", ""))),
            "path": rel(path),
        }
        if "roadmap_feature" in fm:
            record["roadmap_feature"] = str(fm.get("roadmap_feature", ""))
        records.append(record)
        sources.append(path)

    return records, sources


def collect_rules() -> Tuple[List[Dict[str, Any]], List[Path]]:
    return collect_markdown_frontmatter(RULES_DIR, "*.md", label_key="title")


def collect_skills() -> Tuple[List[Dict[str, Any]], List[Path]]:
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []

    if not SKILLS_DIR.exists():
        return records, sources

    for skill_file in sorted(SKILLS_DIR.rglob("SKILL.md")):
        parsed = parse_markdown_doc(skill_file)
        if not parsed:
            continue
        fm, _, _ = parsed
        records.append(
            {
                "id": str(fm.get("name", skill_file.parent.name)),
                "status": str(fm.get("status", "active")),
                "description": str(fm.get("description", ""))[:140],
                "path": rel(skill_file),
            }
        )
        sources.append(skill_file)

    return records, sources


def collect_specs() -> Tuple[List[Dict[str, Any]], List[Path]]:
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []

    if not SPECS_DIR.exists():
        return records, sources

    for spec_file in sorted(SPECS_DIR.rglob("*.md")):
        if spec_file.name.startswith("TEMPLATE_") or spec_file.name == "INDEX.md":
            continue
        parsed = parse_markdown_doc(spec_file)
        if not parsed:
            continue
        fm, _, _ = parsed
        records.append(
            {
                "id": str(fm.get("id", spec_file.stem)),
                "status": str(fm.get("status", "")),
                "theme": str(fm.get("theme", "")),
                "roadmap_feature": str(fm.get("roadmap_feature", "")),
                "path": rel(spec_file),
            }
        )
        sources.append(spec_file)

    return records, sources


def collect_files() -> Tuple[List[Dict[str, Any]], List[Path]]:
    records: List[Dict[str, Any]] = []
    sources: List[Path] = []

    for path in sorted(iter_repo_files(), key=lambda item: rel(item)):
        stat = path.stat()
        relative = rel(path)
        records.append(
            {
                "path": relative,
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
                "kind": "agents" if relative.startswith(".agents/") else "docs" if relative.startswith("docs/") else "project",
            }
        )
        sources.append(path)

    return records, sources


CATEGORY_BUILDERS: Dict[str, Callable[[], Tuple[List[Dict[str, Any]], List[Path]]]] = {
    "workbench": collect_workbench,
    "rules": collect_rules,
    "skills": collect_skills,
    "specs": collect_specs,
    "files": collect_files,
}


def read_index(category: str) -> Dict[str, Any] | None:
    target = INDEX_DIR / f"{category}.json"
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def event_cursor() -> Dict[str, Any]:
    loaded = load_events(EVENTS_FILE)
    events = loaded["events"]
    return {
        "path": rel(EVENTS_FILE),
        "line_count": loaded["total_lines"],
        "invalid_lines": loaded["invalid_lines"],
        "last_event_id": events[-1]["id"] if events else None,
    }


def rebuild(categories: List[str]) -> Dict[str, Any]:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    cursor = event_cursor()
    rebuilt: Dict[str, Dict[str, Any]] = {}

    for category in categories:
        builder = CATEGORY_BUILDERS[category]
        records, sources = builder()
        signature = source_signature(sources)
        payload = {
            "version": INDEX_VERSION,
            "category": category,
            "generated_at": now_iso(),
            "record_count": len(records),
            "source_count": signature["count"],
            "source_hash": signature["hash"],
            "event_cursor": cursor,
            "records": records,
        }
        (INDEX_DIR / f"{category}.json").write_text(stable_json(payload) + "\n", encoding="utf-8")
        rebuilt[category] = {
            "record_count": len(records),
            "source_count": signature["count"],
            "source_hash": signature["hash"],
        }

    manifest = {
        "version": INDEX_VERSION,
        "generated_at": now_iso(),
        "categories": categories,
        "event_cursor": cursor,
        "summary": rebuilt,
    }
    INDEX_MANIFEST.write_text(stable_json(manifest) + "\n", encoding="utf-8")

    return manifest


def compute_freshness(category: str) -> Dict[str, Any]:
    existing = read_index(category)
    if not existing:
        return {
            "category": category,
            "fresh": False,
            "stale": True,
            "reasons": ["missing_index"],
        }

    records, sources = CATEGORY_BUILDERS[category]()
    _ = records
    live_sig = source_signature(sources)
    live_cursor = event_cursor()

    reasons: List[str] = []
    if live_sig["hash"] != str(existing.get("source_hash", "")):
        reasons.append("source_changed")

    existing_cursor = existing.get("event_cursor", {}) if isinstance(existing.get("event_cursor"), dict) else {}
    if int(live_cursor.get("line_count", 0)) > int(existing_cursor.get("line_count", 0)):
        reasons.append("new_events_not_indexed")

    return {
        "category": category,
        "fresh": not reasons,
        "stale": bool(reasons),
        "reasons": reasons,
        "record_count": int(existing.get("record_count", 0)),
        "generated_at": existing.get("generated_at"),
        "live_source_count": live_sig["count"],
        "live_event_line_count": live_cursor["line_count"],
    }


def compact_record_text(record: Dict[str, Any]) -> str:
    parts: List[str] = []
    for key in ("id", "session", "state", "status", "theme", "title", "path", "kind"):
        value = record.get(key)
        if value:
            parts.append(str(value))
    return " ".join(parts).lower()


def query_index(category: str, term: str | None = None, status: str | None = None, limit: int = 20) -> Dict[str, Any]:
    existing = read_index(category)
    if not existing:
        return {"category": category, "total": 0, "results": [], "note": "index missing; run rebuild"}

    records = existing.get("records", [])
    if not isinstance(records, list):
        return {"category": category, "total": 0, "results": [], "note": "invalid index payload"}

    filtered: List[Dict[str, Any]] = []
    term_l = term.lower() if term else None
    status_l = status.lower() if status else None

    for raw in records:
        if not isinstance(raw, dict):
            continue
        if term_l and term_l not in compact_record_text(raw):
            continue
        if status_l:
            raw_status = str(raw.get("status", raw.get("state", ""))).lower()
            if raw_status != status_l:
                continue
        filtered.append(raw)

    return {
        "category": category,
        "total": len(filtered),
        "results": filtered[: max(limit, 1)],
        "generated_at": existing.get("generated_at"),
    }


def replay_since_index(category: str, limit: int = 100) -> Dict[str, Any]:
    existing = read_index(category)
    if not existing:
        return {"category": category, "events": [], "total": 0, "note": "index missing; run rebuild"}

    cursor = existing.get("event_cursor", {}) if isinstance(existing.get("event_cursor"), dict) else {}
    from_line = int(cursor.get("line_count", 0)) + 1

    loaded = load_events(EVENTS_FILE)
    events = [event for event in loaded["events"] if int(event.get("_line", 0)) >= from_line]

    return {
        "category": category,
        "from_line": from_line,
        "total": len(events),
        "invalid_lines": loaded["invalid_lines"],
        "events": events[: max(limit, 1)],
    }


def parse_json_arg(raw: str | None) -> Dict[str, Any]:
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("JSON argument must be an object")
    return parsed


def category_list(value: str | None) -> List[str]:
    if not value:
        return list(CATEGORY_ORDER)
    items = [item.strip() for item in value.split(",") if item.strip()]
    if not items:
        return list(CATEGORY_ORDER)

    unknown = [item for item in items if item not in CATEGORY_BUILDERS]
    if unknown:
        raise ValueError(f"unknown categories: {', '.join(unknown)}")
    return items


def print_result(payload: Dict[str, Any], output_format: str, pretty: bool) -> None:
    if output_format == "json":
        print(to_json_text(payload, pretty=pretty, sort_keys=False))
        return

    if "results" in payload:
        print(f"category={payload['category']} total={payload.get('total', 0)}")
        for item in payload.get("results", []):
            bits = []
            for key in ("session", "id", "state", "status", "theme", "path"):
                if key in item and item[key]:
                    bits.append(f"{key}={item[key]}")
            print("- " + " | ".join(bits))
        return

    if "summary" in payload:
        print(f"rebuilt categories: {', '.join(payload.get('categories', []))}")
        for category, info in payload.get("summary", {}).items():
            print(f"- {category}: records={info['record_count']} sources={info['source_count']}")
        return

    if "events" in payload:
        print(f"category={payload.get('category')} events={payload.get('total', 0)}")
        if payload.get("invalid_lines", 0):
            print(f"invalid_lines={payload['invalid_lines']}")
        for event in payload.get("events", []):
            print(f"- line={event.get('_line')} type={event.get('type')} source={event.get('source')} id={event.get('id')}")
        return

    if "fresh" in payload:
        status = "fresh" if payload.get("fresh") else "stale"
        reasons = ",".join(payload.get("reasons", [])) or "none"
        print(f"category={payload.get('category')} status={status} reasons={reasons}")
        return

    print(to_json_text(payload, pretty=pretty, sort_keys=False))


def cmd_record(args: argparse.Namespace) -> int:
    try:
        payload = parse_json_arg(args.payload)
        metadata = parse_json_arg(args.metadata)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 2

    event = record_event(args.type, args.source, payload=payload, metadata=metadata)
    print_result({"recorded": event}, args.format, args.pretty)
    return 0


def cmd_rebuild(args: argparse.Namespace) -> int:
    try:
        categories = category_list(args.categories)
    except ValueError as exc:
        print(f"Error: {exc}")
        return 2

    manifest = rebuild(categories)
    print_result(manifest, args.format, args.pretty)
    return 0


def cmd_query(args: argparse.Namespace) -> int:
    payload = query_index(args.category, term=args.term, status=args.status, limit=args.limit)
    print_result(payload, args.format, args.pretty)
    return 0


def cmd_freshness(args: argparse.Namespace) -> int:
    payload = compute_freshness(args.category)
    print_result(payload, args.format, args.pretty)
    return 0 if payload.get("fresh") else 3


def cmd_replay(args: argparse.Namespace) -> int:
    payload = replay_since_index(args.category, limit=args.limit)
    print_result(payload, args.format, args.pretty)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local state index and event log")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--pretty", action="store_true", help="pretty JSON output (requires --format json)")

    sub = parser.add_subparsers(dest="command", required=True)

    p_record = sub.add_parser("record", help="append one local-state event")
    p_record.add_argument("type", help="event type")
    p_record.add_argument("--source", default="cli", help="event source label")
    p_record.add_argument("--payload", help="JSON object payload")
    p_record.add_argument("--metadata", help="JSON object metadata")
    p_record.set_defaults(func=cmd_record)

    p_rebuild = sub.add_parser("rebuild", help="rebuild local indexes")
    p_rebuild.add_argument("--categories", help="comma list: workbench,rules,skills,specs,files")
    p_rebuild.set_defaults(func=cmd_rebuild)

    p_query = sub.add_parser("query", help="query compact local index")
    p_query.add_argument("category", choices=CATEGORY_ORDER)
    p_query.add_argument("--term", help="text filter")
    p_query.add_argument("--status", help="status/state filter")
    p_query.add_argument("--limit", type=int, default=20)
    p_query.set_defaults(func=cmd_query)

    p_freshness = sub.add_parser("freshness", help="validate index freshness")
    p_freshness.add_argument("category", choices=CATEGORY_ORDER)
    p_freshness.set_defaults(func=cmd_freshness)

    p_replay = sub.add_parser("replay", help="show events appended after last rebuild")
    p_replay.add_argument("category", choices=CATEGORY_ORDER)
    p_replay.add_argument("--limit", type=int, default=50)
    p_replay.set_defaults(func=cmd_replay)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.pretty and args.format != "json":
        print("Error: --pretty requires --format json")
        return 2

    try:
        return int(args.func(args))
    except (json.JSONDecodeError, ValueError) as exc:
        print(f"Error: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
