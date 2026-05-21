#!/usr/bin/env python3
"""
Agents WB Update - automate low-value workbench updates.

Commands:
  touch          Update updated_at in frontmatter
  normalize-time Normalize frontmatter timestamps to configured WB offset
  files-changed  Refresh "## Files Changed" in report file(s)
  evidence       Register execution evidence in session ledger
  ensure         Create a missing allowed workbench artifact
  task           Mark task checklist/state by task ID
  status         Set frontmatter status in one or more docs
  timeline       Append entry to log timeline
  link           Set frontmatter links.<key> value
"""

from __future__ import annotations

import argparse
import json
import os
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
from lib.execution_commands import evidence_record_closure_error
from lib.markdown_docs import split_markdown_frontmatter as split_frontmatter
from lib.postmortem_governance import postmortem_governance_review_issues

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
CANONICAL_WB_DIR = AGENTS_DIR / "wb"
ACTIVE_SESSION_FILE = get_active_session_file_path(ROOT_DIR, CONFIG)
TELEMETRY_SCRIPT = Path(__file__).resolve().parent / "agents-telemetry.py"
TEMPLATES_DIR = get_cfg_path(ROOT_DIR, CONFIG, "templates_dir")
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WB_TZ = parse_offset(WB_OFFSET)

DOC_ALIAS_TO_GLOB = {
    "plan": ("*_plan_*.md",),
    "task": ("*_task_*.md",),
    "spec": ("*_spec_*.md",),
    "spec-child": ("*_spec-child_*.md",),
    "spec-lite": ("*_spec-lite_*.md",),
    "spec-test": ("*_spec-test_*.md",),
    "brainstorm": ("*_brainstorm_*.md",),
    "research": ("*_research_*.md",),
    "explorer-check": ("*_explorer-check_*.md",),
    "report": ("*_report_*.md",),
    "log": ("*_log_*.md",),
    "postmortem": ("*_postmortem_*.md",),
}

TASK_ACTIONS = {
    "mark-done": ("x", "done"),
    "mark-in-progress": ("/", "in_progress"),
    "mark-pending": (" ", "pending"),
    "mark-implemented": ("%", "implemented_untested"),
    "mark-tested": ("&", "tested_needs_spec_validation"),
    "mark-problem": ("!", "problem"),
    "mark-moved": (">", "moved"),
}
LEGACY_TASK_ACTION_ALIASES = {
    "mark-ready": "mark-implemented",
    "mark-blocked": "mark-problem",
    "mark-skipped": "mark-moved",
}
TIMESTAMP_FIELDS = ("created_at", "updated_at")
TASK_ID_RE = re.compile(r"^T-\d{2,3}$")
EVIDENCE_TAG_RE = re.compile(r"\s+\(evidence:\s*([^)]+)\)\s*$", re.IGNORECASE)
ENSURABLE_DOC_TYPES = {"report", "log", "research", "brainstorm", "explorer-check"}
SIDECAR_DOC_TYPES = {"research", "brainstorm", "explorer-check"}
SIDECAR_REQUIRED_LABELS = {
    "Blocking question": re.compile(r"^\s*-\s*Blocking question:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    "Decision produced": re.compile(r"^\s*-\s*Decision produced:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    "Execution task affected": re.compile(r"^\s*-\s*Execution task affected:\s*(T-\d{2,3})\s*$", re.IGNORECASE | re.MULTILINE),
    "Stop condition": re.compile(r"^\s*-\s*Stop condition:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
}


def now_iso_gmt3() -> str:
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{WB_OFFSET}")


def now_timeline_label() -> str:
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%d %H:%M{WB_OFFSET[:3]}")


def canonical_wb_label() -> str:
    try:
        return str(CANONICAL_WB_DIR.relative_to(ROOT_DIR))
    except ValueError:
        return str(CANONICAL_WB_DIR)


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


def get_env_session_id() -> str | None:
    value = os.getenv("AGENTS_SESSION_ID", "").strip()
    return value or None


def strict_session_resolution_enabled() -> bool:
    return os.getenv("AGENTS_SESSION_STRICT", "").strip() == "1"


def _resolve_session_path(session: str, *, source: str) -> Path:
    p = Path(session)
    if not p.is_absolute():
        p = (ROOT_DIR / p).resolve() if "/" in session else (WB_DIR / session).resolve()
    if p.exists() and p.is_dir():
        try:
            p.resolve().relative_to(CANONICAL_WB_DIR.resolve())
        except ValueError:
            raise FileNotFoundError(f"Session must be under {canonical_wb_label()} ({source}): {session}")
        protected = {
            item.strip()
            for item in os.getenv("AGENTS_PROTECTED_SESSION_IDS", "").split(",")
            if item.strip()
        }
        if p.name in protected:
            raise FileNotFoundError(
                f"Session is protected/read-only for this run ({source}): {p.name}. "
                "Create or target a different .agents/wb session."
            )
        return p
    raise FileNotFoundError(f"Session folder not found ({source}): {session}")


def resolve_session(session: str | None) -> Path:
    if session:
        return _resolve_session_path(session, source="--session")

    env_session = get_env_session_id()
    if env_session:
        return _resolve_session_path(env_session, source="AGENTS_SESSION_ID")

    if strict_session_resolution_enabled():
        raise FileNotFoundError(
            "Session resolution strict mode is enabled (AGENTS_SESSION_STRICT=1). "
            "Pass --session <id/path> or set AGENTS_SESSION_ID."
        )

    active = get_active_session_id()
    if not active:
        raise FileNotFoundError("No active session found in .agents/wb/.active_session")
    return _resolve_session_path(active, source=".active_session")


def require_explicit_session(args: argparse.Namespace, command: str) -> None:
    """
    Enforce explicit scope for write operations.

    Allowed no-session exceptions:
    - touch/normalize-time with --file or --all-wb
    - files-changed with --report
    """
    if getattr(args, "session", None) or get_env_session_id():
        return

    if command in {"touch", "normalize-time"} and (
        getattr(args, "file", None) or getattr(args, "all_wb", False)
    ):
        return

    if command == "files-changed" and getattr(args, "report", None):
        return

    raise ValueError(
        f"Command '{command}' requires --session for write safety. "
        "Use explicit --session <id/path>, set AGENTS_SESSION_ID, "
        "or use --file/--all-wb/--report where supported."
    )


def write_frontmatter(path: Path, fm: dict, body: str):
    dumped = yaml.safe_dump(fm, sort_keys=False, allow_unicode=False).strip()
    path.write_text(f"---\n{dumped}\n---\n\n{body.rstrip()}\n")


def doc_files(session_dir: Path, alias: str) -> List[Path]:
    if alias == "all":
        return sorted(session_dir.rglob("*.md"))
    patterns = DOC_ALIAS_TO_GLOB.get(alias)
    if not patterns:
        raise ValueError(f"Unknown doc alias: {alias}")
    files: list[Path] = []
    for pattern in patterns:
        files.extend(session_dir.rglob(pattern))
    return sorted(set(files))


def latest_doc_file(session_dir: Path, alias: str) -> Path:
    files = doc_files(session_dir, alias)
    if not files and alias == "spec-child":
        files = doc_files(session_dir, "spec-lite")
    if not files:
        raise FileNotFoundError(f"No {alias} file found in {session_dir}")
    return files[-1]


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT_DIR))
    except ValueError:
        return str(path)


def _report_status(session_dir: Path) -> str:
    try:
        report_file = latest_doc_file(session_dir, "report")
    except FileNotFoundError:
        return ""
    parsed = split_frontmatter(report_file.read_text())
    if not parsed:
        return ""
    fm, _ = parsed
    return str(fm.get("status", "")).strip().lower()


def maybe_record_session_end(session_dir: Path, source: str) -> None:
    """Emit session_end once the session report is marked final."""
    if _report_status(session_dir) != "final":
        return
    if not TELEMETRY_SCRIPT.exists():
        return

    metadata = {"source": source, "report_status": "final"}
    try:
        subprocess.run(
            [
                sys.executable,
                str(TELEMETRY_SCRIPT),
                "record",
                "session_end",
                "--session-id",
                session_dir.name,
                "--metadata",
                json.dumps(metadata),
            ],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except Exception:
        pass


def ensure_optional_artifacts_ready_for_report_final(session_dir: Path) -> None:
    """Block report finalization only when present optional artifacts are not final."""
    open_optional: list[str] = []
    for alias in ("brainstorm", "research", "explorer-check", "postmortem"):
        for doc_path in doc_files(session_dir, alias):
            parsed = split_frontmatter(doc_path.read_text())
            status = ""
            if parsed:
                fm, _ = parsed
                status = str(fm.get("status", "")).strip().lower()
            if status != "final":
                open_optional.append(f"{alias} ({doc_path.name}) status={status or 'missing'}")

    if open_optional:
        raise ValueError(
            "Cannot finalize report while optional artifacts remain open: "
            + "; ".join(open_optional)
        )


def ensure_postmortems_ready_for_final(session_dir: Path) -> None:
    """Require governance-promotion review before a postmortem becomes final."""
    issues: list[str] = []
    for doc_path in doc_files(session_dir, "postmortem"):
        parsed = split_frontmatter(doc_path.read_text())
        if not parsed:
            issues.append(f"{doc_path.name} is missing valid frontmatter")
            continue
        _, body = parsed
        doc_issues = postmortem_governance_review_issues(body)
        if doc_issues:
            issues.append(f"{doc_path.name}: {'; '.join(doc_issues)}")

    if issues:
        raise ValueError("Cannot finalize postmortem without governance review: " + " | ".join(issues))


def _is_placeholder_value(value: str) -> bool:
    stripped = str(value or "").strip()
    return not stripped or stripped.upper() in {"N/A", "NA", "NONE"} or "<" in stripped or ">" in stripped


def _section_body(body: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(body)
    return match.group("body") if match else ""


def validate_sidecar_justification(path: Path) -> None:
    parsed = split_frontmatter(path.read_text())
    if not parsed:
        raise ValueError(f"{path.name} is missing valid frontmatter")
    fm, body = parsed
    doc_type = str(fm.get("doc_type", "")).strip()
    if doc_type not in SIDECAR_DOC_TYPES:
        return

    section = _section_body(body, "Sidecar Justification")
    if not section:
        raise ValueError(f"{path.name} is missing Sidecar Justification")

    missing: list[str] = []
    for label, pattern in SIDECAR_REQUIRED_LABELS.items():
        match = pattern.search(section)
        if not match or _is_placeholder_value(match.group(1)):
            missing.append(label)

    if missing:
        raise ValueError(f"{path.name} has incomplete Sidecar Justification: {', '.join(missing)}")


def ensure_sidecars_ready_for_final(session_dir: Path, aliases: Iterable[str]) -> None:
    issues: list[str] = []
    for alias in aliases:
        if alias not in SIDECAR_DOC_TYPES:
            continue
        for doc_path in doc_files(session_dir, alias):
            try:
                validate_sidecar_justification(doc_path)
            except ValueError as exc:
                issues.append(str(exc))
    if issues:
        raise ValueError("Cannot finalize sidecar without justification: " + " | ".join(issues))


def _theme_from_session(session_dir: Path) -> str:
    parts = session_dir.name.split("_", 2)
    return parts[2] if len(parts) == 3 else session_dir.name


def _doc_id(session_dir: Path, doc_type: str) -> str:
    return f"{session_dir.name}_{doc_type}_01"


def _latest_doc_id(session_dir: Path, alias: str) -> str:
    try:
        path = latest_doc_file(session_dir, alias)
    except FileNotFoundError:
        return ""
    parsed = split_frontmatter(path.read_text())
    if not parsed:
        return path.stem
    fm, _ = parsed
    return str(fm.get("id") or path.stem)


def _session_governance_context(session_dir: Path) -> dict[str, str]:
    context = {
        "roadmap_feature": "",
        "parent_spec": "",
        "child_spec": "",
        "roadmap_path": "docs/arc/GENERAL-ROADMAP.md",
    }
    for alias in ("plan", "task"):
        try:
            doc = latest_doc_file(session_dir, alias)
        except FileNotFoundError:
            continue
        parsed = split_frontmatter(doc.read_text())
        if not parsed:
            continue
        fm, _ = parsed
        context["roadmap_feature"] = context["roadmap_feature"] or str(fm.get("roadmap_feature") or "")
        context["parent_spec"] = context["parent_spec"] or str(fm.get("parent_spec") or "")
        context["child_spec"] = context["child_spec"] or str(fm.get("child_spec") or "")
        links = fm.get("links")
        if isinstance(links, dict):
            context["roadmap_path"] = str(links.get("roadmap") or context["roadmap_path"])
    return context


def _template_replacements(session_dir: Path, doc_type: str) -> dict[str, str]:
    context = _session_governance_context(session_dir)
    replacements = {
        "YYMMDD_HHMM_<theme>": session_dir.name,
        "<theme>": _theme_from_session(session_dir),
        "<feature_id>": context["roadmap_feature"],
        "<parent_spec_id>": context["parent_spec"],
        "<parent_spec_id_or_empty>": context["parent_spec"],
        "<child_spec_id_or_empty>": context["child_spec"],
        "<roadmap_path>": context["roadmap_path"],
        "<workstream_intent>": "delivery",
        "<artifact_purpose>": f"Created by wb-update ensure for {doc_type}.",
        "<task_doc_id>": _latest_doc_id(session_dir, "task"),
        "<plan_doc_id>": _latest_doc_id(session_dir, "plan"),
        "<report_doc_id_or_empty>": _latest_doc_id(session_dir, "report"),
        "<postmortem_doc_id_or_empty>": _latest_doc_id(session_dir, "postmortem"),
        "<brainstorm_doc_id_or_empty>": _latest_doc_id(session_dir, "brainstorm"),
        "<research_doc_id_or_empty>": _latest_doc_id(session_dir, "research"),
        "<explorer_check_doc_id_or_empty>": _latest_doc_id(session_dir, "explorer-check"),
        "<task_doc_id_or_empty>": _latest_doc_id(session_dir, "task"),
        "<optional_task_id>": "",
        "YYYY-MM-DDTHH:MM:SSZ": now_iso_gmt3(),
        "'2026-04-04T10:08:11-03:00'": f"'{now_iso_gmt3()}'",
        "'2026-04-04T10:08:12-03:00'": f"'{now_iso_gmt3()}'",
    }
    replacements[f"<{doc_type.replace('-', '_')}_doc_id_or_empty>"] = _doc_id(session_dir, doc_type)
    return replacements


def _apply_replacements(content: str, replacements: dict[str, str]) -> str:
    rendered = content
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)
    return rendered


def _append_sidecar_justification(
    body: str,
    *,
    task_id: str,
    blocking_question: str,
    decision_produced: str,
    stop_condition: str,
) -> str:
    section = (
        "## Sidecar Justification\n\n"
        f"- Blocking question: {blocking_question}\n"
        f"- Decision produced: {decision_produced}\n"
        f"- Execution task affected: {task_id}\n"
        f"- Stop condition: {stop_condition}\n"
    )
    if _section_body(body, "Sidecar Justification"):
        body = re.sub(
            r"^##\s+Sidecar Justification\s*$\n.*?(?=^##\s+|\Z)",
            section.rstrip() + "\n\n",
            body,
            flags=re.MULTILINE | re.DOTALL,
        )
        return body.rstrip() + "\n"
    return body.rstrip() + "\n\n" + section


def ensure_artifact(
    session_dir: Path,
    doc_type: str,
    *,
    task_id: str | None = None,
    blocking_question: str | None = None,
    decision_produced: str | None = None,
    stop_condition: str | None = None,
) -> Path:
    if doc_type not in ENSURABLE_DOC_TYPES:
        raise ValueError(f"Cannot ensure unsupported artifact type: {doc_type}")
    existing = doc_files(session_dir, doc_type)
    if existing:
        return existing[-1]

    if doc_type in SIDECAR_DOC_TYPES:
        missing = [
            name
            for name, value in (
                ("--task-id", task_id),
                ("--blocking-question", blocking_question),
                ("--decision-produced", decision_produced),
                ("--stop-condition", stop_condition),
            )
            if _is_placeholder_value(value or "")
        ]
        if missing:
            raise ValueError(f"Sidecar artifact '{doc_type}' requires {', '.join(missing)}")
        if not TASK_ID_RE.match(str(task_id)):
            raise ValueError(f"Invalid task id '{task_id}'. Expected format like T-01 or T-001")

    template_path = TEMPLATES_DIR / f"{doc_type}.md"
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    rendered = _apply_replacements(template_path.read_text(), _template_replacements(session_dir, doc_type))
    target = session_dir / f"{_doc_id(session_dir, doc_type)}.md"
    parsed = split_frontmatter(rendered)
    if parsed:
        fm, body = parsed
        fm["id"] = _doc_id(session_dir, doc_type)
        fm["theme"] = _theme_from_session(session_dir)
        fm["status"] = "draft" if doc_type in SIDECAR_DOC_TYPES | {"report"} else "active"
        fm["created_at"] = now_iso_gmt3()
        fm["updated_at"] = now_iso_gmt3()
        if doc_type in SIDECAR_DOC_TYPES:
            body = _append_sidecar_justification(
                body,
                task_id=str(task_id),
                blocking_question=str(blocking_question),
                decision_produced=str(decision_produced),
                stop_condition=str(stop_condition),
            )
        write_frontmatter(target, fm, body)
    else:
        target.write_text(rendered)
    return target


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

    checklist_re = re.compile(r'^(\s*-\s\[[ /%!>&x]\]\s+)(T-\d{2,3})(\s+.+)$')

    for i, line in enumerate(lines):
        # Legacy format: - [x] T-01 description
        m = checklist_re.match(line)
        if m and m.group(2) == task_id:
            prefix = re.sub(r"\[[ /%!>&x]\]", f"[{marker}]", m.group(1), count=1)
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
        closure_error = evidence_record_closure_error(record)
        if closure_error:
            raise ValueError(f"Evidence '{evidence_id}' is not valid closure evidence: {closure_error}")
        return

    raise ValueError(
        f"Evidence '{evidence_id}' not found in {display_path(_session_ledger_file(session_dir))}"
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
    files = sorted(session_dir.rglob("*.md"))
    count = touch_targets(files)
    maybe_record_session_end(session_dir, "wb-update touch")
    print(f"✓ updated_at touched in {count} file(s) under {display_path(session_dir)}")


def cmd_normalize_time(args: argparse.Namespace):
    require_explicit_session(args, "normalize-time")
    if args.file:
        targets = [Path(args.file).resolve()]
    elif args.all_wb:
        targets = sorted(WB_DIR.rglob("*.md"))
    else:
        session_dir = resolve_session(args.session)
        targets = sorted(session_dir.rglob("*.md"))

    changed = 0
    for path in targets:
        if path.is_file() and path.suffix == ".md":
            changed += 1 if normalize_timestamps(path) else 0

    if args.file:
        scope = "single file"
    elif args.all_wb:
        scope = ".agents/wb"
    else:
        scope = display_path(resolve_session(args.session))
    print(f"✓ normalized timestamps in {changed} file(s) under {scope}")


def cmd_files_changed(args: argparse.Namespace):
    require_explicit_session(args, "files-changed")
    if args.report:
        report_file = Path(args.report).resolve()
    else:
        session_dir = resolve_session(args.session)
        report_file = latest_doc_file(session_dir, "report")

    count = update_files_changed(report_file, include_wb=args.include_wb)
    print(f"✓ Files Changed updated in {display_path(report_file)} ({count} entries)")


def cmd_status(args: argparse.Namespace):
    require_explicit_session(args, "status")
    session_dir = resolve_session(args.session)
    finalizing = args.value.strip().lower() == "final"
    target_aliases = set(DOC_ALIAS_TO_GLOB) if args.file == "all" else {args.file}
    if finalizing:
        ensure_sidecars_ready_for_final(session_dir, target_aliases)
    if args.value.strip().lower() == "final" and args.file in {"report", "all"}:
        ensure_optional_artifacts_ready_for_report_final(session_dir)
    if args.value.strip().lower() == "final" and args.file in {"postmortem", "all"}:
        ensure_postmortems_ready_for_final(session_dir)
    paths = doc_files(session_dir, args.file)
    count = set_status(paths, args.value)
    if args.value.strip().lower() == "final" and args.file in {"report", "all"}:
        maybe_record_session_end(session_dir, "wb-update status")
    print(f"✓ status='{args.value}' set in {count} file(s)")


def cmd_link(args: argparse.Namespace):
    require_explicit_session(args, "link")
    session_dir = resolve_session(args.session)
    target = latest_doc_file(session_dir, args.file)
    update_link(target, args.key, args.value)
    print(f"✓ link '{args.key}' updated in {display_path(target)}")


def cmd_timeline(args: argparse.Namespace):
    require_explicit_session(args, "timeline")
    session_dir = resolve_session(args.session)
    log_file = latest_doc_file(session_dir, "log")
    append_timeline(log_file, args.message)
    print(f"✓ timeline appended in {display_path(log_file)}")


def cmd_task(args: argparse.Namespace):
    require_explicit_session(args, "task")
    session_dir = resolve_session(args.session)
    task_file = latest_doc_file(session_dir, "task")

    action = None
    all_actions = tuple(TASK_ACTIONS.keys()) + tuple(LEGACY_TASK_ACTION_ALIASES.keys())
    for key in all_actions:
        if getattr(args, key.replace("-", "_")):
            action = key
            break
    if not action:
        raise ValueError("No task action provided")

    canonical_action = LEGACY_TASK_ACTION_ALIASES.get(action, action)

    if action == "mark-done":
        if not args.evidence_id:
            raise ValueError(
                "mark-done requires --evidence-id. Register evidence first via "
                "'wb-update evidence <TASK_ID> ...'."
            )
        if args.evidence_id:
            validate_evidence_reference(session_dir, args.evidence_id, args.task_id)

    marker, state = TASK_ACTIONS[canonical_action]
    update_task_markers(task_file, args.task_id, marker, state, evidence_id=args.evidence_id)
    print(f"✓ {args.task_id} updated to {state} in {display_path(task_file)}")


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
    ledger = display_path(_session_ledger_file(session_dir))
    print(
        f"✓ evidence recorded: {record['id']} for {record['task_id']} "
        f"in {ledger}"
    )


def cmd_ensure(args: argparse.Namespace):
    require_explicit_session(args, "ensure")
    session_dir = resolve_session(args.session)
    path = ensure_artifact(
        session_dir,
        args.file,
        task_id=args.task_id,
        blocking_question=args.blocking_question,
        decision_produced=args.decision_produced,
        stop_condition=args.stop_condition,
    )
    print(f"✓ ensured {args.file}: {display_path(path)}")


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
        help="evidence ID from 'wb-update evidence' (required for --mark-done)",
    )
    action_group = p_task.add_mutually_exclusive_group(required=True)
    action_group.add_argument("--mark-done", action="store_true")
    action_group.add_argument("--mark-in-progress", action="store_true")
    action_group.add_argument("--mark-pending", action="store_true")
    action_group.add_argument("--mark-implemented", action="store_true")
    action_group.add_argument("--mark-tested", action="store_true")
    action_group.add_argument("--mark-problem", action="store_true")
    action_group.add_argument("--mark-moved", action="store_true")
    action_group.add_argument("--mark-ready", action="store_true", help="legacy alias for --mark-implemented")
    action_group.add_argument("--mark-blocked", action="store_true", help="legacy alias for --mark-problem")
    action_group.add_argument("--mark-skipped", action="store_true", help="legacy alias for --mark-moved")
    p_task.set_defaults(func=cmd_task)

    p_evidence = sub.add_parser("evidence", help="register evidence for a task in session ledger")
    p_evidence.add_argument("task_id", help="Task ID (e.g., T-01 or T-001)")
    p_evidence.add_argument("--session", help="session id/path (required)")
    p_evidence.add_argument("--command", required=True, help="command or action that produced evidence")
    p_evidence.add_argument("--result", required=True, help="execution result summary")
    p_evidence.add_argument("--artifact", action="append", default=[], help="artifact path/reference (repeatable)")
    p_evidence.add_argument("--note", help="optional note")
    p_evidence.set_defaults(func=cmd_evidence)

    p_ensure = sub.add_parser("ensure", help="create a missing allowed workbench artifact")
    p_ensure.add_argument("--session", help="session id/path (required)")
    p_ensure.add_argument("--file", choices=sorted(ENSURABLE_DOC_TYPES), required=True)
    p_ensure.add_argument("--task-id", help="required for sidecar artifacts")
    p_ensure.add_argument("--blocking-question", help="required for sidecar artifacts")
    p_ensure.add_argument("--decision-produced", help="required for sidecar artifacts")
    p_ensure.add_argument("--stop-condition", help="required for sidecar artifacts")
    p_ensure.set_defaults(func=cmd_ensure)

    p_status = sub.add_parser("status", help="set frontmatter status in session docs")
    p_status.add_argument("--session", help="session id/path (required)")
    p_status.add_argument(
        "--file",
        choices=[
            "plan",
            "task",
            "spec",
            "spec-child",
            "spec-lite",
            "spec-test",
            "brainstorm",
            "research",
            "explorer-check",
            "report",
            "log",
            "postmortem",
            "all",
        ],
        default="all",
    )
    p_status.add_argument("--value", required=True, help="new status value")
    p_status.set_defaults(func=cmd_status)

    p_timeline = sub.add_parser("timeline", help="append timeline entry in log")
    p_timeline.add_argument("--session", help="session id/path (required)")
    p_timeline.add_argument("--message", required=True, help="timeline message")
    p_timeline.set_defaults(func=cmd_timeline)

    p_link = sub.add_parser("link", help="set frontmatter links.<key> for a doc")
    p_link.add_argument("--session", help="session id/path (required)")
    p_link.add_argument(
        "--file",
        choices=[
            "plan",
            "task",
            "spec",
            "spec-child",
            "spec-lite",
            "spec-test",
            "brainstorm",
            "research",
            "explorer-check",
            "report",
            "log",
            "postmortem",
        ],
        required=True,
    )
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
