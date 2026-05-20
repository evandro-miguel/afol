#!/usr/bin/env python3
"""Small helpers for markdown documents with YAML frontmatter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - exercised by callers that gate on None
    yaml = None


def split_markdown_frontmatter(content: str) -> tuple[dict[str, Any], str] | None:
    """Return frontmatter and body for markdown text when present."""
    if not content.startswith("---\n") or yaml is None:
        return None

    parts = content.split("---", 2)
    if len(parts) < 3:
        return None

    try:
        frontmatter = yaml.safe_load(parts[1].strip())
    except yaml.YAMLError:
        return None

    if not isinstance(frontmatter, dict):
        return None

    return frontmatter, parts[2].lstrip("\n")


def parse_markdown_doc(doc_file: Path) -> tuple[dict[str, Any], str, str] | None:
    """Return parsed frontmatter, body, and raw content for a markdown doc."""
    content = doc_file.read_text(encoding="utf-8")
    parsed = split_markdown_frontmatter(content)
    if parsed is None:
        return None
    frontmatter, body = parsed
    return frontmatter, body, content
