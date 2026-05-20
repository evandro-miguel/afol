#!/usr/bin/env python3
"""
Add missing YAML frontmatter to markdown files.

Usage:
    python fix-lint-frontmatter.py <file> [file...]

Examples:
    python fix-lint-frontmatter.py docs/standards/scripts-usage.md
    python fix-lint-frontmatter.py --doc-type tool-doc docs/agentic/*.md
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path


def generate_frontmatter(file_path: Path, doc_type: str = None) -> str:
    """Generate YAML frontmatter for a file."""
    # Extract info from filename
    filename = file_path.stem
    parent_dir = file_path.parent.name

    # Try to extract ID from filename pattern: YYMMDD_HHMM_theme_type_NN
    match = re.match(r"(\d{6}_\d{4})_(.+)_(\w+)_(\d+)", filename)

    if match:
        timestamp, theme, doc_type_from_name, num = match.groups()
        id_value = f"{timestamp}_{theme}_{doc_type_from_name}_{num}"
        theme_value = theme
        type_value = doc_type or doc_type_from_name
    else:
        # Generate ID from filename
        id_value = filename.replace("_", "-").lower()
        theme_value = parent_dir if parent_dir != "a-docs" else "docs"
        type_value = doc_type or "standard"

    now = datetime.now().astimezone().isoformat(timespec="seconds")

    frontmatter = f"""---
doc_type: {type_value}
id: {id_value}
theme: {theme_value}
status: active
created_at: '{now}'
updated_at: '{now}'
---

"""
    return frontmatter


def add_frontmatter(file_path: Path, doc_type: str = None, dry_run: bool = False) -> dict:
    """Add frontmatter to a file if it doesn't have one."""
    result = {"file": str(file_path), "added": False, "error": None}

    try:
        content = file_path.read_text(encoding="utf-8")

        # Check if already has frontmatter
        if content.strip().startswith("---"):
            result["error"] = "Already has frontmatter"
            return result

        # Generate and prepend frontmatter
        frontmatter = generate_frontmatter(file_path, doc_type)
        new_content = frontmatter + content

        if not dry_run:
            file_path.write_text(new_content, encoding="utf-8")

        result["added"] = True
    except Exception as e:
        result["error"] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(description="Add missing YAML frontmatter to markdown files")
    parser.add_argument("files", nargs="+", help="Markdown files to process")
    parser.add_argument(
        "--doc-type",
        "-t",
        default=None,
        help="Override doc_type (default: auto-detect from filename)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be done without modifying files"
    )

    args = parser.parse_args()

    print(f"Processing {len(args.files)} files...")
    if args.dry_run:
        print("(DRY RUN - no files will be modified)\n")

    added_count = 0
    skipped_count = 0

    for file_str in args.files:
        file_path = (
            Path(file_path_str) if (file_path_str := file_str).endswith(".md") else Path(file_str)
        )
        if not file_path.exists():
            print(f"  ✗ {file_str}: File not found")
            continue

        if file_path.suffix != ".md":
            print(f"  ⊘ {file_str}: Not a markdown file")
            continue

        result = add_frontmatter(file_path, doc_type=args.doc_type, dry_run=args.dry_run)

        if result["error"]:
            print(f"  ⊘ {result['file']}: {result['error']}")
            skipped_count += 1
        elif result["added"]:
            added_count += 1
            action = "Would add" if args.dry_run else "Added"
            print(f"  ✓ {result['file']}: {action} frontmatter")

    print(f"\n{'=' * 60}")
    print(f"Frontmatter added: {added_count}")
    print(f"Skipped (already present): {skipped_count}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
