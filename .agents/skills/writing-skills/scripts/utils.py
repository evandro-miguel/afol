#!/usr/bin/env python3
"""Utility functions for skill evaluation scripts."""

import re
from pathlib import Path
from typing import Any


def parse_skill_md(skill_path: str) -> dict[str, Any]:
    """Parse SKILL.md and extract metadata.

    Returns:
        dict with name, description, metadata tags/triggers/references
    """
    path = Path(skill_path)
    if not path.exists():
        raise FileNotFoundError(f"Skill not found: {skill_path}")

    content = path.read_text()

    # Extract frontmatter
    frontmatter_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not frontmatter_match:
        raise ValueError("No frontmatter found in SKILL.md")

    frontmatter = frontmatter_match.group(1)

    # Parse fields
    result = {}

    # name
    name_match = re.search(r"^name:\s*(.+)$", frontmatter, re.MULTILINE)
    result["name"] = name_match.group(1).strip() if name_match else None

    # description
    desc_match = re.search(r"^description:\s*(.+)$", frontmatter, re.MULTILINE)
    result["description"] = desc_match.group(1).strip() if desc_match else None

    # metadata
    result["metadata"] = {}
    metadata_match = re.search(r"^metadata:\s*\n(.*?)(?=\n\S|\Z)", frontmatter, re.DOTALL)
    if metadata_match:
        metadata_content = metadata_match.group(1)
        for key in ["tags", "triggers", "references", "category"]:
            key_match = re.search(rf"^{key}:\s*(.+)$", metadata_content, re.MULTILINE)
            if key_match:
                result["metadata"][key] = key_match.group(1).strip()

    return result


def validate_skill_structure(skill_path: str, tier: int) -> list[str]:
    """Validate skill structure matches tier requirements.

    Returns list of validation errors (empty if valid).
    """
    errors = []
    path = Path(skill_path)

    if not path.exists():
        return [f"Skill path does not exist: {skill_path}"]

    # Check SKILL.md exists
    skill_md = path / "SKILL.md"
    if not skill_md.exists():
        errors.append("SKILL.md not found")

    # Tier-specific checks
    if tier >= 2:
        references_dir = path / "references"
        if not references_dir.exists():
            errors.append("Tier 2+ requires references/ directory")

    if tier >= 3:
        # Check for 5-file structure
        required_files = ["README.md", "api.md", "configuration.md", "patterns.md", "gotchas.md"]
        for fname in required_files:
            if not (path / fname).exists():
                errors.append(f"Tier 3 requires {fname}")

    return errors


def csv_to_list(csv_string: str) -> list[str]:
    """Convert CSV string to list."""
    if not csv_string:
        return []
    return [s.strip() for s in csv_string.split(",") if s.strip()]


def list_to_csv(items: list[str]) -> str:
    """Convert list to CSV string."""
    return ", ".join(str(i) for i in items)


def extract_trigger_phrases(description: str) -> list[str]:
    """Extract trigger phrases from description.

    Looks for patterns like:
    - "Use when X"
    - "Invoke for X"
    - "Activate when X"
    """
    phrases = []

    # Pattern: "Use when ..." or similar
    patterns = [
        r"(?:use|invoke|activate|apply)\s+(?:when|for|on)\s+([^,.]+)",
        r"(?:when|if|whenever)\s+(?:the\s+)?(?:user\s+)?(?:mentions|wants|says|asks\s+for)\s+([^,.]+)",
    ]

    for pattern in patterns:
        matches = re.findall(pattern, description, re.IGNORECASE)
        phrases.extend(matches)

    return [p.strip() for p in phrases if p.strip()]


def format_duration(ms: int) -> str:
    """Format milliseconds to human readable."""
    if ms < 1000:
        return f"{ms}ms"
    elif ms < 60000:
        return f"{ms/1000:.1f}s"
    else:
        minutes = ms // 60000
        seconds = (ms % 60000) / 1000
        return f"{minutes}m {seconds:.1f}s"