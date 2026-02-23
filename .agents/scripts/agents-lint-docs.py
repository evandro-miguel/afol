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

import os
import re
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Tuple, Optional

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Configuration
ROOT_DIR = Path(__file__).parent.parent

# Valid values
VALID_STATUSES = ["draft", "active", "review", "approved", "final", "deprecated", "superseded"]
VALID_STATES = ["pending", "in_progress", "ready_for_test", "testing", "done", "blocked", "skipped"]
VALID_DOC_TYPES = ["plan", "task", "report", "log", "research", "brainstorm", "blocks", "spec", "spec-lite", "adr", "architecture", "roadmap", "specs_index", "adr_index"]

# Checkbox markers
VALID_MARKERS = [" ", "/", "%", "!", ">", "x"]
MARKER_PATTERN = re.compile(r'- \[(.)\]')


class LintIssue:
    def __init__(self, severity: str, file_path: Path, line: int, message: str):
        self.severity = severity  # error, warning, info
        self.file_path = file_path
        self.line = line
        self.message = message
    
    def __str__(self):
        icon = {"error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(self.severity, "?")
        line_info = f":{self.line}" if self.line > 0 else ""
        return f"{icon} [{self.severity.upper()}] {self.file_path.relative_to(ROOT_DIR)}{line_info}: {self.message}"


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
    
    def check_frontmatter(self, file_path: Path, content: str):
        """Check YAML frontmatter."""
        if not content.startswith("---"):
            self.issues.append(LintIssue(
                "warning", file_path, 0,
                "Missing YAML frontmatter"
            ))
            return
        
        parts = content.split("---", 2)
        if len(parts) < 3:
            self.issues.append(LintIssue(
                "error", file_path, 0,
                "Invalid frontmatter structure"
            ))
            return
        
        frontmatter_text = parts[1].strip()
        
        if not HAS_YAML:
            return
        
        try:
            fm = yaml.safe_load(frontmatter_text)
            
            # Check doc_type
            doc_type = fm.get("doc_type", fm.get("type", ""))
            if doc_type and doc_type not in VALID_DOC_TYPES:
                self.issues.append(LintIssue(
                    "warning", file_path, 0,
                    f"Unknown doc_type: '{doc_type}'. Valid: {', '.join(VALID_DOC_TYPES)}"
                ))
            
            # Check status
            status = fm.get("status", "")
            if status and status not in VALID_STATUSES:
                self.issues.append(LintIssue(
                    "warning", file_path, 0,
                    f"Unknown status: '{status}'. Valid: {', '.join(VALID_STATUSES)}"
                ))
            
            # Check required fields based on doc_type
            if doc_type in ["plan", "task", "report"]:
                if not fm.get("theme"):
                    self.issues.append(LintIssue(
                        "warning", file_path, 0,
                        "Missing required field: 'theme'"
                    ))
            
            # Check timestamp format
            for ts_field in ["created_at", "updated_at", "created", "updated"]:
                if ts_field in fm:
                    ts_value = fm[ts_field]
                    if isinstance(ts_value, str):
                        if not self._is_valid_timestamp(ts_value):
                            self.issues.append(LintIssue(
                                "warning", file_path, 0,
                                f"Invalid timestamp format for {ts_field}: '{ts_value}' (expected YYYY-MM-DDTHH:MM:SSZ)"
                            ))
        
        except yaml.YAMLError as e:
            self.issues.append(LintIssue(
                "error", file_path, 0,
                f"Invalid YAML: {e}"
            ))
    
    def check_checkboxes(self, file_path: Path, lines: List[str]):
        """Check checkbox markers."""
        in_code_block = False
        
        for i, line in enumerate(lines, 1):
            if "```" in line:
                in_code_block = not in_code_block
                continue
            
            if in_code_block:
                continue
            
            # Find all checkbox markers
            for match in MARKER_PATTERN.finditer(line):
                marker = match.group(1)
                if marker not in VALID_MARKERS:
                    self.issues.append(LintIssue(
                        "info", file_path, i,
                        f"Non-standard checkbox marker: '[{marker}]'. Valid: {', '.join(f'[{m}]' for m in VALID_MARKERS)}"
                    ))
                
                # Check for missing space after checkbox
                full_match = match.group(0)
                if not full_match.endswith("] "):
                    self.issues.append(LintIssue(
                        "warning", file_path, i,
                        f"Missing space after checkbox: '{full_match}' should be '- [{marker}] '"
                    ))
    
    def check_state_board(self, file_path: Path, lines: List[str]):
        """Check state board table."""
        in_state_board = False
        
        for i, line in enumerate(lines, 1):
            if "State Board" in line or "| Task |" in line and "State" in line:
                in_state_board = True
                continue
            
            if in_state_board:
                if line.strip().startswith("|") and "-" not in line:
                    # Parse table row
                    parts = [p.strip() for p in line.split("|")]
                    if len(parts) >= 4:
                        state = parts[3] if len(parts) > 3 else ""
                        if state and state not in VALID_STATES:
                            self.issues.append(LintIssue(
                                "warning", file_path, i,
                                f"Unknown state: '{state}'. Valid: {', '.join(VALID_STATES)}"
                            ))
                elif line.strip() and not line.strip().startswith("|"):
                    in_state_board = False
    
    def check_status_field(self, file_path: Path, content: str):
        """Check status field consistency."""
        if not HAS_YAML:
            return
        
        parts = content.split("---", 2)
        if len(parts) < 3:
            return
        
        try:
            fm = yaml.safe_load(parts[1].strip())
            status = fm.get("status", "")
            
            # Check if status matches content indicators
            if status == "final" and "- [ ]" in content:
                self.issues.append(LintIssue(
                    "warning", file_path, 0,
                    "Status is 'final' but file contains unchecked items"
                ))
            
            if status == "draft" and "- [x]" in content:
                self.issues.append(LintIssue(
                    "info", file_path, 0,
                    "Status is 'draft' but file contains completed items"
                ))
        
        except yaml.YAMLError:
            pass
    
    def check_cross_references(self, file_path: Path, content: str):
        """Check cross-references between docs."""
        # Check for plan/task links
        if "plan:" in content or "task:" in content:
            # Extract referenced IDs
            id_pattern = re.compile(r'["\']?(\d{6}_\d{4}_[a-z0-9_-]+_(?:plan|task|report|spec|adr)_\d+)["\']?')
            references = id_pattern.findall(content)
            
            # Note: We can't validate if the referenced file exists without more context
            # This is just a lint check for format
            for ref in references:
                if not re.match(r'^\d{6}_\d{4}_[a-z0-9_-]+_(?:plan|task|report|spec|adr)_\d+$', ref):
                    self.issues.append(LintIssue(
                        "info", file_path, 0,
                        f"Cross-reference may have invalid format: '{ref}'"
                    ))
    
    def _is_valid_timestamp(self, ts: str) -> bool:
        """Check if timestamp is valid ISO 8601 with Z suffix."""
        pattern = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
        return bool(pattern.match(ts))
    
    def lint_folder(self, folder: Path):
        """Lint all markdown files in folder."""
        if not folder.exists():
            print(f"❌ Folder not found: {folder}")
            return
        
        for md_file in folder.rglob("*.md"):
            if "node_modules" in str(md_file) or ".git" in str(md_file):
                continue
            self.lint_file(md_file)
    
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
        folder = ROOT_DIR / ".agents"
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
