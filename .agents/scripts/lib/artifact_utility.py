#!/usr/bin/env python3
"""Semantic utility checks for workbench artifacts."""

from __future__ import annotations

import re
from typing import Any, Dict, List


PLACEHOLDER_RE = re.compile(
    r"<[^>\n]+>|YYYY-MM-DD(?:THH:MM:SSZ|\s+HH:MMZ)?|<yes/no>|<pass/fail>|<successful/partial/blocked>",
    re.IGNORECASE,
)
SECTION_RE_TEMPLATE = r"^##\s+{heading}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)"
TASK_TABLE_RE = re.compile(r"^\|\s*(T-\d{2,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$", re.MULTILINE)
TASK_CHECKLIST_RE = re.compile(r"^\s*-\s*\[[ /%!>x]\]\s+(T-\d{2,3})\s+(.+)$", re.MULTILINE)

GENERIC_NOISE_LINES = {
    "---",
    "|------|-------|-------|-------|",
    "**state values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`",
}


def _section_body(body: str, heading: str) -> str:
    pattern = re.compile(SECTION_RE_TEMPLATE.format(heading=re.escape(heading)), re.MULTILINE | re.DOTALL)
    match = pattern.search(body)
    return match.group("body") if match else ""


def _strip_template_footer(body: str) -> str:
    return re.sub(r"\n---\n\*Template:.*?$", "", body, flags=re.DOTALL).strip()


def _candidate_lines(body: str) -> List[str]:
    content = _strip_template_footer(body)
    lines: List[str] = []
    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        if line.startswith("```") or line == "```bash":
            continue
        if line in GENERIC_NOISE_LINES:
            continue
        lines.append(line)
    return lines


def _substantive_lines(body: str) -> List[str]:
    substantive: List[str] = []
    for line in _candidate_lines(body):
        if PLACEHOLDER_RE.search(line):
            continue
        if line.lower().startswith("*template:"):
            continue
        substantive.append(line)
    return substantive


def _has_substantive_section(body: str, heading: str, minimum: int = 1) -> bool:
    return len(_substantive_lines(_section_body(body, heading))) >= minimum


def _append_missing_section(reasons: List[str], body: str, heading: str, message: str, minimum: int = 1) -> None:
    if not _has_substantive_section(body, heading, minimum=minimum):
        reasons.append(message)


def _plan_has_real_progress(body: str) -> bool:
    progress_body = _section_body(body, "Progress")
    progress_lines = [line for line in progress_body.splitlines() if line.strip()]
    return any("Replace this line" not in line and not PLACEHOLDER_RE.search(line) for line in progress_lines)


def _task_rows(body: str) -> List[str]:
    table_rows = [
        match.group(4).strip()
        for match in TASK_TABLE_RE.finditer(body)
        if match.group(1).strip() and "<note>" not in match.group(4)
    ]
    checklist_rows = [
        match.group(2).strip()
        for match in TASK_CHECKLIST_RE.finditer(body)
        if match.group(1).strip() and "<" not in match.group(2)
    ]
    return table_rows + checklist_rows


def _check_brainstorm(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "Problem Statement", "problem statement has no concrete content")
    _append_missing_section(reasons, body, "Options", "options section has no concrete alternatives")
    _append_missing_section(reasons, body, "Preferred Direction", "preferred direction has no concrete rationale")


def _check_research(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "Findings", "findings section has no concrete findings")
    _append_missing_section(reasons, body, "Sources", "sources section has no concrete references")


def _check_explorer_check(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "Scope Reviewed", "scope reviewed has no inspected paths or docs")
    _append_missing_section(reasons, body, "Findings", "findings section has no repo-backed findings")
    _append_missing_section(reasons, body, "Impact on the Plan", "impact on the plan has no concrete consequence")


def _check_plan(body: str, reasons: List[str]) -> None:
    if not _plan_has_real_progress(body):
        reasons.append("progress section has no real progress entry")
    _append_missing_section(reasons, body, "Concrete Steps", "concrete steps section has no actionable steps")
    _append_missing_section(reasons, body, "Validation and Acceptance", "validation and acceptance has no executable checks")


def _check_task(body: str, reasons: List[str]) -> None:
    if not _task_rows(body):
        reasons.append("task board has no concrete executable row")


def _check_log(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "Timeline", "timeline has no real execution entry")


def _check_report(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "Summary", "summary has no delivered outcome")
    _append_missing_section(reasons, body, "Delivered Changes", "delivered changes has no concrete change list")
    _append_missing_section(reasons, body, "Verification", "verification has no concrete command/result evidence")


def _check_postmortem(body: str, reasons: List[str]) -> None:
    _append_missing_section(reasons, body, "What Was Achieved", "what was achieved has no concrete outcome")
    _append_missing_section(reasons, body, "Root Causes", "root causes has no concrete analysis")
    _append_missing_section(reasons, body, "Follow-ups for Next Rounds", "follow-ups has no concrete next step")


def _check_spec(doc_type: str, substantive_lines: List[str], reasons: List[str]) -> None:
    if doc_type in {"spec", "spec-lite"} and len(substantive_lines) < 4:
        reasons.append("spec content is still too thin to guide implementation")


DOC_TYPE_CHECKERS = {
    "brainstorm": _check_brainstorm,
    "research": _check_research,
    "explorer-check": _check_explorer_check,
    "plan": _check_plan,
    "task": _check_task,
    "log": _check_log,
    "report": _check_report,
    "postmortem": _check_postmortem,
}


def analyze_artifact_utility(doc_type: str, body: str, frontmatter: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Return cheap semantic signals about whether an artifact is actually useful."""
    del frontmatter  # Reserved for future heuristics that depend on metadata.

    substantive_lines = _substantive_lines(body)
    placeholder_hits = PLACEHOLDER_RE.findall(body)
    reasons: List[str] = []

    if not substantive_lines:
        reasons.append("body has no substantive content beyond template scaffolding")

    checker = DOC_TYPE_CHECKERS.get(doc_type)
    if checker:
        checker(body, reasons)
    _check_spec(doc_type, substantive_lines, reasons)

    return {
        "useful": len(reasons) == 0,
        "placeholder_count": len(placeholder_hits),
        "substantive_line_count": len(substantive_lines),
        "reasons": reasons,
    }
