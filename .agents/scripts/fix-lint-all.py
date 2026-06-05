#!/usr/bin/env python3
"""
Fix all common lint issues in markdown files.

This is a unified script that runs all fix operations:
1. Fix missing separators after checkbox markers
2. Add missing frontmatter
3. Update validator for new doc_types

Usage:
    python fix-lint-all.py [--dry-run] [--check]

Examples:
    python fix-lint-all.py --dry-run     # Preview fixes
    python fix-lint-all.py               # Apply all fixes
    python fix-lint-all.py --check       # Check if fixes needed
"""

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path


class LintFixer:
    """Main class for fixing lint issues."""

    def __init__(self, base_dir: str, dry_run: bool = False, check_only: bool = False):
        self.base_dir = Path(base_dir)
        self.dry_run = dry_run
        self.check_only = check_only
        self.stats = {
            "checkbox_fixed": 0,
            "frontmatter_added": 0,
            "files_processed": 0,
            "errors": 0,
        }

    def find_files(self) -> list[Path]:
        """Find all markdown files, excluding common directories and known example files."""
        excluded_dirs = {".venv", "node_modules", ".git", "cache", "__pycache__"}
        excluded_files = {
            "checkbox-protocol.md",  # Contains intentional examples
            "task.md",  # Template with example state board
        }
        excluded_patterns = ["**/templates/**", "**/rules/**"]
        files = []

        for f in self.base_dir.rglob("*.md"):
            # Check directory exclusions
            if any(excl in str(f) for excl in excluded_dirs):
                continue

            # Check file name exclusions
            if f.name in excluded_files:
                continue

            # Check pattern exclusions
            if any(pattern in str(f) for pattern in excluded_patterns):
                continue

            files.append(f)

        return files

    def fix_checkbox(self, content: str) -> tuple[str, int]:
        """Fix missing separators after checkbox markers."""
        pattern = r"^(\s*-\s*\[[ xX/!>%]\])(\S)"
        count = 0

        def replacer(match):
            nonlocal count
            count += 1
            return match.group(1) + " " + match.group(2)

        fixed = re.sub(pattern, replacer, content, flags=re.MULTILINE)
        return fixed, count

    def has_frontmatter(self, content: str) -> bool:
        """Check if content has YAML frontmatter."""
        return content.strip().startswith("---")

    def generate_frontmatter(self, file_path: Path) -> str:
        """Generate YAML frontmatter for a file."""
        filename = file_path.stem
        parent_dir = file_path.parent.name

        # Try to extract structured info from filename
        match = re.match(r"(\d{6}_\d{4})_(.+)_(\w+)_(\d+)", filename)

        if match:
            timestamp, theme, doc_type, num = match.groups()
            id_value = f"{timestamp}_{theme}_{doc_type}_{num}"
            theme_value = theme
            type_value = doc_type
        else:
            id_value = filename.replace("_", "-").lower()
            theme_value = parent_dir if parent_dir not in ["a-docs", "docs"] else "docs"
            # Infer type from directory
            if "agentic" in str(file_path):
                type_value = "tool-doc"
            elif "templates" in str(file_path):
                type_value = "template"
            elif "standards" in str(file_path):
                type_value = "standard"
            elif "rules" in str(file_path):
                type_value = "rule"
            else:
                type_value = "standard"

        now = datetime.now().astimezone().isoformat(timespec="seconds")

        return f"""---
doc_type: {type_value}
id: {id_value}
theme: {theme_value}
status: active
created_at: '{now}'
updated_at: '{now}'
---

"""

    def process_file(self, file_path: Path) -> dict:
        """Process a single file and return results."""
        result = {
            "file": str(file_path),
            "checkbox_fixes": 0,
            "frontmatter_added": False,
            "errors": [],
        }

        try:
            content = file_path.read_text(encoding="utf-8")
            original_content = content

            # Fix checkboxes
            content, checkbox_count = self.fix_checkbox(content)
            result["checkbox_fixes"] = checkbox_count

            # Add frontmatter if missing
            if not self.has_frontmatter(content):
                frontmatter = self.generate_frontmatter(file_path)
                content = frontmatter + content
                result["frontmatter_added"] = True

            # Write if changed and not dry-run/check
            if content != original_content:
                if not self.dry_run and not self.check_only:
                    file_path.write_text(content, encoding="utf-8")

                self.stats["files_processed"] += 1

            self.stats["checkbox_fixed"] += checkbox_count
            if result["frontmatter_added"]:
                self.stats["frontmatter_added"] += 1

        except Exception as e:
            result["errors"].append(str(e))
            self.stats["errors"] += 1

        return result

    def _mode_label(self) -> str:
        """Return the current execution mode label."""
        if self.check_only:
            return "CHECK"
        if self.dry_run:
            return "DRY RUN"
        return "APPLY"

    def _has_fixable_changes(self) -> bool:
        """Return whether any non-error lint fix was detected."""
        return self.stats["checkbox_fixed"] > 0 or self.stats["frontmatter_added"] > 0

    def _is_reportable_result(self, result: dict) -> bool:
        """Return whether a file result should be printed."""
        return (
            result["checkbox_fixes"] > 0
            or result["frontmatter_added"]
            or bool(result["errors"])
        )

    def _result_status_lines(self, result: dict) -> list[str]:
        """Build human-readable status lines for one file result."""
        status = []
        preview_mode = self.dry_run or self.check_only

        if result["checkbox_fixes"] > 0:
            action = "Would fix" if preview_mode else "Fixed"
            status.append(f"{action} {result['checkbox_fixes']} checkbox(es)")
        if result["frontmatter_added"]:
            action = "Would add" if preview_mode else "Added"
            status.append(f"{action} frontmatter")
        if result["errors"]:
            status.append(f"Errors: {', '.join(result['errors'])}")

        return status

    def _collect_results(self, files: list[Path]) -> list[dict]:
        """Process files and return only reportable results."""
        results = []
        for file_path in files:
            result = self.process_file(file_path)
            if self._is_reportable_result(result):
                results.append(result)
        return results

    def _print_header(self, file_count: int) -> None:
        """Print run header."""
        print(f"{'=' * 60}")
        print(f"Lint Fix - Mode: {self._mode_label()}")
        print(f"{'=' * 60}\n")
        print(f"Files to process: {file_count}\n")

    def _print_results(self, results: list[dict]) -> None:
        """Print per-file results."""
        print(f"{'=' * 60}")
        print("RESULTS")
        print(f"{'=' * 60}")

        if results:
            for result in results:
                print(f"  {result['file']}")
                for status in self._result_status_lines(result):
                    print(f"    - {status}")
            print()

    def _print_summary(self) -> None:
        """Print aggregate run summary."""
        print(f"{'=' * 60}")
        print("SUMMARY")
        print(f"{'=' * 60}")
        print(f"Files with changes: {self.stats['files_processed']}")
        print(f"Checkboxes fixed: {self.stats['checkbox_fixed']}")
        print(f"Frontmatter added: {self.stats['frontmatter_added']}")
        print(f"Errors: {self.stats['errors']}")

    def _exit_code(self) -> int:
        """Return process exit code for the current run mode."""
        if self.check_only and self._has_fixable_changes():
            print("\n⚠️  Lint issues found. Run without --check to fix.")
            return 1
        if self.dry_run and self._has_fixable_changes():
            print("\nℹ️  Run without --dry-run to apply fixes.")
        return 0

    def run(self):
        """Run all fixes."""
        files = self.find_files()

        if not files:
            print("No markdown files found.")
            return 0

        self._print_header(len(files))
        results = self._collect_results(files)
        self._print_results(results)
        self._print_summary()
        return self._exit_code()


def main():
    parser = argparse.ArgumentParser(
        description="Fix all common lint issues in markdown files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python fix-lint-all.py --check       Check for issues without fixing
  python fix-lint-all.py --dry-run     Preview fixes
  python fix-lint-all.py               Apply all fixes
  python fix-lint-all.py docs/standards/  Fix specific directory
        """,
    )
    parser.add_argument(
        "directory", nargs="?", default=".agents", help="Directory to process (default: .agents)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview fixes without modifying files"
    )
    parser.add_argument(
        "--check", action="store_true", help="Check for issues (exit code 1 if fixes needed)"
    )

    args = parser.parse_args()

    fixer = LintFixer(args.directory, dry_run=args.dry_run, check_only=args.check)
    return fixer.run()


if __name__ == "__main__":
    sys.exit(main())
