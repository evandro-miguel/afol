"""Validation helpers for postmortem governance review sections."""

from __future__ import annotations

import re
from typing import Dict, List

POSTMORTEM_GOVERNANCE_SECTION = "Governance Promotion Review"
POSTMORTEM_GOVERNANCE_FIELDS = (
    "Lesson entry needed",
    "Rule update needed",
    "ADR or decision record needed",
    "Skill or doc update needed",
    "Evidence reviewed",
    "Follow-up recorded",
)
_SECTION_HEADER_RE = re.compile(r"^##\s+")
_REVIEW_LINE_RE = re.compile(r"^- ([^:]+):\s*(.+?)\s*$")
_PLACEHOLDER_RE = re.compile(r"<[^>\n]+>")


def extract_markdown_section(body: str, heading: str) -> str:
    """Return the body of a second-level markdown section or an empty string."""
    lines = body.splitlines()
    header = f"## {heading}"
    start = None
    end = len(lines)
    for idx, line in enumerate(lines):
        if line.strip() == header:
            start = idx + 1
            break
    if start is None:
        return ""
    for idx in range(start, len(lines)):
        if _SECTION_HEADER_RE.match(lines[idx]):
            end = idx
            break
    return "\n".join(lines[start:end]).strip()


def parse_governance_review(section_body: str) -> Dict[str, str]:
    """Parse `- Label: value` review lines into a label/value map."""
    parsed: Dict[str, str] = {}
    for raw_line in section_body.splitlines():
        match = _REVIEW_LINE_RE.match(raw_line.strip())
        if not match:
            continue
        parsed[match.group(1).strip()] = match.group(2).strip()
    return parsed


def postmortem_governance_review_issues(body: str) -> List[str]:
    """Return validation issues for the governance review section."""
    section_body = extract_markdown_section(body, POSTMORTEM_GOVERNANCE_SECTION)
    if not section_body:
        return [f"missing '## {POSTMORTEM_GOVERNANCE_SECTION}' section"]

    parsed = parse_governance_review(section_body)
    issues: List[str] = []
    for field in POSTMORTEM_GOVERNANCE_FIELDS:
        value = parsed.get(field, "")
        if not value:
            issues.append(f"missing '{field}' review line")
            continue
        if _PLACEHOLDER_RE.search(value):
            issues.append(f"field '{field}' still contains an unresolved placeholder")
    return issues
