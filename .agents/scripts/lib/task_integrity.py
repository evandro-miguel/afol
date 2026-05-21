#!/usr/bin/env python3
"""Shared integrity checks for task and plan primary entries."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from lib.markdown_docs import parse_markdown_doc


SECTION_RE_TEMPLATE = r"^##\s+{heading}\s*$\n(?P<body>.*?)(?=^##\s+|\Z)"
TASK_LINE_RE = re.compile(r"^\s*-\s\[( |/|%|&|!|>|x)\]\s+(T-\d{2,3})\s+(.+?)\s*$")
PLAN_STEP_RE = re.compile(r"^\s*(?:\d+\.\s+|-\s+)(.+?)\s*$")
TASK_BOARD_ROW_RE = re.compile(r"^\s*\|\s*(T-\d{2,3})\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|")
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
PLACEHOLDER_TASK_RE = re.compile(r"^\s*(?:<note>|<task description>|todo|tbd)\s*$", re.IGNORECASE)
SIDECAR_DOC_TYPES = {"research", "brainstorm", "explorer-check"}
SIDECAR_REQUIRED_LABELS = {
    "Blocking question": re.compile(r"^\s*-\s*Blocking question:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    "Decision produced": re.compile(r"^\s*-\s*Decision produced:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    "Execution task affected": re.compile(r"^\s*-\s*Execution task affected:\s*(T-\d{2,3})\s*$", re.IGNORECASE | re.MULTILINE),
    "Stop condition": re.compile(r"^\s*-\s*Stop condition:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
}


class TaskIntegrityError(ValueError):
    """Raised when plan/task text is not executable enough to persist."""


def _section_body(body: str, heading: str) -> str:
    pattern = re.compile(
        SECTION_RE_TEMPLATE.format(heading=re.escape(heading)),
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(body)
    return match.group("body") if match else ""


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


def _load_frontmatter_docs(session_dir: Path) -> List[Dict[str, Any]]:
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


def _iter_docs(source: Path | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if isinstance(source, Path):
        return _load_frontmatter_docs(source)
    return list(source)


def _is_placeholder_value(value: str) -> bool:
    stripped = str(value or "").strip()
    return not stripped or stripped.upper() in {"N/A", "NA", "NONE"} or "<" in stripped or ">" in stripped


def is_meta_planning_text(text: str) -> bool:
    normalized = " ".join(str(text or "").split())
    return bool(normalized and any(pattern.search(normalized) for pattern in META_TASK_PATTERNS))


def validate_task_text(text: str, source: str = "task") -> None:
    normalized = " ".join(str(text or "").split())
    if not normalized:
        raise TaskIntegrityError(f"{source} requires executable task text")
    if PLACEHOLDER_TASK_RE.match(normalized):
        raise TaskIntegrityError(f"{source} contains placeholder task text: '{normalized}'")
    if is_meta_planning_text(normalized):
        raise TaskIntegrityError(f"{source} contains meta-planning task text: '{normalized}'")


def validate_task_board(body: str, source: str = "task board") -> None:
    doc = {"name": source, "fm": {"doc_type": "task"}, "body": body}
    rows = _collect_primary_task_lines(doc)
    if not rows:
        raise TaskIntegrityError(f"{source} requires at least one executable task")
    for line_num, text in rows:
        validate_task_text(text, f"{source}:line {line_num}")


def validate_plan_concrete_steps(body: str, source: str = "plan") -> None:
    doc = {"name": source, "fm": {"doc_type": "plan"}, "body": body}
    for line_num, text in _collect_primary_task_lines(doc):
        validate_task_text(text, f"{source}:step {line_num or '?'}")


def check_meta_task_integrity(session_dir: Path | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reject plan/task artifacts that use primary tasks for meta-planning."""
    issues: List[Dict[str, Any]] = []

    for doc in _iter_docs(session_dir):
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


def check_sidecar_justification_integrity(source: Path | Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reject optional sidecars that do not justify the execution task they affect."""
    issues: List[Dict[str, Any]] = []
    for doc in _iter_docs(source):
        doc_type = str(doc["fm"].get("doc_type", "")).strip()
        if doc_type not in SIDECAR_DOC_TYPES:
            continue

        section = _section_body(doc["body"], "Sidecar Justification")
        if not section:
            issues.append(
                {
                    "type": "sidecar_justification",
                    "severity": "error",
                    "document": doc["name"],
                    "description": f"{doc_type} sidecar is missing Sidecar Justification",
                }
            )
            continue

        missing: list[str] = []
        for label, pattern in SIDECAR_REQUIRED_LABELS.items():
            match = pattern.search(section)
            if not match or _is_placeholder_value(match.group(1)):
                missing.append(label)
        if missing:
            issues.append(
                {
                    "type": "sidecar_justification",
                    "severity": "error",
                    "document": doc["name"],
                    "description": f"{doc_type} sidecar has incomplete Sidecar Justification: {', '.join(missing)}",
                }
            )
    return issues
