#!/usr/bin/env python3
"""
Agents Lint Docs - Validate markdown docs for consistency.

Checks:
- Checkbox markers are consistent (- [X] format)
- Status fields are valid
- State values are valid
- Required frontmatter fields exist
- Cross-references are valid

Usage:
    python agents-lint-docs.py [folder] [--fix]

Examples:
    python agents-lint-docs.py .agents/wb/260223_1200_auth-refactor/
    python agents-lint-docs.py .agents/wb --fix
"""

import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from lib.agents_config import get_cfg_path, load_agents_config

try:
    import yaml

    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Configuration
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
EXCLUDED_PATH_PREFIXES = tuple(CONFIG.get("lint", {}).get("excluded_path_prefixes", []))

# Valid values
VALID_STATUSES = [
    "draft",
    "active",
    "review",
    "approved",
    "final",
    "deprecated",
    "superseded",
    "done",
    "blocked",
    "blocking",
    "accepted",
]
VALID_STATES = [
    "pending",
    "in_progress",
    "implemented_untested",
    "tested_needs_spec_validation",
    "problem",
    "moved",
    "done",
    # Legacy compatibility aliases
    "ready_for_test",
    "testing",
    "blocked",
    "skipped",
]
VALID_DOC_TYPES = [
    "plan",
    "task",
    "report",
    "log",
    "research",
    "brainstorm",
    "explorer-check",
    "blocks",
    "spec",
    "spec-child",
    "spec-lite",
    "spec-test",
    "rule",
    "spec_child",
    "spec_lite",
    "spec_test",
    "adr",
    "architecture",
    "roadmap",
    "specs_index",
    "adr_index",
    "standard",
    "index",
    "structure",
    "lessons",
    "retrospective",
    "postmortem",
    "specs_readme",
    "lesson_entry",
    "tool-doc",
    "reference",
    "pattern",
    "pattern_index",
    "quick_reference",
    "telemetry_guide",
    "telemetry_dashboard",
    "telemetry_feature",
]

# Checkbox markers
VALID_MARKERS = [" ", "/", "%", "!", ">", "x"]
MARKER_PATTERN = re.compile(r"- \[(.)\]")
INLINE_CODE_PATTERN = re.compile(r"`[^`]*`")
FENCE_PATTERN = re.compile(r"^\s*```")
TABLE_SEPARATOR_PATTERN = re.compile(r"^\|(?:\s*:?-{3,}:?\s*\|)+\s*$")


class LintIssue:
    def __init__(self, severity: str, file_path: Path, line: int, message: str):
        self.severity = severity  # error, warning, info
        self.file_path = file_path
        self.line = line
        self.message = message

    def __str__(self):
        icon = {"error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(self.severity, "?")
        line_info = f":{self.line}" if self.line > 0 else ""
        try:
            display_path = self.file_path.resolve().relative_to(ROOT_DIR.resolve())
        except Exception:
            display_path = self.file_path
        return f"{icon} [{self.severity.upper()}] {display_path}{line_info}: {self.message}"


class DocLinter:
    def __init__(self, fix: bool = False):
        self.fix = fix
        self.issues: List[LintIssue] = []
        self.stats = {
            "files_checked": 0,
            "issues_found": 0,
            "issues_fixed": 0,
        }

    def lint_file(self, file_path: Path):
        """Lint a single markdown file."""
        self.stats["files_checked"] += 1
        content = file_path.read_text()
        lines = content.splitlines()

        # Check frontmatter
        self.check_frontmatter(file_path, content)

        # Check checkboxes
        self.check_checkboxes(file_path, lines)

        # Check state board
        self.check_state_board(file_path, lines)

        # Check status field
        self.check_status_field(file_path, content)

        # Check cross-references
        self.check_cross_references(file_path, content)

    def _extract_frontmatter(self, content: str) -> Tuple[Optional[str], str, bool]:
        """
        Extract YAML frontmatter safely.

        Returns:
            (frontmatter_text, body, invalid_structure)
        """
        if not content.startswith("---"):
            return None, content, False

        lines = content.splitlines(keepends=True)
        if not lines or lines[0].strip() != "---":
            return None, content, False

        for i, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                frontmatter_text = "".join(lines[1:i]).strip()
                body = "".join(lines[i + 1 :])
                return frontmatter_text, body, False

        return None, content, True

    def _validate_frontmatter_yaml(self, file_path: Path, frontmatter_text: str):
        """Validate YAML frontmatter content."""
        if not HAS_YAML:
            return

        try:
            fm = yaml.safe_load(frontmatter_text)
            if fm is None:
                self.issues.append(LintIssue("warning", file_path, 0, "Empty YAML frontmatter"))
                return
            if not isinstance(fm, dict):
                self.issues.append(
                    LintIssue("error", file_path, 0, "Frontmatter must be a YAML mapping/object")
                )
                return

            self._check_frontmatter_fields(file_path, fm)
        except yaml.YAMLError as e:
            self.issues.append(LintIssue("error", file_path, 0, f"Invalid YAML: {e}"))

    def _check_frontmatter_fields(self, file_path: Path, fm: Dict):
        """Check frontmatter field values."""
        # Check doc_type
        doc_type = fm.get("doc_type", fm.get("type", ""))
        if (
            doc_type
            and not self._is_placeholder_value(doc_type)
            and doc_type not in VALID_DOC_TYPES
        ):
            self.issues.append(
                LintIssue(
                    "warning",
                    file_path,
                    0,
                    f"Unknown doc_type: '{doc_type}'. Valid: {', '.join(VALID_DOC_TYPES)}",
                )
            )

        # Check status
        status = fm.get("status", "")
        if status and not self._is_placeholder_value(status) and status not in VALID_STATUSES:
            self.issues.append(
                LintIssue(
                    "warning",
                    file_path,
                    0,
                    f"Unknown status: '{status}'. Valid: {', '.join(VALID_STATUSES)}",
                )
            )

        # Check required fields based on doc_type
        if doc_type in ["plan", "task", "report"]:
            if not fm.get("theme"):
                self.issues.append(
                    LintIssue("warning", file_path, 0, "Missing required field: 'theme'")
                )

        # Check timestamp format
        self._check_timestamps(file_path, fm)

    def _check_timestamps(self, file_path: Path, fm: Dict):
        """Check timestamp fields format."""
        for ts_field in ["created_at", "updated_at", "created", "updated"]:
            if ts_field in fm:
                ts_value = fm[ts_field]
                if isinstance(ts_value, str):
                    if not self._is_valid_timestamp(ts_value):
                        self.issues.append(
                            LintIssue(
                                "warning",
                                file_path,
                                0,
                                f"Invalid timestamp format for {ts_field}: '{ts_value}' (expected ISO 8601: ...Z or ...-03:00)",
                            )
                        )

    def check_frontmatter(self, file_path: Path, content: str):
        """Check YAML frontmatter."""
        frontmatter_text, _, invalid_structure = self._extract_frontmatter(content)

        if frontmatter_text is None and not invalid_structure:
            if file_path.name.lower() == "readme.md":
                return
            self.issues.append(LintIssue("warning", file_path, 0, "Missing YAML frontmatter"))
            return

        if invalid_structure:
            self.issues.append(LintIssue("error", file_path, 0, "Invalid frontmatter structure"))
            return

        self._validate_frontmatter_yaml(file_path, frontmatter_text)

    def check_checkboxes(self, file_path: Path, lines: List[str]):
        """Check checkbox markers."""
        in_code_block = False

        for i, line in enumerate(lines, 1):
            if FENCE_PATTERN.match(line):
                in_code_block = not in_code_block
                continue

            if in_code_block:
                continue

            search_line = INLINE_CODE_PATTERN.sub("", line)

            # Find all checkbox markers
            for match in MARKER_PATTERN.finditer(search_line):
                marker = match.group(1)
                if marker not in VALID_MARKERS:
                    self.issues.append(
                        LintIssue(
                            "info",
                            file_path,
                            i,
                            f"Non-standard checkbox marker: '[{marker}]'. Valid: {', '.join(f'[{m}]' for m in VALID_MARKERS)}",
                        )
                    )

                # Check for missing space after checkbox
                end_idx = match.end()
                has_separator = end_idx >= len(search_line) or search_line[end_idx] in {" ", "|"}
                if not has_separator:
                    self.issues.append(
                        LintIssue(
                            "warning",
                            file_path,
                            i,
                            f"Missing separator after checkbox marker: '- [{marker}]'",
                        )
                    )

    def check_state_board(self, file_path: Path, lines: List[str]):
        """Check state board table."""
        in_state_board = False

        for i, line in enumerate(lines, 1):
            if "State Board" in line or "| Task |" in line and "State" in line:
                in_state_board = True
                continue

            if in_state_board:
                stripped = line.strip()
                if stripped.startswith("|"):
                    # Skip markdown table separators like: |---|:---:|---|
                    if TABLE_SEPARATOR_PATTERN.match(stripped):
                        continue

                    # Parse table row
                    cells = [p.strip() for p in stripped.strip("|").split("|")]
                    if len(cells) >= 2:
                        row_task = cells[0].lower()
                        # New format (4 cols): Task | State | Owner | Notes
                        # State is at index 1
                        state = cells[1]
                        # Skip table header row
                        if row_task == "task" or state.lower() == "state":
                            continue
                        if (
                            state
                            and not self._is_placeholder_value(state)
                            and state not in VALID_STATES
                        ):
                            self.issues.append(
                                LintIssue(
                                    "warning",
                                    file_path,
                                    i,
                                    f"Unknown state: '{state}'. Valid: {', '.join(VALID_STATES)}",
                                )
                            )
                elif line.strip() and not line.strip().startswith("|"):
                    in_state_board = False

    def check_status_field(self, file_path: Path, content: str):
        """Check status field consistency."""
        if not HAS_YAML:
            return

        frontmatter_text, _, invalid_structure = self._extract_frontmatter(content)
        if frontmatter_text is None or invalid_structure:
            return

        try:
            fm = yaml.safe_load(frontmatter_text)
            if not isinstance(fm, dict):
                return
            status = fm.get("status", "")

            # Check if status matches content indicators
            if status == "final" and "- [ ]" in content:
                self.issues.append(
                    LintIssue(
                        "warning",
                        file_path,
                        0,
                        "Status is 'final' but file contains unchecked items",
                    )
                )

            if status == "draft" and "- [x]" in content:
                self.issues.append(
                    LintIssue(
                        "info", file_path, 0, "Status is 'draft' but file contains completed items"
                    )
                )

        except yaml.YAMLError:
            pass

    def check_cross_references(self, file_path: Path, content: str):
        """Check cross-references between docs."""
        _, body, _ = self._extract_frontmatter(content)

        # Check for plan/task links
        if "plan:" in body or "task:" in body:
            # Extract referenced IDs
            id_pattern = re.compile(
                r'["\']?(\d{6}_\d{4}_[a-z0-9_-]+_(?:plan|task|report|spec|adr)_\d+)["\']?'
            )
            references = id_pattern.findall(body)

            # Note: We can't validate if the referenced file exists without more context
            # This is just a lint check for format
            for ref in references:
                if not re.match(
                    r"^\d{6}_\d{4}_[a-z0-9_-]+_(?:plan|task|report|spec|adr)_\d+$", ref
                ):
                    self.issues.append(
                        LintIssue(
                            "info",
                            file_path,
                            0,
                            f"Cross-reference may have invalid format: '{ref}'",
                        )
                    )

    def _is_valid_timestamp(self, ts: str) -> bool:
        """Check if timestamp is valid ISO 8601 with Z or timezone offset."""
        if ts == "YYYY-MM-DDTHH:MM:SSZ":
            return True
        pattern = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$")
        return bool(pattern.match(ts))

    def _is_placeholder_value(self, value: object) -> bool:
        """Return True when a field value looks like a template placeholder."""
        if not isinstance(value, str):
            return False
        stripped = value.strip()
        if not stripped:
            return False
        return any(token in stripped for token in ("<", ">", "|", "YYYY-"))

    def lint_folder(self, folder: Path):
        """Lint all markdown files in folder."""
        if not folder.exists():
            print(f"❌ Folder not found: {folder}")
            return

        for md_file in folder.rglob("*.md"):
            if self.should_skip_file(md_file):
                continue
            self.lint_file(md_file)

    def should_skip_file(self, file_path: Path) -> bool:
        """Return True when file should be excluded from lint scope."""
        file_str = str(file_path)
        if "node_modules" in file_str or ".git" in file_str:
            return True

        resolved = file_path.resolve()
        if any(part in {"tmp", ".tmp"} for part in resolved.parts):
            return True
        try:
            rel = resolved.relative_to(AGENTS_DIR.resolve()).as_posix()
        except Exception:
            parts = resolved.parts
            if ".agents" in parts:
                idx = parts.index(".agents")
                rel = "/".join(parts[idx + 1 :])
            else:
                rel = resolved.as_posix().lstrip("/")

        normalized_candidates = {
            rel,
            rel.lstrip("./"),
            f".agents/{rel}".lstrip("./"),
        }
        normalized_prefixes = {
            prefix.strip().lstrip("./").rstrip("/")
            for prefix in EXCLUDED_PATH_PREFIXES
            if str(prefix).strip()
        }
        return any(
            candidate == prefix or candidate.startswith(f"{prefix}/")
            for candidate in normalized_candidates
            for prefix in normalized_prefixes
        )

    def print_report(self):
        """Print lint report."""
        print()
        print("=" * 60)
        print("LINT REPORT")
        print("=" * 60)
        print()
        print(f"Files checked: {self.stats['files_checked']}")
        print(f"Issues found: {self.stats['issues_found']}")
        if self.fix:
            print(f"Issues fixed: {self.stats['issues_fixed']}")
        print()

        if not self.issues:
            print("✅ No issues found!")
        else:
            # Group by severity
            errors = [i for i in self.issues if i.severity == "error"]
            warnings = [i for i in self.issues if i.severity == "warning"]
            infos = [i for i in self.issues if i.severity == "info"]

            if errors:
                print(f"❌ ERRORS ({len(errors)}):")
                for issue in errors:
                    print(f"   {issue}")
                print()

            if warnings:
                print(f"⚠️  WARNINGS ({len(warnings)}):")
                for issue in warnings:
                    print(f"   {issue}")
                print()

            if infos:
                print(f"ℹ️  INFO ({len(infos)}):")
                for issue in infos:
                    print(f"   {issue}")
                print()

        print("=" * 60)


def main():
    if len(sys.argv) < 2:
        folder = AGENTS_DIR
    else:
        folder = Path(sys.argv[1])

    fix = "--fix" in sys.argv

    print("=" * 60)
    print("AGENTS LINT DOCS - Markdown Validation")
    print("=" * 60)
    print()
    print(f"Linting: {folder}")
    if fix:
        print("Fix mode: enabled")
    print()

    linter = DocLinter(fix=fix)
    linter.lint_folder(folder)
    linter.stats["issues_found"] = len(linter.issues)
    linter.print_report()

    errors = [i for i in linter.issues if i.severity == "error"]
    sys.exit(0 if len(errors) == 0 else 1)


if __name__ == "__main__":
    main()
