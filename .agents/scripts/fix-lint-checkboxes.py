#!/usr/bin/env python3
"""
Fix missing separators after checkbox markers in markdown files.

Problem: `- [x]` should be `- [x] ` (with space after)
This script adds the missing space separator.

Usage:
    python fix-lint-checkboxes.py [--dry-run] [file_or_directory...]

Examples:
    python fix-lint-checkboxes.py .agents/a-docs/standards/checkbox-protocol.md
    python fix-lint-checkboxes.py --dry-run .agents/
    python fix-lint-checkboxes.py .agents/rules/
"""

import argparse
import re
import sys
from pathlib import Path


def find_files(paths: list[str]) -> list[Path]:
    """Find all markdown files in given paths."""
    excluded_files = {
        'checkbox-protocol.md',  # Contains intentional examples
        'task.md',  # Template with example state board
    }
    excluded_patterns = ['**/templates/**', '**/rules/**']
    files = []
    for path in paths:
        p = Path(path)
        if p.is_file() and p.suffix == '.md':
            if p.name not in excluded_files and not any(pat in str(p) for pat in excluded_patterns):
                files.append(p)
        elif p.is_dir():
            for f in p.rglob('*.md'):
                if f.name not in excluded_files and not any(pat in str(f) for pat in excluded_patterns):
                    files.append(f)
    return files


def fix_checkbox_separators(content: str) -> tuple[str, int]:
    """
    Fix missing separators after checkbox markers.

    Pattern: `- [x]text` → `- [x] text`
    Works for all checkbox types: [ ], [x], [X], [/], [%], [!], [>]
    """
    # Pattern to match checkbox without following space
    # Matches: - [x]text (no space after ])
    pattern = r'^(\s*-\s*\[[ xX/!>%]\])(\S)'

    count = 0

    def replacer(match):
        nonlocal count
        count += 1
        return match.group(1) + ' ' + match.group(2)

    fixed_content = re.sub(pattern, replacer, content, flags=re.MULTILINE)
    return fixed_content, count


def process_file(file_path: Path, dry_run: bool = False) -> dict:
    """Process a single file and return stats."""
    result = {
        'file': str(file_path),
        'fixed': 0,
        'error': None
    }

    try:
        content = file_path.read_text(encoding='utf-8')
        fixed_content, count = fix_checkbox_separators(content)

        if count > 0:
            result['fixed'] = count
            if not dry_run:
                file_path.write_text(fixed_content, encoding='utf-8')
    except Exception as e:
        result['error'] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(
        description='Fix missing separators after checkbox markers in markdown files'
    )
    parser.add_argument(
        'paths',
        nargs='*',
        default=['.'],
        help='Files or directories to process (default: current directory)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be fixed without modifying files'
    )
    parser.add_argument(
        '--exclude',
        nargs='*',
        default=['.venv', 'node_modules', '.git', 'cache'],
        help='Directories to exclude'
    )

    args = parser.parse_args()

    # Filter paths
    all_files = find_files(args.paths)
    excluded = set(args.exclude)
    files = [
        f for f in all_files
        if not any(excl in str(f) for excl in excluded)
    ]

    if not files:
        print("No markdown files found to process.")
        return 0

    print(f"Processing {len(files)} markdown files...")
    if args.dry_run:
        print("(DRY RUN - no files will be modified)\n")

    total_fixed = 0
    fixed_files = 0

    for file_path in files:
        result = process_file(file_path, dry_run=args.dry_run)

        if result['error']:
            print(f"  ✗ {result['file']}: {result['error']}")
        elif result['fixed'] > 0:
            total_fixed += result['fixed']
            fixed_files += 1
            action = "Would fix" if args.dry_run else "Fixed"
            print(f"  ✓ {result['file']}: {action} {result['fixed']} checkbox(es)")

    print(f"\n{'='*60}")
    print(f"Files processed: {len(files)}")
    print(f"Files with fixes: {fixed_files}")
    print(f"Total checkboxes fixed: {total_fixed}")

    if args.dry_run and total_fixed > 0:
        print("\nRun without --dry-run to apply fixes.")

    return 0


if __name__ == '__main__':
    sys.exit(main())
