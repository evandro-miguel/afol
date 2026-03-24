#!/usr/bin/env python3
"""Shared helpers for context-driven execution commands."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("PyYAML is required") from exc

from .agents_config import (
    get_active_session_file_path,
    get_cfg_path,
    load_agents_config,
    now_iso_with_offset,
)

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
ROADMAP_FILE = get_cfg_path(ROOT_DIR, CONFIG, "roadmap_file")
WORKFLOW_DOC = ROOT_DIR / ".agents/a-docs/standards/workflow.md"
ARCHIVE_KNOWLEDGE = ROOT_DIR / ".agents/a-docs/knowledge"
PRODUCT_BRIEF = ROOT_DIR / ".agents/arc/PROJECT-BRIEF.md"
ENGINEERING_GUIDELINES = ROOT_DIR / ".agents/arc/ENGINEERING-GUIDELINES.md"
TECH_STACK = ROOT_DIR / ".agents/arc/TECH-STACK.md"
ARCHITECTURE_DOC = ROOT_DIR / ".agents/arc/ARCHITECTURE.md"
GOAL_STATE_CANON = ROOT_DIR / ".agents/arc/README.md"
CURRENT_STATE_MAP = get_cfg_path(ROOT_DIR, CONFIG, "map_dir") / "README.md"
WB_TZ = CONFIG.get("time", {}).get("wb_offset", "-03:00")

DOC_PATTERNS: dict[str, str] = {
    "plan": "*_plan_*.md",
    "task": "*_task_*.md",
    "spec": "*_spec_*.md",
    "spec-lite": "*_spec-lite_*.md",
    "brainstorm": "*_brainstorm_*.md",
    "research": "*_research_*.md",
    "explorer-check": "*_explorer-check_*.md",
    "report": "*_report_*.md",
    "log": "*_log_*.md",
    "postmortem": "*_postmortem_*.md",
    "pack": "packs/*",
}

SESSION_ARTIFACT_ALIASES: dict[str, str] = {
    "plan": "plan",
    "active_plan": "plan",
    "task": "task",
    "active_task": "task",
    "report": "report",
    "active_report": "report",
    "log": "log",
    "active_log": "log",
}

GLOBAL_ARTIFACT_PATHS: dict[str, Path] = {
    "roadmap": ROADMAP_FILE,
    "workflow": WORKFLOW_DOC,
    "knowledge": ARCHIVE_KNOWLEDGE,
    "product": PRODUCT_BRIEF,
    "guidelines": ENGINEERING_GUIDELINES,
    "tech-stack": TECH_STACK,
    "tech_stack": TECH_STACK,
    "architecture": ARCHITECTURE_DOC,
    "goal-state": GOAL_STATE_CANON,
    "goal_state": GOAL_STATE_CANON,
    "current-state-map": CURRENT_STATE_MAP,
    "current_state_map": CURRENT_STATE_MAP,
    "current-state": CURRENT_STATE_MAP,
    "current_state": CURRENT_STATE_MAP,
}

ALIAS_ARTIFACTS = set(DOC_PATTERNS.keys()) | {
    "session",
    "active_session",
    "active_plan",
    "active_task",
    "active_report",
    "active_log",
    "roadmap",
    "workflow",
    "knowledge",
    "product",
    "guidelines",
    "tech-stack",
    "tech_stack",
    "architecture",
    "goal-state",
    "goal_state",
    "current-state-map",
    "current_state_map",
    "current-state",
    "current_state",
}

TASK_TABLE_RE = re.compile(r"^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]*)\s*\|\s*([^|]*)\s*\|")
TASK_CHECKLIST_RE = re.compile(r"^\s*-\s*\[[ /%!>x]\]\s+(T-\d{2,3})\s+(.+)$")
TASK_ID_RE = re.compile(r"^T-\d{2,3}$")
TASK_ROW_RE = re.compile(r"^(\s*-\s*\[)([ /%!>x])(?:\]\s+)(T-\d{2,3})(\s+.+)$")

TASK_MARKER_TO_STATE = {
    " ": "pending",
    "/": "in_progress",
    "%": "ready_for_test",
    "x": "done",
    "!": "blocked",
    ">": "skipped",
}

STATE_TO_MARKER = {v: k for k, v in TASK_MARKER_TO_STATE.items()}
FORWARD_STATES = {"pending", "ready_for_test", "in_progress", "blocked", "skipped", "done"}
BLOCKING_STATES = {"blocked", "in_progress"}


@dataclass(frozen=True)
class TaskRow:
    task_id: str
    state: str
    owner: str
    notes: str
    line: int
    line_type: str


class ExecutionError(RuntimeError):
    pass


def split_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    raw = parts[1].strip()
    body = parts[2].lstrip("\n")
    parsed = yaml.safe_load(raw) or {}
    if isinstance(parsed, dict):
        return parsed, body
    return {}, body


def parse_iso_timestamp(value: str) -> Optional[datetime]:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        return None


def write_frontmatter(path: Path, fm: Dict[str, Any], body: str) -> None:
    dumped = yaml.safe_dump(fm, sort_keys=False, allow_unicode=False).strip()
    content = f"---\n{dumped}\n---\n\n{body.rstrip()}\n"
    path.write_text(content, encoding="utf-8")


def latest_file(session_dir: Path, alias: str) -> Optional[Path]:
    if alias not in DOC_PATTERNS:
        return None
    files = sorted(session_dir.glob(DOC_PATTERNS[alias]))
    if not files:
        return None
    return files[-1]


def find_session(session: Optional[str]) -> Path:
    if session:
        candidate = Path(session)
        if not candidate.is_absolute():
            candidate = (ROOT_DIR / session).resolve() if "/" in session else (WB_DIR / session).resolve()
        if not candidate.exists() or not candidate.is_dir():
            raise ExecutionError(f"Session not found: {session}")
        return candidate

    active = get_active_session_file_path(ROOT_DIR, CONFIG)
    if active.exists():
        active_id = active.read_text().strip()
        if active_id:
            candidate = (WB_DIR / active_id).resolve()
            if candidate.exists() and candidate.is_dir():
                return candidate
    raise ExecutionError("No active session found. Run .agents/agents new and set an active session.")


def resolve_artifact(session_dir: Path, artifact: str) -> Optional[Path]:
    if artifact in {"session", "active_session"}:
        return session_dir
    if artifact in SESSION_ARTIFACT_ALIASES:
        return latest_file(session_dir, SESSION_ARTIFACT_ALIASES[artifact])
    if artifact in GLOBAL_ARTIFACT_PATHS:
        target = GLOBAL_ARTIFACT_PATHS[artifact]
        return target if target.exists() else None
    if artifact in DOC_PATTERNS:
        return latest_file(session_dir, artifact)
    return None


def resolve_context(session_dir: Path, artifacts: Iterable[str]) -> Dict[str, Optional[Path]]:
    return {name: resolve_artifact(session_dir, name) for name in artifacts}


def relative_to_root(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT_DIR.resolve()))
    except ValueError:
        return str(path)


def artifact_snapshot(path: Optional[Path]) -> Dict[str, Any]:
    if path is None or not path.exists():
        return {
            "exists": False,
            "path": None,
            "id": "",
            "status": "",
            "updated_at": "",
            "mtime": None,
        }

    fm, _ = split_frontmatter(path.read_text(encoding="utf-8"))
    return {
        "exists": True,
        "path": relative_to_root(path),
        "id": str(fm.get("id", "")).strip(),
        "status": str(fm.get("status", "")).strip(),
        "updated_at": str(fm.get("updated_at", "")).strip(),
        "mtime": path.stat().st_mtime,
        "links": fm.get("links", {}) if isinstance(fm.get("links", {}), dict) else {},
        "roadmap_feature": str(fm.get("roadmap_feature", "")).strip(),
    }


def git_status_entries(root_dir: Path = ROOT_DIR) -> Tuple[bool, List[Dict[str, Any]]]:
    proc = subprocess.run(
        ["git", "-C", str(root_dir), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return False, []

    entries: List[Dict[str, Any]] = []
    for raw_line in proc.stdout.splitlines():
        if not raw_line.strip():
            continue
        code = raw_line[:2]
        raw_path = raw_line[3:].strip()
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ", 1)[1].strip()
        path = (root_dir / raw_path).resolve()
        mtime = path.stat().st_mtime if path.exists() else None
        entries.append(
            {
                "code": code,
                "path": raw_path,
                "exists": path.exists(),
                "mtime": mtime,
                "tracked": "?" not in code,
            }
        )
    return True, entries


def _session_artifacts(session_dir: Path) -> Dict[str, Dict[str, Any]]:
    artifact_names = ["plan", "task", "research", "log", "report", "brainstorm", "explorer-check"]
    return {name: artifact_snapshot(resolve_artifact(session_dir, name)) for name in artifact_names}


def _session_roadmap_feature(artifacts: Dict[str, Dict[str, Any]]) -> str:
    for alias in ("task", "plan", "research"):
        feature_id = artifacts[alias].get("roadmap_feature", "")
        if feature_id:
            return str(feature_id)
    return ""


def _split_session_git_changes(session_dir: Path) -> Tuple[bool, List[Dict[str, Any]], List[Dict[str, Any]]]:
    git_available, git_changes = git_status_entries(ROOT_DIR)
    session_prefix = relative_to_root(session_dir).rstrip("/")
    session_changes = [
        entry for entry in git_changes
        if entry["path"] == session_prefix or entry["path"].startswith(f"{session_prefix}/")
    ]
    repo_changes = [entry for entry in git_changes if entry not in session_changes]
    return git_available, session_changes, repo_changes


def _collect_catchup_state(
    artifacts: Dict[str, Dict[str, Any]],
    repo_changes: List[Dict[str, Any]],
    session_changes: List[Dict[str, Any]],
) -> Tuple[List[str], List[str]]:
    warnings: List[str] = []
    stale_artifacts: List[str] = []

    plan_links = artifacts["plan"].get("links", {}) if artifacts["plan"]["exists"] else {}
    expects_research = (
        bool(plan_links.get("research"))
        or artifacts["brainstorm"]["exists"]
        or artifacts["explorer-check"]["exists"]
    )
    if expects_research and not artifacts["research"]["exists"]:
        warnings.append("Plan context exists but no research artifact is present for durable findings capture.")

    latest_repo_mtime = max((entry["mtime"] for entry in repo_changes if entry["mtime"] is not None), default=None)
    if repo_changes and not artifacts["log"]["exists"]:
        warnings.append("Repo has working-tree changes outside the session, but no log artifact exists.")

    if repo_changes and latest_repo_mtime is not None:
        for alias in ("log", "research", "report"):
            info = artifacts[alias]
            if not info["exists"] or info["mtime"] is None:
                continue
            if latest_repo_mtime > float(info["mtime"]) + 60:
                stale_artifacts.append(alias)

    if repo_changes and not session_changes:
        warnings.append("Repo has changes outside the session, but the session artifacts are unchanged in git.")

    if "log" in stale_artifacts:
        warnings.append("Repo changes are newer than the session log; capture progress before continuing.")
    if len(repo_changes) >= 5 and not artifacts["research"]["exists"]:
        warnings.append("Many repo changes are present without a research artifact; findings may be living only in transient context.")
    elif len(repo_changes) >= 5 and "research" in stale_artifacts:
        warnings.append("Repo changes are newer than the research artifact; refresh findings before making new planning decisions.")
    if artifacts["report"]["exists"] and artifacts["report"].get("status", "").lower() == "final" and repo_changes:
        warnings.append("Report is marked final while the working tree still has unrecorded repo changes.")

    return warnings, stale_artifacts


def _catchup_next_step(
    missing_context: List[str],
    stale_artifacts: List[str],
    warnings: List[str],
    repo_changes: List[Dict[str, Any]],
    artifacts: Dict[str, Dict[str, Any]],
    nxt: Optional[TaskRow],
) -> str:
    if missing_context:
        return "Restore missing governed artifacts before resuming implementation."
    if "log" in stale_artifacts:
        return "Repo changes are newer than the session log; capture progress before continuing."
    if len(repo_changes) >= 5 and (not artifacts["research"]["exists"] or "research" in stale_artifacts):
        return "Refresh the research artifact so findings are durable before making new decisions."
    if warnings:
        return warnings[0]
    if nxt is not None and nxt.state == "in_progress":
        return f"Resume {nxt.task_id} and update the session log as you go."
    if nxt is not None:
        return f"Review the plan and start {nxt.task_id}: {nxt.notes}"
    if repo_changes:
        return "Reconcile repo changes into report/log artifacts before closing or handing off the session."
    return "Session appears synchronized; continue with the next planned action."


def build_session_catchup(session_dir: Path, paths_limit: int = 10) -> Dict[str, Any]:
    artifacts = _session_artifacts(session_dir)

    task_file = resolve_artifact(session_dir, "task")
    total, done, remaining, blocked_rows, rows = parse_state_summary(task_file)
    nxt = next_task(rows)
    context_ready, missing_context = context_readiness(session_dir)
    roadmap_feature = _session_roadmap_feature(artifacts)
    git_available, session_changes, repo_changes = _split_session_git_changes(session_dir)
    warnings, stale_artifacts = _collect_catchup_state(artifacts, repo_changes, session_changes)
    catchup_required = bool(missing_context or repo_changes or warnings)
    next_step = _catchup_next_step(missing_context, stale_artifacts, warnings, repo_changes, artifacts, nxt)

    return {
        "session": session_dir.name,
        "roadmap_feature": roadmap_feature,
        "context_ready": context_ready,
        "missing_context": missing_context,
        "artifacts": artifacts,
        "tasks": {
            "total": total,
            "done": done,
            "remaining": remaining,
            "next": None if nxt is None else {
                "task_id": nxt.task_id,
                "state": nxt.state,
                "owner": nxt.owner,
                "notes": nxt.notes,
            },
            "blocked": blocked_rows,
        },
        "git": {
            "available": git_available,
            "changed": len(session_changes) + len(repo_changes),
            "session_changed": len(session_changes),
            "repo_changed": len(repo_changes),
            "repo_paths": [entry["path"] for entry in repo_changes[:paths_limit]],
            "session_paths": [entry["path"] for entry in session_changes[:paths_limit]],
        },
        "stale_artifacts": stale_artifacts,
        "warnings": warnings,
        "catchup_required": catchup_required,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "next_step": next_step,
    }


def parse_task_rows(task_file: Path) -> List[TaskRow]:
    rows: List[TaskRow] = []
    if not task_file.exists():
        return rows

    fm, body = split_frontmatter(task_file.read_text(encoding="utf-8"))
    _ = fm
    lines = body.splitlines()
    for idx, line in enumerate(lines):
        table = TASK_TABLE_RE.match(line.strip())
        if table:
            task_id, state, owner, notes = table.groups()
            rows.append(TaskRow(task_id=task_id.strip(), state=state.strip().lower(), owner=owner.strip(), notes=notes.strip(), line=idx, line_type="table"))
            continue

        checklist = TASK_CHECKLIST_RE.match(line)
        if checklist:
            marker = None
            if "[x]" in line:
                marker = "x"
            elif "[/]" in line:
                marker = "/"
            elif "[ ]" in line:
                marker = " "
            elif "[%]" in line:
                marker = "%"
            elif "[!]" in line:
                marker = "!"
            elif ">" in line[:5]:
                marker = ">"
            state = TASK_MARKER_TO_STATE.get(marker or " ", "pending")
            task_id, text = checklist.groups()
            rows.append(TaskRow(task_id=task_id.strip(), state=state, owner="", notes=text.strip(), line=idx, line_type="checklist"))

    return rows


def parse_state_summary(task_file: Optional[Path]) -> Tuple[int, int, int, List[str], List[TaskRow]]:
    if not task_file:
        return 0, 0, 0, [], []
    rows = parse_task_rows(task_file)
    total = len(rows)
    done = sum(1 for row in rows if row.state == "done")
    blocked = [f"{row.task_id}:{row.state}:{row.owner}:{row.notes}" for row in rows if row.state == "blocked"]
    remaining = total - done
    return total, done, remaining, blocked, rows


def next_task(rows: List[TaskRow]) -> Optional[TaskRow]:
    for row in rows:
        if row.state == "in_progress":
            return row
    for row in rows:
        if row.state in {"pending", "ready_for_test"}:
            return row
    return None


def find_task_by_id(rows: List[TaskRow], task_id: str) -> Optional[TaskRow]:
    for row in rows:
        if row.task_id == task_id:
            return row
    return None


def assert_task_sequence(task_rows: List[TaskRow], target_id: str) -> List[str]:
    ids = [row.task_id for row in task_rows]
    if target_id not in ids:
        return [f"Task {target_id} not found in current task board"]

    target_index = ids.index(target_id)
    blocking: List[str] = []
    for prior in task_rows[:target_index]:
        if prior.state != "done":
            blocking.append(f"{prior.task_id} is {prior.state}")

    return blocking

def update_task_state(task_file: Path, task_id: str, new_state: str) -> bool:
    target = new_state.strip().lower()
    if target not in FORWARD_STATES:
        raise ExecutionError(f"Invalid task state: {new_state}")
    if not TASK_ID_RE.match(task_id):
        raise ExecutionError(f"Invalid task id: {task_id}")

    content = task_file.read_text(encoding="utf-8")
    fm, body = split_frontmatter(content)
    lines = body.splitlines()
    changed = False

    for i, line in enumerate(lines):
        table = TASK_TABLE_RE.match(line.strip())
        if table:
            row_id, _, owner, notes = table.groups()
            if row_id.strip() == task_id:
                owner = owner.strip()
                notes = notes.strip()
                lines[i] = f"| {row_id} | {target} | {owner} | {notes} |"
                changed = True
                continue

        # checklist form
        m = TASK_ROW_RE.match(line)
        if m:
            prefix, marker, row_id, text = m.groups()
            if row_id.strip() == task_id:
                lines[i] = f"{prefix}{STATE_TO_MARKER[target]}] {row_id}{text}"
                changed = True

    if not changed:
        raise ExecutionError(f"Task {task_id} not found in {task_file}")

    fm["updated_at"] = now_iso_with_offset(WB_TZ)
    write_frontmatter(task_file, fm, "\n".join(lines))
    return changed


def update_task_states_from(task_file: Path, start_id: str, new_state: str) -> int:
    rows = parse_task_rows(task_file)
    ids = [r.task_id for r in rows]
    if start_id not in ids:
        raise ExecutionError(f"Task {start_id} not found in {task_file}")

    start = ids.index(start_id)
    updated = 0
    for row in rows[start:]:
        if row.state == new_state:
            continue
        update_task_state(task_file, row.task_id, new_state)
        updated += 1
    return updated


def append_timeline_entry(log_file: Path, message: str) -> bool:
    content = log_file.read_text(encoding="utf-8")
    fm, body = split_frontmatter(content)
    lines = body.splitlines()

    start = None
    for i, line in enumerate(lines):
        if line.strip() == "## Timeline":
            start = i
            break

    if start is None:
        return False

    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break

    lines.insert(end, f"- {datetime.now().strftime('%Y-%m-%d %H:%M')}-{WB_TZ[:3]} - {message}")
    fm["updated_at"] = now_iso_with_offset(WB_TZ)
    write_frontmatter(log_file, fm, "\n".join(lines))
    return True


def evidence_file(session_dir: Path) -> Path:
    return session_dir / ".evidence.jsonl"

def new_evidence_id() -> str:
    return datetime.now().strftime("E-%Y%m%d%H%M%S%f")

def append_evidence(session_dir: Path, task_id: str, command: str, result: str, artifacts: Iterable[str] | None = None, note: str | None = None) -> str:
    if not TASK_ID_RE.match(task_id):
        raise ExecutionError(f"Invalid task id: {task_id}")
    eid = new_evidence_id()
    payload = {
        "id": eid,
        "task_id": task_id,
        "created_at": now_iso_with_offset(WB_TZ),
        "command": command,
        "result": result,
        "artifacts": [a for a in artifacts or [] if a],
        "note": note or "",
    }
    with evidence_file(session_dir).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return eid


def evidence_count(session_dir: Path, task_id: str) -> int:
    path = evidence_file(session_dir)
    if not path.exists():
        return 0
    count = 0
    for raw in path.read_text().splitlines():
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("task_id") == task_id:
            count += 1
    return count


def context_readiness(session_dir: Path) -> Tuple[bool, List[str]]:
    required = ["roadmap", "plan", "task", "report", "log", "workflow", "product", "guidelines", "tech-stack"]
    checks = resolve_context(session_dir, required)
    missing = [name for name, value in checks.items() if value is None]
    return (len(missing) == 0, missing)
