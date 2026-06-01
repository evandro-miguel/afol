#!/usr/bin/env python3
"""Shared helpers for context-driven execution commands."""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("PyYAML is required") from exc

try:
    from .agents_config import (
        get_active_session_file_path,
        get_cfg_path,
        load_agents_config,
        now_iso_with_offset,
    )
    from .artifact_utility import analyze_artifact_utility
    from .markdown_docs import split_markdown_frontmatter
    from .workflow_manifest import load_artifact_manifest, load_artifact_policy
except ImportError:
    from lib.agents_config import (
        get_active_session_file_path,
        get_cfg_path,
        load_agents_config,
        now_iso_with_offset,
    )
    from lib.artifact_utility import analyze_artifact_utility
    from lib.markdown_docs import split_markdown_frontmatter
    from lib.workflow_manifest import load_artifact_manifest, load_artifact_policy

try:
    from .process_utils import run_command
except ImportError:
    try:
        from lib.process_utils import run_command
    except ImportError:
        pass


if "run_command" not in globals():

    def run_command(
        cmd,
        *,
        cwd: Path | None = None,
        timeout: int = 120,
        **kwargs,
    ):
        run_kwargs = dict(kwargs)
        try:
            return subprocess.run(list(cmd), cwd=cwd, timeout=timeout, **run_kwargs)
        except TypeError as exc:
            if "unexpected keyword argument 'timeout'" not in str(exc):
                raise
            return subprocess.run(list(cmd), cwd=cwd, **kwargs)


ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
WORKFLOW_CFG = CONFIG.get("workflow", {})
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
CANONICAL_WB_DIR = AGENTS_DIR / "wb"
ROADMAP_FILE = get_cfg_path(ROOT_DIR, CONFIG, "roadmap_file")
SPECS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "specs_dir")
RULES_DIR = AGENTS_DIR / "rules"
WORKFLOW_DOC = ROOT_DIR / "docs/standards/workflow.md"
ARCHIVE_KNOWLEDGE = ROOT_DIR / "docs/knowledge"
PRODUCT_BRIEF = ROOT_DIR / "docs/arc/PROJECT-BRIEF.md"
ENGINEERING_GUIDELINES = ROOT_DIR / "docs/arc/ENGINEERING-GUIDELINES.md"
TECH_STACK = ROOT_DIR / "docs/arc/TECH-STACK.md"
ARCHITECTURE_DOC = ROOT_DIR / "docs/arc/ARCHITECTURE.md"
GOAL_STATE_CANON = ROOT_DIR / "docs/arc/README.md"
CURRENT_STATE_MAP = get_cfg_path(ROOT_DIR, CONFIG, "map_dir") / "README.md"
WB_TZ = CONFIG.get("time", {}).get("wb_offset", "-03:00")
ARTIFACT_MANIFEST = load_artifact_manifest(WORKFLOW_CFG)
DEFAULT_WORKSTREAM_INTENT, ARTIFACT_POLICY = load_artifact_policy(WORKFLOW_CFG, ARTIFACT_MANIFEST)
TERMINAL_ARTIFACT_STATUSES = {"approved", "accepted", "final", "done", "superseded", "deprecated"}

DOC_PATTERNS: dict[str, tuple[str, ...]] = {
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
    "pack": ("packs/*",),
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
TASK_CHECKLIST_RE = re.compile(r"^\s*-\s*\[([ /%!>&x])\]\s+(T-\d{2,3})\s+(.+)$")
TASK_ID_RE = re.compile(r"^T-\d{2,3}$")
TASK_ROW_RE = re.compile(r"^(\s*-\s*\[)([ /%!>&x])(?:\]\s+)(T-\d{2,3})(\s+.+)$")
EVIDENCE_TAG_RE = re.compile(r"\s+\(evidence:\s*([^)]+)\)\s*$", re.IGNORECASE)
FAILED_EVIDENCE_RE = re.compile(
    r"\b(?:fail|failed|failure|error|fatal|blocked|source-drift|no justfile found|exit code [1-9])\b",
    re.IGNORECASE,
)
SUCCESS_EVIDENCE_RE = re.compile(
    r"\b(?:pass|passed|success|successful|ok|green|valid|validated|verified|resolved|completed|final)\b",
    re.IGNORECASE,
)
ACCEPTED_FAILURE_RE = re.compile(
    r"\b(?:expected failure|accepted failure|non-blocking|accepted non-blocking|n/a|not applicable|resolves prior failed evidence)\b",
    re.IGNORECASE,
)
GENERIC_CLOSURE_COMMAND_RE = re.compile(
    r"^(?:implement complete|complete|done|mark done|mark-done|finalize|close task)$",
    re.IGNORECASE,
)

TASK_MARKER_TO_STATE = {
    " ": "pending",
    "/": "in_progress",
    "%": "implemented_untested",
    "&": "tested_needs_spec_validation",
    "!": "problem",
    ">": "moved",
    "x": "done",
}

LEGACY_STATE_ALIASES = {
    "blocked": "problem",
    "skipped": "moved",
    "ready_for_test": "implemented_untested",
    "testing": "tested_needs_spec_validation",
    "completed": "done",
}

STATE_TO_MARKER = {
    "pending": " ",
    "in_progress": "/",
    "implemented_untested": "%",
    "tested_needs_spec_validation": "&",
    "problem": "!",
    "moved": ">",
    "done": "x",
}
FORWARD_STATES = set(STATE_TO_MARKER.keys())
BLOCKING_STATES = {"problem", "in_progress"}
FEATURE_OPERATION_RULE_FILES = (
    ("RULE-002", "RULE-002-workstream-creation.md"),
    ("RULE-004", "RULE-004-validation-linting.md"),
    ("RULE-006", "RULE-006-applicable-rule-resolution.md"),
)


@dataclass(frozen=True)
class TaskRow:
    task_id: str
    state: str
    owner: str
    notes: str
    line: int
    line_type: str


def canonical_wb_label() -> str:
    try:
        return str(CANONICAL_WB_DIR.relative_to(ROOT_DIR))
    except ValueError:
        return str(CANONICAL_WB_DIR)


class ExecutionError(RuntimeError):
    pass


def split_frontmatter(text: str) -> Tuple[Dict[str, Any], str]:
    parsed = split_markdown_frontmatter(text)
    if parsed is None:
        return {}, text
    return parsed


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
    files: list[Path] = []
    for pattern in DOC_PATTERNS[alias]:
        files.extend(session_dir.glob(pattern))
    files = sorted(set(files))
    if not files:
        return None
    return files[-1]


def _resolve_session_path(session: str, *, source: str) -> Path:
    candidate = Path(session)
    if not candidate.is_absolute():
        candidate = (
            (ROOT_DIR / session).resolve() if "/" in session else (WB_DIR / session).resolve()
        )
    if candidate.exists() and candidate.is_dir():
        try:
            candidate.resolve().relative_to(CANONICAL_WB_DIR.resolve())
        except ValueError:
            raise ExecutionError(
                f"Session must be under {canonical_wb_label()} ({source}): {session}"
            )
        protected = {
            item.strip()
            for item in os.getenv("AGENTS_PROTECTED_SESSION_IDS", "").split(",")
            if item.strip()
        }
        if candidate.name in protected:
            raise ExecutionError(
                f"Session is protected/read-only for this run ({source}): {candidate.name}. "
                "Create or target a different .agents/wb session."
            )
        return candidate
    raise ExecutionError(f"Session not found ({source}): {session}")


def _strict_session_resolution_enabled() -> bool:
    return os.getenv("AGENTS_SESSION_STRICT", "").strip() == "1"


def find_session(session: Optional[str]) -> Path:
    if session:
        return _resolve_session_path(session, source="--session")

    env_session = os.getenv("AGENTS_SESSION_ID", "").strip()
    if env_session:
        return _resolve_session_path(env_session, source="AGENTS_SESSION_ID")

    if _strict_session_resolution_enabled():
        raise ExecutionError(
            "Session resolution strict mode is enabled (AGENTS_SESSION_STRICT=1). "
            "Pass --session <id/path> or set AGENTS_SESSION_ID."
        )

    active = get_active_session_file_path(ROOT_DIR, CONFIG)
    if active.exists():
        active_id = active.read_text().strip()
        if active_id:
            return _resolve_session_path(active_id, source=".active_session")
    raise ExecutionError(
        "No active session found. Run .agents/agents new and set an active session."
    )


def resolve_artifact(session_dir: Path, artifact: str) -> Optional[Path]:
    if artifact in {"session", "active_session"}:
        return session_dir
    if artifact in {"spec", "active_spec"}:
        return (
            latest_file(session_dir, "spec-child")
            or latest_file(session_dir, "spec")
            or latest_file(session_dir, "spec-lite")
        )
    if artifact in {"spec-child", "active_spec_child", "spec_child"}:
        return latest_file(session_dir, "spec-child")
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


def normalize_task_state(state: str) -> str:
    candidate = str(state or "").strip().lower()
    return LEGACY_STATE_ALIASES.get(candidate, candidate)


def evidence_entry_has_blocking_failure(entry: Dict[str, Any]) -> bool:
    result = str(entry.get("result", ""))
    note = str(entry.get("note", ""))
    combined = f"{result}\n{note}"
    if not FAILED_EVIDENCE_RE.search(combined):
        return False
    return not ACCEPTED_FAILURE_RE.search(combined)


def is_successful_evidence_entry(entry: Dict[str, Any]) -> bool:
    result = str(entry.get("result", ""))
    note = str(entry.get("note", ""))
    combined = f"{result}\n{note}"
    return bool(SUCCESS_EVIDENCE_RE.search(combined)) and not evidence_entry_has_blocking_failure(
        entry
    )


def closure_evidence_error(
    *,
    command: str,
    result: str,
    artifacts: Iterable[str] | None = None,
    note: str | None = None,
) -> str | None:
    command_text = str(command or "").strip()
    result_text = str(result or "").strip()
    artifact_list = [str(a).strip() for a in artifacts or [] if str(a).strip()]
    note_text = str(note or "").strip()

    if not command_text:
        return "closure evidence requires the command or gate that was actually run"
    if GENERIC_CLOSURE_COMMAND_RE.match(command_text):
        return "closure evidence command is generic; record the real command or gate"
    if not result_text:
        return "closure evidence requires an explicit result"

    entry = {
        "command": command_text,
        "result": result_text,
        "artifacts": artifact_list,
        "note": note_text,
    }
    if evidence_entry_has_blocking_failure(entry):
        return "closure evidence records a blocking failure"
    if not is_successful_evidence_entry(entry) and not ACCEPTED_FAILURE_RE.search(
        f"{result_text}\n{note_text}"
    ):
        return "closure evidence result must show a passed/validated gate or explicit N/A"
    if not artifact_list and not note_text:
        return "closure evidence requires an artifact path or explanatory note"
    return None


def validate_closure_evidence(
    *,
    command: str,
    result: str,
    artifacts: Iterable[str] | None = None,
    note: str | None = None,
) -> None:
    error = closure_evidence_error(command=command, result=result, artifacts=artifacts, note=note)
    if error:
        raise ExecutionError(error)


def evidence_record_closure_error(record: Dict[str, Any]) -> str | None:
    artifacts = record.get("artifacts")
    return closure_evidence_error(
        command=str(record.get("command", "")),
        result=str(record.get("result", "")),
        artifacts=artifacts if isinstance(artifacts, list) else [],
        note=str(record.get("note", "")),
    )


def _frontmatter_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def artifact_snapshot(path: Optional[Path]) -> Dict[str, Any]:
    if path is None or not path.exists():
        return {
            "exists": False,
            "path": None,
            "id": "",
            "status": "",
            "updated_at": "",
            "mtime": None,
            "utility": {
                "useful": False,
                "placeholder_count": 0,
                "substantive_line_count": 0,
                "reasons": ["missing"],
            },
        }

    fm, body = split_frontmatter(path.read_text(encoding="utf-8"))
    doc_type = str(fm.get("doc_type", "")).strip()
    utility = analyze_artifact_utility(doc_type, body, fm)
    return {
        "exists": True,
        "path": relative_to_root(path),
        "id": _frontmatter_str(fm.get("id", "")),
        "status": _frontmatter_str(fm.get("status", "")),
        "updated_at": _frontmatter_str(fm.get("updated_at", "")),
        "mtime": path.stat().st_mtime,
        "links": fm.get("links", {}) if isinstance(fm.get("links", {}), dict) else {},
        "roadmap_feature": _frontmatter_str(fm.get("roadmap_feature", "")),
        "parent_spec": _frontmatter_str(fm.get("parent_spec", "")),
        "child_spec": _frontmatter_str(fm.get("child_spec", "")),
        "workstream_intent": _frontmatter_str(fm.get("workstream_intent", "")),
        "doc_type": doc_type,
        "utility": utility,
    }


def _dependency_ready(snapshot: Dict[str, Any]) -> bool:
    if not snapshot.get("exists"):
        return False
    status = str(snapshot.get("status") or "").strip()
    utility = snapshot.get("utility", {})
    if not utility.get("useful"):
        return False
    if not status:
        return True
    return status != "draft"


def _artifact_done(snapshot: Dict[str, Any]) -> bool:
    status = str(snapshot.get("status") or "").strip()
    utility = snapshot.get("utility", {})
    return (
        bool(snapshot.get("exists"))
        and bool(utility.get("useful"))
        and status in TERMINAL_ARTIFACT_STATUSES
    )


def infer_session_intent(session_dir: Path) -> str:
    """Infer the governing workstream intent from frontmatter or present artifacts."""
    for doc_file in sorted(session_dir.rglob("*.md")):
        snapshot = artifact_snapshot(doc_file)
        candidate = str(snapshot.get("workstream_intent") or "").strip()
        if candidate in ARTIFACT_POLICY:
            return candidate

    present_doc_types = {
        entry["doc_type"]
        for entry in ARTIFACT_MANIFEST
        if latest_file(session_dir, entry["doc_type"])
    }
    if "task" in present_doc_types:
        return "delivery"
    if {"report", "postmortem"} & present_doc_types:
        return "closure"
    if "plan" in present_doc_types:
        return "planning"
    if "research" in present_doc_types:
        return "research"
    if "brainstorm" in present_doc_types:
        return "brainstorming"
    if "explorer-check" in present_doc_types:
        return "exploration"
    if {"spec", "spec-child", "spec-lite", "spec-test"} & present_doc_types:
        return "specification"
    return DEFAULT_WORKSTREAM_INTENT


def workflow_artifact_states(session_dir: Path) -> List[Dict[str, Any]]:
    """Return manifest-backed readiness state for session artifacts."""
    intent = infer_session_intent(session_dir)
    profile = ARTIFACT_POLICY.get(intent, {})
    default_doc_types = set(profile.get("create", []))
    optional_doc_types = {entry["doc_type"] for entry in ARTIFACT_MANIFEST if entry.get("flag")}
    present_doc_types = {
        entry["doc_type"]
        for entry in ARTIFACT_MANIFEST
        if latest_file(session_dir, entry["doc_type"])
    }
    present_optional_doc_types = {
        entry["doc_type"]
        for entry in ARTIFACT_MANIFEST
        if entry["doc_type"] in optional_doc_types and latest_file(session_dir, entry["doc_type"])
    }
    selected_doc_types = default_doc_types | present_doc_types
    manifest_entries = [
        entry
        for entry in ARTIFACT_MANIFEST
        if entry["doc_type"] in selected_doc_types
        and (
            entry["doc_type"] not in optional_doc_types
            or entry["doc_type"] in present_optional_doc_types
        )
    ]
    snapshots = {
        entry["doc_type"]: artifact_snapshot(latest_file(session_dir, entry["doc_type"]))
        for entry in manifest_entries
    }
    task_file = resolve_artifact(session_dir, "task")
    total_tasks, done_tasks, _, _, _ = parse_state_summary(task_file)
    report_snapshot = snapshots.get("report", {})
    report_is_final = str(report_snapshot.get("status") or "").strip().lower() == "final"
    all_tasks_done = total_tasks > 0 and done_tasks == total_tasks
    is_closure_mode = report_is_final or all_tasks_done
    closure_optional_doc_types = {"brainstorm", "research", "explorer-check", "postmortem"}
    states: List[Dict[str, Any]] = []

    for entry in manifest_entries:
        doc_type = entry["doc_type"]
        snapshot = snapshots[doc_type]
        depends_on = list(entry.get("depends_on", []))
        blockers: List[str] = []
        for dependency in depends_on:
            dependency_snapshot = snapshots.get(dependency, {"exists": False, "status": ""})
            if not dependency_snapshot.get("exists"):
                blockers.append(f"{dependency}: missing")
                continue
            if not _dependency_ready(dependency_snapshot):
                utility = dependency_snapshot.get("utility", {})
                if dependency_snapshot.get("exists") and not utility.get("useful"):
                    blockers.append(f"{dependency}: invalid")
                else:
                    blockers.append(
                        f"{dependency}: {dependency_snapshot.get('status') or 'unknown'}"
                    )

        state = "ready"
        if not snapshot.get("exists"):
            state = "missing"
        elif (
            is_closure_mode
            and doc_type in closure_optional_doc_types
            and str(snapshot.get("status") or "").strip().lower() != "final"
        ):
            blockers.append(
                f"closure gate: optional '{doc_type}' is present with status="
                f"'{str(snapshot.get('status') or '').strip() or 'missing'}'; set status=final"
            )
            state = "blocked"
        elif _artifact_done(snapshot):
            state = "done"
        elif not snapshot.get("utility", {}).get("useful"):
            state = "invalid"
        elif blockers:
            state = "blocked"

        states.append(
            {
                "doc_type": doc_type,
                "phase": entry.get("phase", "delivery"),
                "state": state,
                "status": snapshot.get("status", ""),
                "path": snapshot.get("path"),
                "id": snapshot.get("id", ""),
                "exists": bool(snapshot.get("exists")),
                "updated_at": snapshot.get("updated_at", ""),
                "depends_on": depends_on,
                "blockers": blockers,
                "intent": intent,
                "utility": snapshot.get("utility", {}),
            }
        )

    return states


def next_workflow_artifact(states: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Return the next actionable or blocking artifact from manifest state."""
    ranked = list(states)
    for desired in ("invalid", "blocked", "missing", "ready"):
        for item in ranked:
            if item.get("state") == desired:
                return item
    return None


def git_status_entries(root_dir: Path = ROOT_DIR) -> Tuple[bool, List[Dict[str, Any]]]:
    proc = run_command(
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
    artifact_names = [
        "plan",
        "task",
        "research",
        "log",
        "report",
        "brainstorm",
        "explorer-check",
        "postmortem",
    ]
    return {name: artifact_snapshot(resolve_artifact(session_dir, name)) for name in artifact_names}


def _session_roadmap_feature(artifacts: Dict[str, Dict[str, Any]]) -> str:
    for alias in ("task", "plan", "research"):
        feature_id = artifacts[alias].get("roadmap_feature", "")
        if feature_id:
            return str(feature_id)
    return ""


def _session_governance_value(artifacts: Dict[str, Dict[str, Any]], field: str) -> str:
    for alias in ("task", "plan", "research", "report", "postmortem"):
        value = artifacts[alias].get(field, "")
        if value:
            return str(value)
    return ""


def _resolve_spec_by_id(spec_id: str) -> Optional[Path]:
    if not spec_id:
        return None
    for spec_file in sorted(SPECS_DIR.rglob("*.md")):
        if spec_file.name in {"INDEX.md", "README.md"}:
            continue
        fm, _ = split_frontmatter(spec_file.read_text(encoding="utf-8"))
        if str(fm.get("id", "")).strip() == spec_id:
            return spec_file
    return None


def _is_governed_workbench_session(session_dir: Path) -> bool:
    try:
        session_dir.resolve().relative_to(WB_DIR.resolve())
        return True
    except ValueError:
        return False


def load_feature_operation_governance(session_dir: Path) -> Optional[Dict[str, Any]]:
    """Load the rule/spec bundle that must be visible before feature operations."""
    if not _is_governed_workbench_session(session_dir):
        return None

    artifacts = _session_artifacts(session_dir)
    missing_artifacts = [alias for alias in ("plan", "task") if not artifacts[alias]["exists"]]
    if missing_artifacts:
        raise ExecutionError(
            "Governed feature operations require plan and task artifacts; missing: "
            + ", ".join(sorted(missing_artifacts))
        )

    feature_id = _session_roadmap_feature(artifacts)
    if not feature_id:
        raise ExecutionError(
            "Governed feature operations require roadmap_feature in the session plan or task."
        )

    parent_spec = _session_governance_value(artifacts, "parent_spec")
    if not parent_spec:
        raise ExecutionError(
            "Governed feature operations require parent_spec in the session plan or task."
        )

    parent_spec_path = _resolve_spec_by_id(parent_spec)
    if parent_spec_path is None:
        raise ExecutionError(f"Parent spec not found for governed feature operation: {parent_spec}")

    child_spec = _session_governance_value(artifacts, "child_spec")
    child_spec_path = None
    if child_spec:
        child_spec_path = _resolve_spec_by_id(child_spec)
        if child_spec_path is None:
            raise ExecutionError(
                f"Child spec not found for governed feature operation: {child_spec}"
            )

    rules: List[Dict[str, str]] = []
    missing_rules: List[str] = []
    for rule_id, filename in FEATURE_OPERATION_RULE_FILES:
        rule_path = (RULES_DIR / filename).resolve()
        if not rule_path.exists():
            missing_rules.append(filename)
            continue
        rules.append({"id": rule_id, "path": relative_to_root(rule_path)})

    if missing_rules:
        raise ExecutionError(
            "Governed feature operations require rule files before execution: "
            + ", ".join(sorted(missing_rules))
        )

    return {
        "session": session_dir.name,
        "feature_id": feature_id,
        "parent_spec": parent_spec,
        "parent_spec_path": relative_to_root(parent_spec_path),
        "child_spec": child_spec,
        "child_spec_path": None if child_spec_path is None else relative_to_root(child_spec_path),
        "plan_path": artifacts["plan"]["path"],
        "task_path": artifacts["task"]["path"],
        "rules": rules,
    }


def _split_session_git_changes(
    session_dir: Path,
) -> Tuple[bool, List[Dict[str, Any]], List[Dict[str, Any]]]:
    git_available, git_changes = git_status_entries(ROOT_DIR)
    session_prefix = relative_to_root(session_dir).rstrip("/")
    session_changes = [
        entry
        for entry in git_changes
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
    expects_research = bool(plan_links.get("research"))
    if expects_research and not artifacts["research"]["exists"]:
        warnings.append(
            "Plan context exists but no research artifact is present for durable findings capture."
        )

    latest_repo_mtime = max(
        (entry["mtime"] for entry in repo_changes if entry["mtime"] is not None), default=None
    )
    if repo_changes and not artifacts["log"]["exists"]:
        warnings.append(
            "Repo has working-tree changes outside the session, but no log artifact exists."
        )

    if repo_changes and latest_repo_mtime is not None:
        for alias in ("log", "research", "report"):
            info = artifacts[alias]
            if not info["exists"] or info["mtime"] is None:
                continue
            if latest_repo_mtime > float(info["mtime"]) + 60:
                stale_artifacts.append(alias)

    if repo_changes and not session_changes:
        warnings.append(
            "Repo has changes outside the session, but the session artifacts are unchanged in git."
        )

    if "log" in stale_artifacts:
        warnings.append(
            "Repo changes are newer than the session log; capture progress before continuing."
        )
    if len(repo_changes) >= 5 and not artifacts["research"]["exists"]:
        warnings.append(
            "Many repo changes are present without a research artifact; findings may be living only in transient context."
        )
    elif len(repo_changes) >= 5 and "research" in stale_artifacts:
        warnings.append(
            "Repo changes are newer than the research artifact; refresh findings before making new planning decisions."
        )
    if (
        artifacts["report"]["exists"]
        and artifacts["report"].get("status", "").lower() == "final"
        and repo_changes
    ):
        warnings.append(
            "Report is marked final while the working tree still has unrecorded repo changes."
        )

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
    if len(repo_changes) >= 5 and (
        not artifacts["research"]["exists"] or "research" in stale_artifacts
    ):
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
    next_step = _catchup_next_step(
        missing_context, stale_artifacts, warnings, repo_changes, artifacts, nxt
    )

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
            "next": None
            if nxt is None
            else {
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
            rows.append(
                TaskRow(
                    task_id=task_id.strip(),
                    state=normalize_task_state(state),
                    owner=owner.strip(),
                    notes=notes.strip(),
                    line=idx,
                    line_type="table",
                )
            )
            continue

        checklist = TASK_CHECKLIST_RE.match(line)
        if checklist:
            marker, task_id, text = checklist.groups()
            state = TASK_MARKER_TO_STATE.get(marker or " ", "pending")
            rows.append(
                TaskRow(
                    task_id=task_id.strip(),
                    state=state,
                    owner="",
                    notes=text.strip(),
                    line=idx,
                    line_type="checklist",
                )
            )

    return rows


def parse_state_summary(
    task_file: Optional[Path],
) -> Tuple[int, int, int, List[str], List[TaskRow]]:
    if not task_file:
        return 0, 0, 0, [], []
    rows = parse_task_rows(task_file)
    total = len(rows)
    done = sum(1 for row in rows if normalize_task_state(row.state) == "done")
    blocked = [
        f"{row.task_id}:{normalize_task_state(row.state)}:{row.owner}:{row.notes}"
        for row in rows
        if normalize_task_state(row.state) == "problem"
    ]
    remaining = total - done
    return total, done, remaining, blocked, rows


def next_task(rows: List[TaskRow]) -> Optional[TaskRow]:
    for row in rows:
        state = normalize_task_state(row.state)
        if state == "in_progress":
            return row
    for row in rows:
        state = normalize_task_state(row.state)
        if state in {"pending", "implemented_untested", "tested_needs_spec_validation"}:
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


def _append_evidence_tag(text: str, evidence_id: str | None) -> str:
    cleaned = EVIDENCE_TAG_RE.sub("", text).rstrip()
    if evidence_id:
        return f"{cleaned} (evidence: {evidence_id})"
    return cleaned


def update_task_state(
    task_file: Path, task_id: str, new_state: str, evidence_id: str | None = None
) -> bool:
    target = normalize_task_state(new_state)
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
                notes = (
                    _append_evidence_tag(notes.strip(), evidence_id)
                    if target == "done"
                    else notes.strip()
                )
                lines[i] = f"| {row_id} | {target} | {owner} | {notes} |"
                changed = True
                continue

        # checklist form
        m = TASK_ROW_RE.match(line)
        if m:
            prefix, marker, row_id, text = m.groups()
            if row_id.strip() == task_id:
                updated_text = _append_evidence_tag(text, evidence_id) if target == "done" else text
                lines[i] = f"{prefix}{STATE_TO_MARKER[target]}] {row_id}{updated_text}"
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


def append_evidence(
    session_dir: Path,
    task_id: str,
    command: str,
    result: str,
    artifacts: Iterable[str] | None = None,
    note: str | None = None,
) -> str:
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
    intent = infer_session_intent(session_dir)
    profile = ARTIFACT_POLICY.get(intent, {})
    required = list(profile.get("required_context", [])) or [
        "roadmap",
        "plan",
        "task",
        "workflow",
        "product",
        "guidelines",
        "tech-stack",
    ]
    checks = resolve_context(session_dir, required)
    missing: List[str] = []
    for name, value in checks.items():
        if value is None:
            missing.append(name)
            continue
        if name in DOC_PATTERNS or name in SESSION_ARTIFACT_ALIASES:
            snapshot = artifact_snapshot(value)
            if not snapshot.get("utility", {}).get("useful"):
                missing.append(f"{name}: invalid")
    return (len(missing) == 0, missing)
