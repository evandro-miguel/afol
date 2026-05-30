#!/usr/bin/env python3
"""
Verify all tasks in a session are completed.

This script:
1. Scans a session folder for task files
2. Checks if all tasks are marked with `- [x]`
3. Reports status of each task
4. Returns error if any task is incomplete

Usage:
    python verify-tasks.py <session-folder>

Examples:
    python verify-tasks.py .agents/wb/260223_1200_auth-refactor/
    python verify-tasks.py .  # current directory

Strict Mode (--strict):
    Enables evidence-backed verification:
    - Tasks marked done must have evidence references
    - Report contradictions are detected
    - Timeline/frontmatter temporal inconsistencies are flagged
"""

import re
import sys
import json
from pathlib import Path
from typing import List, Tuple, Dict, Any
from datetime import datetime, timedelta

from lib.agents_config import get_cfg_path, load_agents_config
from lib.artifact_utility import analyze_artifact_utility
from lib.execution_commands import (
    evidence_entry_has_blocking_failure,
    evidence_record_closure_error,
    is_successful_evidence_entry,
)
from lib.markdown_docs import parse_markdown_doc
from lib.postmortem_governance import postmortem_governance_review_issues

try:
    import yaml
except ImportError:
    yaml = None

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
ROADMAP_FILE = get_cfg_path(ROOT_DIR, CONFIG, "roadmap_file")
SPECS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "specs_dir")
FEATURE_ID_PATTERN = re.compile(CONFIG.get("workflow", {}).get("feature_id_pattern", r"^F-\d{2,3}$"))
WORKFLOW_CFG = CONFIG.get("workflow", {})
REQUIRE_BRAINSTORM_BEFORE_PLAN_FINAL = bool(WORKFLOW_CFG.get("require_brainstorm_before_plan_final", True))
REQUIRE_EXPLORER_CHECK_BEFORE_PLAN_FINAL = bool(WORKFLOW_CFG.get("require_explorer_check_before_plan_final", True))
REQUIRE_EXECPLAN_SECTIONS_BEFORE_PLAN_FINAL = bool(
    WORKFLOW_CFG.get("require_execplan_sections_before_plan_final", True)
)
REQUIRE_EXECPLAN_PROGRESS_BEFORE_PLAN_FINAL = bool(
    WORKFLOW_CFG.get("require_execplan_progress_before_plan_final", True)
)
REQUIRE_POSTMORTEM_BEFORE_REPORT_FINAL = bool(WORKFLOW_CFG.get("require_postmortem_before_report_final", True))

# Task status markers
MARKERS = {
    'pending': r'- \[ \]',
    'in_progress': r'- \[/\]',
    'implemented_untested': r'- \[%\]',
    'tested_needs_spec_validation': r'- \[&\]',
    'problem': r'- \[!\]',
    'moved': r'- \[>\]',
    'done': r'- \[x\]',
}

MARKER_TO_STATUS = {
    " ": "pending",
    "/": "in_progress",
    "%": "implemented_untested",
    "&": "tested_needs_spec_validation",
    "!": "problem",
    ">": "moved",
    "x": "done",
}

LEGACY_STATE_ALIASES = {
    "ready_for_test": "implemented_untested",
    "testing": "tested_needs_spec_validation",
    "blocked": "problem",
    "skipped": "moved",
    "completed": "done",
}


def normalize_task_state(value: str) -> str:
    candidate = str(value or "").strip().lower()
    return LEGACY_STATE_ALIASES.get(candidate, candidate)


TASK_LINE_RE = re.compile(r'^\s*-\s\[( |/|%|&|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$')

# State Board table pattern: | T-01 | done | worker/tester | notes |
STATE_BOARD_TASK_RE = re.compile(r'^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|')

STATE_BOARD_MAP = {
    'pending': 'pending',
    'in_progress': 'in_progress',
    'implemented_untested': 'implemented_untested',
    'tested_needs_spec_validation': 'tested_needs_spec_validation',
    'problem': 'problem',
    'moved': 'moved',
    'done': 'done',
    # Legacy aliases
    'ready_for_test': 'implemented_untested',
    'testing': 'tested_needs_spec_validation',
    'blocked': 'problem',
    'skipped': 'moved',
    'completed': 'done',
}

# Evidence patterns for strict mode
EVIDENCE_PATTERNS = {
    'command': re.compile(r'```(?:bash|shell|console|python|text)?\s*.*?```', re.DOTALL | re.IGNORECASE),
    'result': re.compile(r'\b(?:result|output|response|status)\s*[:\-=]\s*\S+', re.IGNORECASE),
    'artifact': re.compile(r'\b(?:artifact|file|evidence|proof)\s*[:\-=]\s*\S+\.(?:md|json|txt|log|py)', re.IGNORECASE),
    'verification': re.compile(r'\b(?:verified|validated|confirmed|tested|passed|success|successful)\b', re.IGNORECASE),
}

# Contradiction phrases for report analysis
CONTRADICTION_PHRASES = {
    'all_completed': re.compile(r'\ball\b.*?\b(?:tasks?|items?|work)\b.*?\b(?:completed|done|finished)', re.IGNORECASE),
    'pending_execution': re.compile(r'\b(?:pending|not yet|awaiting|waiting for|to do)\b', re.IGNORECASE),
    'blocked': re.compile(r'\b(?:blocked|stuck|unable to|cannot|fail|failed|failure|error)\b', re.IGNORECASE),
    'in_progress': re.compile(r'\b(?:in progress|working on|implementing|currently)\b', re.IGNORECASE),
}

FAILED_EVIDENCE_RE = re.compile(
    r"\b(?:fail|failed|failure|error|fatal|blocked|source-drift|no justfile found|exit code [1-9])\b",
    re.IGNORECASE,
)
SUCCESS_EVIDENCE_RE = re.compile(r"\b(?:pass|passed|success|successful|ok|green|valid|resolved)\b", re.IGNORECASE)
ACCEPTED_FAILURE_RE = re.compile(
    r"\b(?:expected failure|accepted failure|non-blocking|accepted non-blocking|n/a)\b",
    re.IGNORECASE,
)

FINAL_OPEN_MARKER_RE = re.compile(r'^\s*-\s\[( |/|%|&|!|>)\]\s+')
FUTURE_TOLERANCE = timedelta(minutes=2)
EXECPLAN_REQUIRED_HEADINGS = [
    "Purpose / Big Picture",
    "Progress",
    "Surprises & Discoveries",
    "Decision Log",
    "Outcomes & Retrospective",
    "Context and Orientation",
    "Plan of Work",
    "Concrete Steps",
    "Validation and Acceptance",
    "Idempotence and Recovery",
    "Artifacts and Notes",
    "Interfaces and Dependencies",
]
PROGRESS_MARKER_RE = re.compile(r'^\s*-\s\[( |/|%|&|!|>|x)\]\s+', re.MULTILINE)

META_TASK_PATTERNS = [
    re.compile(
        r"\b(?:create|write|make|prepare|draft|build|criar|escrever|fazer|preparar|montar)\b[^.\n]{0,120}\b(?:plan|plano|execplan)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:research|investigate|study|analyze|pesquisar|investigar|estudar|analisar)\b[^.\n]{0,120}\b(?:to|for|para)\b[^.\n]{0,80}\b(?:create|write|make|prepare|build|criar|escrever|fazer|preparar|montar)\b[^.\n]{0,80}\b(?:plan|plano|execplan)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:delegate|assign|delegar|atribuir)\b[^.\n]{0,160}\b(?:plan|plano|execplan)\b",
        re.IGNORECASE,
    ),
]
PLAN_STEP_RE = re.compile(r"^\s*(?:\d+\.\s+|-\s+)(.+?)\s*$")
TASK_BOARD_ROW_RE = re.compile(r'^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|')


def parse_iso_timestamp(value: str) -> datetime:
    """Parse ISO timestamp with timezone support."""
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    return datetime.fromisoformat(candidate)


def extract_evidence(content: str, file_path: Path) -> Dict[str, Any]:
    """
    Extract evidence references from task content.

    Returns dict with:
    - has_command: bool
    - has_result: bool
    - has_artifact: bool
    - has_verification: bool
    - evidence_count: int
    - evidence_details: list of found evidence types
    """
    evidence = {
        'has_command': bool(EVIDENCE_PATTERNS['command'].search(content)),
        'has_result': bool(EVIDENCE_PATTERNS['result'].search(content)),
        'has_artifact': bool(EVIDENCE_PATTERNS['artifact'].search(content)),
        'has_verification': bool(EVIDENCE_PATTERNS['verification'].search(content)),
        'evidence_count': 0,
        'evidence_details': [],
    }

    for pattern_name, pattern in EVIDENCE_PATTERNS.items():
        matches = pattern.findall(content)
        if matches:
            evidence['evidence_count'] += len(matches)
            evidence['evidence_details'].append({
                'type': pattern_name,
                'count': len(matches),
            })

    return evidence


def detect_report_contradictions(content: str) -> List[Dict[str, Any]]:
    """
    Detect semantic contradictions in report content.

    Returns list of contradictions found:
    - "all_completed" + "pending_execution"
    - "all_completed" + "blocked"
    - "all_completed" + "in_progress"
    """
    contradictions = []

    findings = {}
    for name, pattern in CONTRADICTION_PHRASES.items():
        matches = pattern.findall(content)
        if matches:
            findings[name] = len(matches)

    # Check for contradictory combinations
    if 'all_completed' in findings:
        if 'pending_execution' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'error',
                'description': 'Report claims "all completed" but also mentions pending work',
                'conflicting_phrases': ['all_completed', 'pending_execution'],
            })
        if 'blocked' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'error',
                'description': 'Report claims "all completed" but also mentions blocked items',
                'conflicting_phrases': ['all_completed', 'blocked'],
            })
        if 'in_progress' in findings:
            contradictions.append({
                'type': 'completion_conflict',
                'severity': 'warning',
                'description': 'Report claims "all completed" but also mentions work in progress',
                'conflicting_phrases': ['all_completed', 'in_progress'],
            })

    return contradictions


def check_temporal_consistency(session_dir: Path) -> List[Dict[str, Any]]:
    """
    Check for temporal inconsistencies across session documents.

    Validates:
    - Timeline entries are not later than document updated_at
    - updated_at >= created_at for all documents
    - Consistent timestamps across linked documents
    """
    issues = []
    # Use wall-clock time for temporal validation. This keeps checks stable across
    # host timezones while still catching clearly future-dated timestamps.
    now_local = datetime.now()

    if yaml is None:
        return [{'type': 'config', 'severity': 'warning', 'description': 'PyYAML not available, skipping temporal checks'}]

    for doc_file in session_dir.glob('*.md'):
        parsed = parse_markdown_doc(doc_file)
        if parsed is None:
            continue

        fm, _, content = parsed
        doc_name = doc_file.name
        created_at = fm.get('created_at')
        updated_at = fm.get('updated_at')
        timeline_entries = _extract_timeline_entries(content)

        _record_frontmatter_temporal_issues(
            issues,
            doc_name,
            created_at,
            updated_at,
            now_local,
        )
        _record_timeline_temporal_issues(issues, doc_name, updated_at, timeline_entries)

    return issues


def _extract_timeline_entries(content: str) -> List[str]:
    """Return the timeline timestamps found in a workbench doc."""
    timeline_match = re.search(r'## Timeline\s*\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
    if not timeline_match:
        return []

    timeline_content = timeline_match.group(1)
    return re.findall(r'-\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', timeline_content)


def _record_temporal_issue(
    issues: List[Dict[str, Any]],
    doc_name: str,
    description: str,
) -> None:
    issues.append({
        'type': 'temporal_inconsistency',
        'severity': 'error',
        'document': doc_name,
        'description': description,
    })


def _record_frontmatter_temporal_issues(
    issues: List[Dict[str, Any]],
    doc_name: str,
    created_at: Any,
    updated_at: Any,
    now_local: datetime,
) -> None:
    if not updated_at or not created_at:
        return

    try:
        updated_dt = parse_iso_timestamp(updated_at)
        created_dt = parse_iso_timestamp(created_at)
    except Exception:
        return

    if updated_dt < created_dt:
        _record_temporal_issue(
            issues,
            doc_name,
            f'updated_at ({updated_at}) is before created_at ({created_at})',
        )

    # Compare in wall-clock form to avoid brittle timezone assumptions.
    if created_dt.replace(tzinfo=None) > now_local + FUTURE_TOLERANCE:
        _record_temporal_issue(issues, doc_name, f'created_at ({created_at}) is in the future')

    if updated_dt.replace(tzinfo=None) > now_local + FUTURE_TOLERANCE:
        _record_temporal_issue(issues, doc_name, f'updated_at ({updated_at}) is in the future')


def _record_timeline_temporal_issues(
    issues: List[Dict[str, Any]],
    doc_name: str,
    updated_at: Any,
    timeline_entries: List[str],
) -> None:
    if not updated_at:
        return

    try:
        updated_dt = parse_iso_timestamp(updated_at)
    except Exception:
        return

    updated_wall_clock = updated_dt.replace(tzinfo=None)
    for timeline_entry in timeline_entries:
        try:
            # Parse timeline entry format: "YYYY-MM-DD HH:MM"
            entry_dt = datetime.strptime(timeline_entry, '%Y-%m-%d %H:%M')
        except ValueError:
            continue

        # Assume same timezone as updated_at for comparison
        if entry_dt > updated_wall_clock:
            _record_temporal_issue(
                issues,
                doc_name,
                f'Timeline entry ({timeline_entry}) is later than updated_at ({updated_at})',
            )


def load_frontmatter_docs(session_dir: Path) -> List[Dict[str, Any]]:
    """Load markdown docs with parsed frontmatter/body."""
    docs: List[Dict[str, Any]] = []
    for doc_file in sorted(session_dir.rglob("*.md")):
        parsed = parse_markdown_doc(doc_file)
        if parsed is None:
            continue
        fm, body, _ = parsed
        docs.append(
            {
                "path": doc_file,
                "name": doc_file.name,
                "fm": fm,
                "body": body,
            }
        )
    return docs


def _docs_by_id(docs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    indexed: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        doc_id = str(doc["fm"].get("id", "")).strip()
        if doc_id:
            indexed[doc_id] = doc
    return indexed


def check_plan_task_coherence(session_dir: Path) -> List[Dict[str, Any]]:
    """
    Validate coherence between the latest plan and linked task.

    Rules:
    - Latest plan links.task must resolve to an existing task document id.
    - Linked task must reference latest plan via links.plan OR depends_on.
    """
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    plans = [d for d in docs if d["name"].find("_plan_") != -1]
    if not plans:
        return issues

    task_docs = {
        str(d["fm"].get("id", "")).strip(): d
        for d in docs
        if d["name"].find("_task_") != -1
    }
    for plan_doc in sorted(plans, key=lambda d: d["name"]):
        plan_id = plan_doc["fm"].get("id")
        links = plan_doc["fm"].get("links", {})
        if not isinstance(links, dict):
            continue
        linked_task_id = links.get("task")
        if not isinstance(linked_task_id, str) or not linked_task_id.strip():
            continue

        linked_task = task_docs.get(linked_task_id.strip())
        if linked_task is None:
            issues.append(
                {
                    "type": "plan_task_coherence",
                    "severity": "error",
                    "description": f"Plan {plan_id} links.task='{linked_task_id}' but no task doc with this id exists",
                }
            )
            continue

        task_fm = linked_task["fm"]
        task_links = task_fm.get("links", {})
        links_plan = task_links.get("plan") if isinstance(task_links, dict) else None
        depends_on = task_fm.get("depends_on")
        depends_values = depends_on if isinstance(depends_on, list) else []
        if links_plan != plan_id and plan_id not in depends_values:
            issues.append(
                {
                    "type": "plan_task_coherence",
                    "severity": "error",
                    "description": (
                        f"Task {task_fm.get('id')} is linked from plan {plan_id} "
                        "but does not reference it via links.plan or depends_on"
                    ),
                }
            )

    return issues


def _roadmap_has_feature(feature_id: str) -> bool:
    """Return True when the roadmap contains a feature section heading."""
    if not ROADMAP_FILE.exists():
        return False
    pattern = re.compile(rf"^###\s+{re.escape(feature_id)}\b", re.MULTILINE)
    return bool(pattern.search(ROADMAP_FILE.read_text()))


def _spec_id_exists(spec_id: str) -> bool:
    """Return True when a spec with the given frontmatter id exists."""
    if yaml is None:
        return False
    for spec_file in SPECS_DIR.rglob("*.md"):
        if spec_file.name in {"INDEX.md", "README.md"}:
            continue
        parsed = parse_markdown_doc(spec_file)
        if parsed is None:
            continue
        fm, _, _ = parsed
        if str(fm.get("id", "")).strip() == spec_id:
            return True
    return False


def _fm_text(value: Any) -> str:
    """Normalize optional frontmatter scalar values to comparable text."""
    if value is None:
        return ""
    return str(value).strip()


def _append_governance_issue(issues: List[Dict[str, Any]], description: str) -> None:
    issues.append({
        "type": "governance",
        "severity": "error",
        "description": description,
    })


def _validate_governance_feature(plan_id: Any, feature_id: str, issues: List[Dict[str, Any]]) -> None:
    if not feature_id:
        _append_governance_issue(issues, f"Plan {plan_id} is missing roadmap_feature")
        return
    if not FEATURE_ID_PATTERN.match(feature_id):
        _append_governance_issue(issues, f"Plan {plan_id} has invalid roadmap_feature '{feature_id}'")
        return
    if not _roadmap_has_feature(feature_id):
        _append_governance_issue(issues, f"Plan {plan_id} references missing roadmap feature '{feature_id}'")


def _validate_governance_spec_reference(
    plan_id: Any,
    label: str,
    spec_id: str,
    issues: List[Dict[str, Any]],
    *,
    required: bool,
) -> None:
    if not spec_id:
        if required:
            _append_governance_issue(issues, f"Plan {plan_id} is missing {label}")
        return
    if not _spec_id_exists(spec_id):
        _append_governance_issue(issues, f"Plan {plan_id} references missing {label} '{spec_id}'")


def _validate_governance_link(
    plan_id: Any,
    alias: str,
    link_key: str,
    linked_id: Any,
    feature_id: str,
    parent_spec: str,
    docs_by_id: Dict[str, Dict[str, Any]],
    issues: List[Dict[str, Any]],
) -> None:
    linked_id = _fm_text(linked_id)
    if not linked_id:
        return

    linked_doc = docs_by_id.get(linked_id)
    if linked_doc is None:
        _append_governance_issue(
            issues,
            f"Plan {plan_id} links.{link_key}='{linked_id}' but no such doc exists",
        )
        return

    linked_fm = linked_doc["fm"]
    if _fm_text(linked_fm.get("roadmap_feature", "")) not in {"", feature_id}:
        _append_governance_issue(
            issues,
            f"{alias.title()} {linked_id} must match plan roadmap_feature '{feature_id}'",
        )
    if _fm_text(linked_fm.get("parent_spec", "")) not in {"", parent_spec}:
        _append_governance_issue(
            issues,
            f"{alias.title()} {linked_id} must match plan parent_spec '{parent_spec}'",
        )


def _validate_plan_governance(plan_doc: Dict[str, Any], docs_by_id: Dict[str, Dict[str, Any]], issues: List[Dict[str, Any]]) -> None:
    plan_fm = plan_doc["fm"]
    plan_id = plan_fm.get("id")
    feature_id = _fm_text(plan_fm.get("roadmap_feature", ""))
    parent_spec = _fm_text(plan_fm.get("parent_spec", ""))
    child_spec = _fm_text(plan_fm.get("child_spec", ""))

    _validate_governance_feature(plan_id, feature_id, issues)
    _validate_governance_spec_reference(plan_id, "parent_spec", parent_spec, issues, required=True)
    _validate_governance_spec_reference(plan_id, "child_spec", child_spec, issues, required=False)

    links = plan_fm.get("links", {})
    if not isinstance(links, dict):
        return

    for alias, link_key in (
        ("task", "task"),
        ("brainstorm", "brainstorm"),
        ("research", "research"),
        ("explorer-check", "explorer_check"),
    ):
        _validate_governance_link(
            plan_id,
            alias,
            link_key,
            links.get(link_key, ""),
            feature_id,
            parent_spec,
            docs_by_id,
            issues,
        )


def check_governance_coherence(session_dir: Path) -> List[Dict[str, Any]]:
    """Validate roadmap/spec linkage for the latest workstream docs."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    plans = [d for d in docs if d["name"].find("_plan_") != -1]
    if not plans:
        return issues

    docs_by_id = _docs_by_id(docs)

    for plan_doc in sorted(plans, key=lambda d: d["name"]):
        _validate_plan_governance(plan_doc, docs_by_id, issues)

    return issues


def check_planning_intelligence_gates(session_dir: Path) -> List[Dict[str, Any]]:
    """Validate brainstorm/explorer-check gates for finalized planning."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    docs_by_id = _docs_by_id(docs)
    for plan_doc in [d for d in docs if "_plan_" in d["name"]]:
        status = str(plan_doc["fm"].get("status", "")).strip().lower()
        if status != "final":
            continue
        links = plan_doc["fm"].get("links", {})
        if not isinstance(links, dict):
            links = {}
        plan_id = str(plan_doc["fm"].get("id", "")).strip()

        if REQUIRE_BRAINSTORM_BEFORE_PLAN_FINAL:
            brainstorm_id = _fm_text(links.get("brainstorm", ""))
            if not brainstorm_id or brainstorm_id not in docs_by_id:
                issues.append({
                    "type": "planning_gate",
                    "severity": "error",
                    "description": f"Plan {plan_id} is final but has no linked brainstorm artifact",
                })

        if REQUIRE_EXPLORER_CHECK_BEFORE_PLAN_FINAL:
            explorer_id = _fm_text(links.get("explorer_check", ""))
            if not explorer_id or explorer_id not in docs_by_id:
                issues.append({
                    "type": "planning_gate",
                    "severity": "error",
                    "description": f"Plan {plan_id} is final but has no linked explorer-check artifact",
                })

    return issues


def _heading_present(content: str, heading: str) -> bool:
    pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.MULTILINE)
    return bool(pattern.search(content))


def _section_body(content: str, heading: str) -> str:
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(content)
    return match.group("body") if match else ""


def check_execplan_requirements(session_dir: Path) -> List[Dict[str, Any]]:
    """Validate final plans against the ExecPlan contract."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    for plan_doc in [d for d in docs if "_plan_" in d["name"]]:
        status = str(plan_doc["fm"].get("status", "")).strip().lower()
        if status != "final":
            continue

        plan_id = str(plan_doc["fm"].get("id", "")).strip() or plan_doc["name"]
        body = plan_doc["body"]

        if REQUIRE_EXECPLAN_SECTIONS_BEFORE_PLAN_FINAL:
            for heading in EXECPLAN_REQUIRED_HEADINGS:
                if not _heading_present(body, heading):
                    issues.append(
                        {
                            "type": "execplan",
                            "severity": "error",
                            "document": plan_doc["name"],
                            "description": f"Plan {plan_id} is final but missing required ExecPlan section '{heading}'",
                        }
                    )

        if REQUIRE_EXECPLAN_PROGRESS_BEFORE_PLAN_FINAL:
            progress_body = _section_body(body, "Progress")
            if not progress_body:
                issues.append(
                    {
                        "type": "execplan",
                        "severity": "error",
                        "document": plan_doc["name"],
                        "description": f"Plan {plan_id} is final but missing the ExecPlan progress body",
                    }
                )
            elif not PROGRESS_MARKER_RE.search(progress_body):
                issues.append(
                    {
                        "type": "execplan",
                        "severity": "error",
                        "document": plan_doc["name"],
                        "description": f"Plan {plan_id} is final but Progress has no checkbox entries",
                    }
                )

    return issues


def check_postmortem_closure(session_dir: Path) -> List[Dict[str, Any]]:
    """Validate optional postmortem closure rules and final-review completeness."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    reports = [d for d in docs if "_report_" in d["name"]]
    postmortems = [d for d in docs if "_postmortem_" in d["name"]]
    final_reports = [d for d in reports if str(d["fm"].get("status", "")).strip().lower() == "final"]
    if final_reports and REQUIRE_POSTMORTEM_BEFORE_REPORT_FINAL:
        if not postmortems:
            issues.append({
                "type": "postmortem_gate",
                "severity": "error",
                "description": "Final report exists but no postmortem document was found",
            })
            return issues

        if not any(str(d["fm"].get("status", "")).strip().lower() == "final" for d in postmortems):
            issues.append({
                "type": "postmortem_gate",
                "severity": "error",
                "description": "Final report exists but no postmortem has status=final",
            })

    for doc in postmortems:
        if str(doc["fm"].get("status", "")).strip().lower() != "final":
            continue
        review_issues = postmortem_governance_review_issues(doc["body"])
        for issue in review_issues:
            issues.append({
                "type": "postmortem_governance_review",
                "severity": "error",
                "document": doc["name"],
                "description": f"Final postmortem is incomplete: {issue}",
            })

    return issues


def check_artifact_utility(session_dir: Path) -> List[Dict[str, Any]]:
    """Reject artifacts that exist but still contain only template scaffolding."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    for doc in load_frontmatter_docs(session_dir):
        fm = doc["fm"]
        doc_type = str(fm.get("doc_type", "")).strip()
        if not doc_type:
            continue

        utility = analyze_artifact_utility(doc_type, doc["body"], fm)
        if utility["useful"]:
            continue

        status = str(fm.get("status", "")).strip().lower()
        severity = "warning" if status in {"", "draft"} else "error"
        issues.append(
            {
                "type": "artifact_utility",
                "severity": severity,
                "document": doc["name"],
                "description": f"{doc_type} artifact exists but is not useful: {'; '.join(utility['reasons'])}",
            }
        )

    return issues


def _section_lines(body: str, heading: str) -> List[str]:
    section_body = _section_body(body, heading)
    return [line.strip() for line in section_body.splitlines() if line.strip()]


def _collect_primary_task_lines(doc: Dict[str, Any]) -> List[Tuple[int, str]]:
    doc_type = str(doc["fm"].get("doc_type", "")).strip()
    body = doc["body"]
    lines = body.splitlines()
    collected: List[Tuple[int, str]] = []

    if doc_type == "plan":
        plan_lines = _section_lines(body, "Plan of Work") + _section_lines(body, "Concrete Steps")
        for line in plan_lines:
            match = PLAN_STEP_RE.match(line)
            if match:
                collected.append((0, match.group(1).strip()))
        return collected

    if doc_type != "task":
        return collected

    for line_num, line in enumerate(lines, 1):
        checklist = TASK_LINE_RE.match(line)
        if checklist:
            collected.append((line_num, checklist.group(3).strip()))
            continue

        row = TASK_BOARD_ROW_RE.match(line)
        if row:
            collected.append((line_num, row.group(4).strip()))

    return collected


def check_meta_task_integrity(session_dir: Path) -> List[Dict[str, Any]]:
    """Reject plan/task artifacts that use primary tasks for meta-planning."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    for doc in load_frontmatter_docs(session_dir):
        doc_type = str(doc["fm"].get("doc_type", "")).strip()
        if doc_type not in {"plan", "task"}:
            continue

        for line_num, text in _collect_primary_task_lines(doc):
            normalized = " ".join(text.split())
            if not normalized:
                continue
            for pattern in META_TASK_PATTERNS:
                if pattern.search(normalized):
                    issues.append(
                        {
                            "type": "meta_task_integrity",
                            "severity": "error",
                            "document": doc["name"],
                            "line": line_num,
                            "description": (
                                f"{doc_type} contains meta-planning as primary task: '{normalized}'"
                            ),
                        }
                    )
                    break

    return issues


def check_delivery_closure_readiness(session_dir: Path, completed_tasks: int) -> List[Dict[str, Any]]:
    """Validate closure blockers only for optional artifacts that are present."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    docs = load_frontmatter_docs(session_dir)
    report_final_exists = any(
        "_report_" in d["name"] and str(d["fm"].get("status", "")).strip().lower() == "final"
        for d in docs
    )

    total_tasks = 0
    for task_file in sorted(session_dir.rglob("*task*.md")):
        total_tasks += len(extract_tasks(task_file.read_text(), task_file))

    all_tasks_done = total_tasks > 0 and completed_tasks > 0 and completed_tasks == total_tasks
    if not (report_final_exists or all_tasks_done):
        return issues

    optional_doc_types = {"brainstorm", "research", "explorer-check", "postmortem"}
    for doc in docs:
        doc_type = str(doc["fm"].get("doc_type", "")).strip()
        if doc_type not in optional_doc_types:
            continue

        status = str(doc["fm"].get("status", "")).strip().lower()
        if status == "final":
            continue

        issues.append(
            {
                "type": "closure_artifacts",
                "severity": "error",
                "description": (
                    f"Optional artifact '{doc_type}' is present ({doc['name']}) with status="
                    f"'{status or 'missing'}'; closure is blocked until status=final."
                ),
            }
        )

    return issues


def check_final_docs_for_open_checklists(session_dir: Path) -> List[Dict[str, Any]]:
    """Fail strict mode when a status=final doc still has open checklist markers."""
    issues: List[Dict[str, Any]] = []
    if yaml is None:
        return issues

    for doc in load_frontmatter_docs(session_dir):
        fm = doc["fm"]
        if str(fm.get("status", "")).strip().lower() != "final":
            continue

        for line_num, line in enumerate(doc["body"].splitlines(), 1):
            if FINAL_OPEN_MARKER_RE.match(line):
                issues.append(
                    {
                        "type": "final_doc_open_checklist",
                        "severity": "error",
                        "document": doc["name"],
                        "line": line_num,
                        "description": (
                            f"Document {doc['name']} has status=final with open checklist line {line_num}"
                        ),
                    }
                )
                break

    return issues


def has_sufficient_evidence(evidence: Dict[str, Any]) -> bool:
    """
    Determine if evidence is sufficient for a completed task.

    Requirements (at least 2 of 4):
    - Command/code block showing execution
    - Result/output documentation
    - Artifact reference
    - Verification statement
    """
    criteria_met = sum([
        evidence['has_command'],
        evidence['has_result'],
        evidence['has_artifact'],
        evidence['has_verification'],
    ])
    return criteria_met >= 2


def _load_evidence_ledger(session_path: Path) -> Dict[str, List[Dict[str, Any]]]:
    """Load `.evidence.jsonl` entries keyed by task id."""
    evidence_by_task: Dict[str, List[Dict[str, Any]]] = {}
    ledger = session_path / ".evidence.jsonl"
    if not ledger.exists():
        return evidence_by_task

    for line_num, line in enumerate(ledger.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            evidence_by_task.setdefault("__ledger_errors__", []).append(
                {
                    "line": line_num,
                    "result": "invalid evidence json",
                    "command": str(ledger),
                }
            )
            continue
        task_id = str(entry.get("task_id", "")).strip()
        if task_id:
            evidence_by_task.setdefault(task_id, []).append(entry)

    return evidence_by_task


def _resolve_evidence_scope(session_path: Path, task_file: Path) -> Path:
    """Resolve the closest ancestor directory that owns `.evidence.jsonl`."""
    current = task_file.parent
    session_root = session_path.resolve()

    while True:
        if (current / ".evidence.jsonl").exists():
            return current
        if current.resolve() == session_root or current.parent == current:
            return session_path
        current = current.parent


def _unresolved_failed_evidence_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return failed evidence entries that are not superseded by later success for the same command."""
    unresolved: List[Dict[str, Any]] = []
    for index, entry in enumerate(entries):
        if not evidence_entry_has_blocking_failure(entry):
            continue
        command = str(entry.get("command", "")).strip()
        evidence_id = str(entry.get("id", "")).strip()
        later_entries = entries[index + 1 :]
        superseded = any(
            is_successful_evidence_entry(later)
            and (
                str(later.get("command", "")).strip() == command
                or bool(evidence_id and evidence_id in _evidence_text(later))
            )
            for later in later_entries
        )
        if not superseded:
            unresolved.append(entry)
    return unresolved


def _evidence_text(entry: Dict[str, Any]) -> str:
    return " ".join(
        str(entry.get(key, ""))
        for key in ("id", "command", "result", "note")
    )


def _valid_closure_evidence_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [entry for entry in entries if evidence_record_closure_error(entry) is None]


def extract_tasks(content: str, file_path: Path) -> List[Tuple[str, str, str, int]]:
    """
    Extract all tasks from markdown content.

    Supports both formats:
    1. Legacy: `- [x] T-01 description`
    2. State Board: `| T-01 | done | worker | notes |`

    Returns list of (task_id, task_text, marker_type, line_number)
    """
    tasks = []
    lines = content.splitlines()
    in_code_block = False
    in_state_board = False

    for line_num, line in enumerate(lines, 1):
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue

        if in_code_block:
            continue

        # Check if we're entering a State Board section
        if "## State Board" in line:
            in_state_board = True
            continue

        # Exit State Board when we hit another section
        if in_state_board and line.strip().startswith("##"):
            in_state_board = False

        # Try to match State Board table row first
        if in_state_board:
            match = STATE_BOARD_TASK_RE.match(line)
            if match:
                task_id = match.group(1)
                state = match.group(2).lower()
                # Extract description from notes column (use state as placeholder for description)
                task_text = f"{state} (State Board)"
                marker_type = STATE_BOARD_MAP.get(state, 'pending')
                if task_text:
                    tasks.append((task_id, task_text, marker_type, line_num))
                continue

        # Try to match legacy checkbox format
        match = TASK_LINE_RE.match(line)
        if not match:
            continue

        marker_char = match.group(1)
        task_id = match.group(2)
        task_text = match.group(3).strip()
        marker_type = MARKER_TO_STATUS[marker_char]

        if task_text:
            tasks.append((task_id, task_text, marker_type, line_num))

    return tasks


TASK_STATUS_COUNTERS = {
    "pending": "pending",
    "in_progress": "in_progress",
    "implemented_untested": "implemented_untested",
    "tested_needs_spec_validation": "tested_needs_spec_validation",
    "problem": "problem",
    "moved": "moved",
}


def _record_missing_evidence(
    results: Dict[str, Any],
    task_id: str,
    task_file: Path,
    line_num: int,
    evidence: Dict[str, Any],
) -> None:
    results["evidence_issues"].append(
        {
            "type": "missing_evidence",
            "severity": "error",
            "task_id": task_id,
            "file": str(task_file),
            "line": line_num,
            "description": f"Task {task_id} marked done but lacks sufficient evidence",
            "evidence_found": evidence["evidence_count"],
            "evidence_details": evidence["evidence_details"],
        }
    )


def _record_failed_evidence(
    results: Dict[str, Any],
    task_id: str,
    task_file: Path,
    line_num: int,
    entry: Dict[str, Any],
) -> None:
    results["evidence_issues"].append(
        {
            "type": "failed_evidence",
            "severity": "error",
            "task_id": task_id,
            "file": str(task_file),
            "line": line_num,
            "description": f"Task {task_id} marked done but has blocking failed evidence",
            "command": str(entry.get("command", "")),
            "result": str(entry.get("result", "")),
            "evidence_id": str(entry.get("id", "")),
        }
    )


def _record_task_verification(
    results: Dict[str, Any],
    file_result: Dict[str, Any],
    task_info: Dict[str, Any],
    content: str,
    strict: bool,
    marker_type: str,
    evidence_ledger: Dict[str, List[Dict[str, Any]]] | None = None,
) -> bool:
    marker_type = normalize_task_state(marker_type)
    if marker_type == "done":
        results["completed"] += 1
        results["done"] += 1
        if strict:
            ledger_entries = (evidence_ledger or {}).get(task_info["id"], [])
            failed_entries = _unresolved_failed_evidence_entries(ledger_entries)
            if failed_entries:
                _record_failed_evidence(results, task_info["id"], task_info["file"], task_info["line"], failed_entries[0])
                file_result["all_completed"] = False
                return False
            valid_entries = _valid_closure_evidence_entries(ledger_entries)
            if not valid_entries:
                evidence = extract_evidence(content, task_info["file"])
                _record_missing_evidence(results, task_info["id"], task_info["file"], task_info["line"], evidence)
                file_result["all_completed"] = False
                return False
        return True

    counter_key = TASK_STATUS_COUNTERS.get(marker_type)
    if counter_key is None:
        return True

    results[counter_key] += 1
    # Legacy compatibility counters
    if counter_key == "implemented_untested":
        results["ready_for_test"] += 1
    elif counter_key == "problem":
        results["blocked"] += 1
    elif counter_key == "moved":
        results["skipped"] += 1

    if marker_type == "moved":
        return True

    results["open_tasks"].append(task_info)
    file_result["all_completed"] = False
    return False


def _collect_report_contradictions(session_path: Path) -> List[Dict[str, Any]]:
    contradictions: List[Dict[str, Any]] = []
    for report_file in session_path.rglob("*report*.md"):
        contradictions.extend(detect_report_contradictions(report_file.read_text()))
    return contradictions


def _issues_have_errors(issues: List[Dict[str, Any]]) -> bool:
    return any(issue.get("severity") == "error" for issue in issues)


def _run_strict_session_checks(session_path: Path, results: Dict[str, Any]) -> bool:
    """Populate strict-mode issue buckets and report whether they are all clear."""
    checks = (
        ("contradictions", lambda: _collect_report_contradictions(session_path)),
        ("temporal_issues", lambda: check_temporal_consistency(session_path)),
        ("coherence_issues", lambda: check_plan_task_coherence(session_path)),
        ("governance_issues", lambda: check_governance_coherence(session_path)),
        ("meta_task_issues", lambda: check_meta_task_integrity(session_path)),
        ("planning_gate_issues", lambda: check_planning_intelligence_gates(session_path)),
        ("execplan_issues", lambda: check_execplan_requirements(session_path)),
        ("postmortem_issues", lambda: check_postmortem_closure(session_path)),
        ("final_doc_issues", lambda: check_final_docs_for_open_checklists(session_path)),
        ("artifact_utility_issues", lambda: check_artifact_utility(session_path)),
        ("closure_issues", lambda: check_delivery_closure_readiness(session_path, results["completed"])),
    )

    all_clear = True
    for key, supplier in checks:
        issues = supplier()
        results[key] = issues
        all_clear = all_clear and not _issues_have_errors(issues)

    return all_clear


def verify_session(session_path: Path, strict: bool = False) -> Tuple[bool, Dict]:
    """
    Verify all tasks in a session folder are completed.

    Returns (all_completed, results_dict)

    In strict mode:
    - Validates evidence for completed tasks
    - Detects report contradictions
    - Checks temporal consistency
    """
    results = {
        'session': session_path,
        'task_files': [],
        'open_tasks': [],
        'total_tasks': 0,
        'completed': 0,
        'done': 0,
        'pending': 0,
        'in_progress': 0,
        'implemented_untested': 0,
        'tested_needs_spec_validation': 0,
        'problem': 0,
        'moved': 0,
        # Legacy compatibility counters
        'ready_for_test': 0,
        'blocked': 0,
        'skipped': 0,
        'issues': [],
        'strict_mode': strict,
        'evidence_issues': [],
        'contradictions': [],
        'temporal_issues': [],
        'coherence_issues': [],
        'governance_issues': [],
        'meta_task_issues': [],
        'planning_gate_issues': [],
        'execplan_issues': [],
        'postmortem_issues': [],
        'final_doc_issues': [],
        'artifact_utility_issues': [],
        'closure_issues': [],
    }

    if not session_path.exists():
        results['issues'].append(f"Session folder not found: {session_path}")
        return False, results

    # Find all task files (recursive, so .agents/wb/ can be used directly)
    task_files = list(session_path.rglob('*task*.md'))

    if not task_files:
        if not strict:
            results['issues'].append("No task files found in session")
            return True, results  # No tasks = vacuously true in non-strict mode

    all_completed = True
    evidence_ledger_by_scope: Dict[Path, Dict[str, List[Dict[str, Any]]]] = {}

    for task_file in sorted(task_files):
        evidence_ledger: Dict[str, List[Dict[str, Any]]] = {}
        if strict:
            evidence_scope = _resolve_evidence_scope(session_path, task_file)
            if evidence_scope not in evidence_ledger_by_scope:
                evidence_ledger_by_scope[evidence_scope] = _load_evidence_ledger(evidence_scope)
            evidence_ledger = evidence_ledger_by_scope[evidence_scope]

        file_result = {
            'file': task_file,
            'tasks': [],
            'all_completed': True,
        }

        content = task_file.read_text()
        tasks = extract_tasks(content, task_file)

        for task_id, task_text, marker_type, line_num in tasks:
            task_info = {
                'id': task_id,
                'description': task_text,
                'status': marker_type,
                'line': line_num,
                'file': task_file,
            }
            file_result['tasks'].append(task_info)
            results['total_tasks'] += 1

            task_completed = _record_task_verification(
                results,
                file_result,
                task_info,
                content,
                strict,
                marker_type,
                evidence_ledger,
            )
            all_completed = all_completed and task_completed

        results['task_files'].append(file_result)

    if strict:
        all_completed = all_completed and _run_strict_session_checks(session_path, results)

    return all_completed, results


def _print_evidence_issue(issue: Dict[str, Any]) -> None:
    print(f"  ⚠️  {issue['task_id']} | {issue['file'].split('/')[-1]}:{issue['line']}")
    print(f"      {issue['description']}")
    if issue.get('evidence_details'):
        details = ', '.join([f"{e['type']}:{e['count']}" for e in issue['evidence_details']])
        print(f"      Evidence found: {details}")
    if issue.get("command") or issue.get("result"):
        print(f"      Command: {issue.get('command', '')}")
        print(f"      Result: {issue.get('result', '')}")


def _print_contradiction_issue(issue: Dict[str, Any]) -> None:
    print(f"  ⚠️  [{issue['severity'].upper()}] {issue['description']}")
    print(f"      Conflicting: {', '.join(issue.get('conflicting_phrases', []))}")


def _print_standard_issue(issue: Dict[str, Any]) -> None:
    print(f"  ⚠️  [{issue.get('severity', 'error').upper()}] {issue['description']}")


def _print_final_doc_issue(issue: Dict[str, Any]) -> None:
    print(
        f"  ⚠️  {issue.get('document', 'unknown')}:{issue.get('line', '?')} "
        f"{issue['description']}"
    )


def _print_issue_section(
    title: str,
    issues: List[Dict[str, Any]],
    empty_message: str,
    formatter,
) -> None:
    if issues:
        print(f"\n❌ {title}: {len(issues)}")
        for issue in issues:
            formatter(issue)
    else:
        print(f"  ✓ {empty_message}")


def _print_strict_mode_sections(results: Dict[str, Any]) -> None:
    print("Strict Mode Checks:")
    print("-" * 60)
    _print_issue_section("Evidence Issues", results["evidence_issues"], "Evidence checks passed", _print_evidence_issue)
    _print_issue_section("Contradictions", results["contradictions"], "No contradictions detected", _print_contradiction_issue)
    _print_issue_section(
        "Temporal Issues",
        results["temporal_issues"],
        "Temporal consistency checks passed",
        lambda issue: print(f"  ⚠️  {issue.get('document', 'unknown')}: {issue['description']}"),
    )
    _print_issue_section(
        "Plan/Task Coherence Issues",
        results.get("coherence_issues", []),
        "Plan/task coherence checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Governance Issues",
        results.get("governance_issues", []),
        "Roadmap/spec governance checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Meta-Task Integrity Issues",
        results.get("meta_task_issues", []),
        "No meta-planning tasks detected in plan/task boards",
        _print_standard_issue,
    )
    _print_issue_section(
        "Planning Gate Issues",
        results.get("planning_gate_issues", []),
        "Planning gate checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "ExecPlan Issues",
        results.get("execplan_issues", []),
        "ExecPlan section checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Postmortem Issues",
        results.get("postmortem_issues", []),
        "Postmortem closure checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Artifact Utility Issues",
        results.get("artifact_utility_issues", []),
        "Artifact utility checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Closure Artifact Issues",
        results.get("closure_issues", []),
        "Closure artifact checks passed",
        _print_standard_issue,
    )
    _print_issue_section(
        "Final Doc Checklist Issues",
        results.get("final_doc_issues", []),
        "Final-doc checklist checks passed",
        _print_final_doc_issue,
    )
    print()


def _print_task_details(results: Dict[str, Any]) -> None:
    print("Task Details:")
    print("-" * 60)

    for file_result in results["task_files"]:
        print(f"\n📄 {file_result['file'].name}")

        if not file_result["tasks"]:
            print("   (no tasks found)")
            continue

        status_icon = {
            'done': '✓',
            'moved': '➤',
            'pending': '⏳',
            'in_progress': '🔄',
            'implemented_untested': '🧪',
            'tested_needs_spec_validation': '🔬',
            'problem': '⚠️',
        }

        for task in file_result["tasks"]:
            icon = status_icon.get(task["status"], "?")
            print(f"   {icon} {task['id']} @ line {task['line']}: {task['description']}")

    if results["open_tasks"]:
        print()
        print("Open Tasks:")
        print("-" * 60)
        for task in results["open_tasks"]:
            rel = task["file"].relative_to(results["session"])
            print(f"  {task['id']} | {rel}:{task['line']} | {task['status']} | {task['description']}")


def _print_failure_summary(results: Dict[str, Any]) -> None:
    print("Strict mode failures detected:")
    for key, label in (
        ("evidence_issues", "task(s) lacking evidence"),
        ("contradictions", "contradiction(s) found"),
        ("temporal_issues", "temporal issue(s) found"),
        ("coherence_issues", "plan/task coherence issue(s) found"),
        ("governance_issues", "roadmap/spec governance issue(s) found"),
        ("meta_task_issues", "meta-planning task issue(s) found"),
        ("planning_gate_issues", "planning gate issue(s) found"),
        ("execplan_issues", "ExecPlan issue(s) found"),
        ("postmortem_issues", "postmortem issue(s) found"),
        ("artifact_utility_issues", "artifact utility issue(s) found"),
        ("closure_issues", "closure artifact issue(s) found"),
        ("final_doc_issues", "final-doc checklist issue(s) found"),
    ):
        if results.get(key):
            print(f"  - {len(results[key])} {label}")


def _print_verdict(all_completed: bool, results: Dict[str, Any]) -> None:
    print()
    print("=" * 60)
    if all_completed:
        if results["moved"] > 0:
            print(f"✅ All tasks completed! ({results['moved']} moved by user)")
        else:
            print("✅ All tasks completed!")
    else:
        print("❌ Verification failed")
        print()
        if results.get("strict_mode"):
            _print_failure_summary(results)
        else:
            print("Legend:")
            print("  ✓  completed")
            print("  ➤  moved (user-authorized)")
            print("  ⏳  pending")
            print("  🔄  in progress")
            print("  🧪  implemented, untested")
            print("  🔬  tested, pending spec/experience validation")
            print("  ⚠️  problem")
    print("=" * 60)


def _print_issues(results: Dict[str, Any]) -> None:
    if results["issues"]:
        print("\nIssues:")
        for issue in results["issues"]:
            print(f"  ⚠️  {issue}")


def print_report(all_completed: bool, results: Dict) -> None:
    """Print verification report."""
    print("=" * 60)
    print("Task Verification Report")
    print("=" * 60)
    print(f"Session: {results['session']}")
    if results.get('strict_mode'):
        print("Mode: STRICT")
    print()

    print("Summary:")
    print(f"  Total tasks:     {results['total_tasks']}")
    print(f"  Completed:       {results['completed']} ✓")
    if results['moved'] > 0:
        print(f"  Moved:           {results['moved']} ➤")
    if results['pending'] > 0:
        print(f"  Pending:         {results['pending']} ⏳")
    if results['in_progress'] > 0:
        print(f"  In Progress:     {results['in_progress']} 🔄")
    if results['implemented_untested'] > 0:
        print(f"  Implemented:     {results['implemented_untested']} 🧪")
    if results['tested_needs_spec_validation'] > 0:
        print(f"  Tested/Spec:     {results['tested_needs_spec_validation']} 🔬")
    if results['problem'] > 0:
        print(f"  Problem:         {results['problem']} ⚠️")
    print()

    if results.get('strict_mode'):
        _print_strict_mode_sections(results)

    _print_task_details(results)
    _print_verdict(all_completed, results)
    _print_issues(results)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Verify all tasks in a session are completed.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python verify-tasks.py .agents/wb/260223_1200_auth-refactor/
  python verify-tasks.py --strict .agents/wb/260223_1200-auth-refactor/
  python verify-tasks.py .  # current directory

Strict Mode:
  Enables evidence-backed verification:
  - Tasks marked done must have evidence references
  - Report contradictions are detected
  - Timeline/frontmatter temporal inconsistencies are flagged
'''
    )
    parser.add_argument(
        'session_path',
        nargs='?',
        default=None,
        help='Session folder path (default: current directory)'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Enable strict verification mode with evidence checks'
    )

    args = parser.parse_args()

    if args.session_path:
        session_path = Path(args.session_path)
    else:
        session_path = Path.cwd()

    all_completed, results = verify_session(session_path, strict=args.strict)
    print_report(all_completed, results)

    # Exit with error if tasks incomplete
    sys.exit(0 if all_completed else 1)


if __name__ == "__main__":
    main()
