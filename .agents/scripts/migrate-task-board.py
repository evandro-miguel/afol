#!/usr/bin/env python3
"""
Migrate task files from duplicated Task List + State Board to State Board only.

Usage:
    python3 migrate-task-board.py <task-file.md> [task-file-2.md ...]
    python3 migrate-task-board.py --all  # Migrate all task files in .agents/wb/
"""

import re
import sys
from pathlib import Path


def migrate_task_content(content: str) -> str:
    """Remove Task List section, keep only State Board."""

    # Pattern to match Task List section (from "## Task List" to next "##" or end)
    task_list_pattern = r'\n## Task List\n.+?(?=\n## |\Z)'

    # Remove Task List section
    new_content = re.sub(task_list_pattern, '\n', content, flags=re.DOTALL)

    # Fix State Board header - remove Checklist column
    # Old header: | Task | Checklist | State | Owner | Notes |
    # Old separator: |------|----------:|-------|-------|-------|
    # New header: | Task | State | Owner | Notes |
    # New separator: |------|-------|-------|-------|

    old_header_block = r'\| Task \| Checklist \| State \| Owner \| Notes \|\n\|-+\|[-:|]+\|'
    new_header = '| Task | State | Owner | Notes |\n|------|-------|-------|-------|'
    new_content = re.sub(old_header_block, new_header, new_content)

    # Also handle non-regex exact matches
    new_content = new_content.replace('| Task | Checklist | State | Owner | Notes |', '| Task | State | Owner | Notes |')
    new_content = re.sub(r'\|------\|[-:|]+\|', '|------|-------|-------|-------|', new_content)

    # Remove checklist column from rows (e.g., "| T-01 | - [x] | done |" -> "| T-01 | done |")
    old_row_pattern = r'\| (T-\d+) \| - \[[ x/]\] \|'
    new_row_pattern = r'| \1 |'
    new_content = re.sub(old_row_pattern, new_row_pattern, new_content)

    # Clean up the old State values list (we'll use inline format)
    state_values_block = r'\nState values:\n(- .+\n)+'
    new_content = re.sub(state_values_block, '\n', new_content)

    # Clean up old Task ID format block
    task_id_block = r'\nTask ID format:\n(- .+\n)+'
    new_content = re.sub(task_id_block, '\n', new_content)

    # Clean up old State Marker Rules section header
    new_content = new_content.replace('## State Marker Rules\n\nSee:', '**State marker rules:** See')

    return new_content


def migrate_file(file_path: str) -> bool:
    """Migrate a single task file. Returns True if successful."""
    path = Path(file_path)

    if not path.exists():
        print(f"❌ File not found: {file_path}")
        return False

    content = path.read_text()

    # Check if file needs migration (has Task List OR has Checklist column)
    needs_migration = '## Task List' in content or '| Task | Checklist |' in content

    if not needs_migration:
        print(f"⊘ Already migrated: {file_path}")
        return True

    new_content = migrate_task_content(content)
    path.write_text(new_content)
    print(f"✅ Migrated: {file_path}")
    return True


def find_all_task_files() -> list:
    """Find all task files in .agents/wb/."""
    wb_dir = Path('.agents/wb')
    if not wb_dir.exists():
        return []

    task_files = []
    for session_dir in wb_dir.iterdir():
        if session_dir.is_dir() and not session_dir.name.startswith('.'):
            for task_file in session_dir.glob('*_task_*.md'):
                task_files.append(str(task_file))

    return sorted(task_files)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == '--all':
        task_files = find_all_task_files()
        if not task_files:
            print("No task files found in .agents/wb/")
            sys.exit(0)
        print(f"Found {len(task_files)} task file(s)\n")

        success_count = 0
        for task_file in task_files:
            if migrate_file(task_file):
                success_count += 1

        print(f"\n📊 Migration complete: {success_count}/{len(task_files)} files migrated")
    else:
        for file_path in sys.argv[1:]:
            migrate_file(file_path)


if __name__ == '__main__':
    main()
