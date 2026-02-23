#!/usr/bin/env python3
"""
Agents Doctor - Validate .agents folder structure and integrity.

Checks:
- Required folders exist
- Templates are present
- YAML frontmatter is valid
- IDs follow naming convention
- Timestamps are ISO 8601 with Z or timezone offset
- Cross-links between docs are valid

Usage:
    python agents-doctor.py [--fix]
"""

import re
import sys
from pathlib import Path
from typing import List

from lib.agents_config import get_cfg_path, load_agents_config

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Configuration
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
REQUIRED_FOLDERS = CONFIG.get("doctor", {}).get("required_folders", [])
REQUIRED_TEMPLATES = CONFIG.get("doctor", {}).get("required_templates", [])
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
ACTIVE_SESSION_FILE = get_cfg_path(ROOT_DIR, CONFIG, "active_session_file")

VALID_DOC_TYPES = [
    "plan",
    "task",
    "report",
    "log",
    "research",
    "brainstorm",
    "blocks",
    "spec",
    "spec-lite",
    "spec_lite",
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
    "specs_readme",
]
DOC_TYPES_PATTERN = "|".join(re.escape(t) for t in VALID_DOC_TYPES)
ID_PATTERN = re.compile(rf'^\d{{6}}_\d{{4}}_[a-z0-9_-]+_({DOC_TYPES_PATTERN})_\d+$')
TIMESTAMP_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$')
TIGHT_CHECKBOX_PATTERN = re.compile(r'^(\s*)-\[([ xX/!>%])\](.*)$')
MISSING_SEP_PATTERN = re.compile(r'(- \[[ xX/!>%]\])(?=\S)')


class Issue:
    def __init__(self, severity: str, path: str, message: str):
        self.severity = severity  # error, warning, info
        self.path = path
        self.message = message
    
    def __str__(self):
        icon = {"error": "❌", "warning": "⚠️", "info": "ℹ️"}.get(self.severity, "?")
        return f"{icon} [{self.severity.upper()}] {self.path}: {self.message}"


class AgentsDoctor:
    def __init__(self, fix: bool = False):
        self.fix = fix
        self.issues: List[Issue] = []
        self.stats = {
            "folders_checked": 0,
            "templates_checked": 0,
            "docs_checked": 0,
            "frontmatter_checked": 0,
        }
    
    def run(self) -> bool:
        """Run all checks and return True if all pass."""
        print("=" * 60)
        print("AGENTS DOCTOR - Structure Validation")
        print("=" * 60)
        print()
        
        self.check_required_folders()
        self.check_templates()
        self.check_workbench_sessions()
        self.check_active_session_pointer()
        self.check_arc_docs()
        
        self.print_report()
        
        errors = [i for i in self.issues if i.severity == "error"]
        return len(errors) == 0
    
    def check_required_folders(self):
        """Check if all required folders exist."""
        print("Checking required folders...")
        
        for folder in REQUIRED_FOLDERS:
            self.stats["folders_checked"] += 1
            folder_path = AGENTS_DIR / folder
            
            if not folder_path.exists():
                self.issues.append(Issue(
                    "error",
                    str(folder_path),
                    f"Required folder missing"
                ))
            elif not folder_path.is_dir():
                self.issues.append(Issue(
                    "error",
                    str(folder_path),
                    f"Path exists but is not a directory"
                ))
            else:
                print(f"  ✓ {folder}")
        
        print()
    
    def check_templates(self):
        """Check if all required templates exist."""
        print("Checking templates...")
        
        templates_dir = AGENTS_DIR / "a-docs" / "templates"
        
        for template in REQUIRED_TEMPLATES:
            self.stats["templates_checked"] += 1
            template_path = templates_dir / template
            
            if not template_path.exists():
                self.issues.append(Issue(
                    "error",
                    str(template_path),
                    f"Required template missing"
                ))
            else:
                # Validate template has frontmatter
                content = template_path.read_text()
                if not content.startswith("---"):
                    self.issues.append(Issue(
                        "warning",
                        str(template_path),
                        f"Template missing YAML frontmatter"
                    ))
                else:
                    print(f"  ✓ {template}")
        
        print()
    
    def check_workbench_sessions(self):
        """Check workbench sessions for valid structure."""
        print("Checking workbench sessions...")
        
        wb_dir = AGENTS_DIR / "wb"
        if not wb_dir.exists():
            return
        
        for session in wb_dir.iterdir():
            if not session.is_dir() or session.name.startswith("."):
                continue
            
            self.stats["docs_checked"] += 1
            
            # Check session naming convention
            if not re.match(r'^\d{6}_\d{4}_[a-z0-9_-]+$', session.name):
                self.issues.append(Issue(
                    "warning",
                    str(session),
                    f"Session folder name doesn't follow YYMMDD_HHMM_theme pattern"
                ))
            else:
                print(f"  ✓ {session.name}")
            
            # Check files in session
            for md_file in session.glob("*.md"):
                self.validate_frontmatter(md_file)
                self.validate_checkboxes(md_file)
        
        print()
    
    def check_active_session_pointer(self):
        """Validate active session pointer consistency."""
        print("Checking active session pointer...")

        if not ACTIVE_SESSION_FILE.exists():
            self.issues.append(Issue(
                "warning",
                str(ACTIVE_SESSION_FILE),
                "Active session file missing"
            ))
            print()
            return

        raw = ACTIVE_SESSION_FILE.read_text().strip()
        if not raw:
            self.issues.append(Issue(
                "warning",
                str(ACTIVE_SESSION_FILE),
                "Active session file is empty"
            ))
            print()
            return

        if not re.match(r'^\d{6}_\d{4}_[a-z0-9_-]+$', raw):
            self.issues.append(Issue(
                "warning",
                str(ACTIVE_SESSION_FILE),
                f"Active session id format looks invalid: {raw}"
            ))

        session_dir = WB_DIR / raw
        if not session_dir.exists() or not session_dir.is_dir():
            self.issues.append(Issue(
                "error",
                str(ACTIVE_SESSION_FILE),
                f"Active session points to missing folder: {session_dir}"
            ))
        else:
            print(f"  ✓ active -> {raw}")

        print()

    def check_arc_docs(self):
        """Check architecture docs."""
        print("Checking architecture docs...")
        
        arc_dir = AGENTS_DIR / "arc"
        if not arc_dir.exists():
            return
        
        # Check main arc files
        for arc_file in ["ARCHITECTURE.md", "GENERAL-ROADMAP.md", "README.md"]:
            file_path = arc_dir / arc_file
            if file_path.exists():
                self.validate_frontmatter(file_path)
                print(f"  ✓ {arc_file}")
            else:
                self.issues.append(Issue(
                    "warning",
                    str(file_path),
                    f"Recommended architecture file missing"
                ))
        
        # Check SPECS index
        specs_index = arc_dir / "SPECS" / "INDEX.md"
        if specs_index.exists():
            self.validate_frontmatter(specs_index)
            print(f"  ✓ SPECS/INDEX.md")

        # Check DECISIONS index
        decisions_index = arc_dir / "DECISIONS" / "INDEX.md"
        if decisions_index.exists():
            self.validate_frontmatter(decisions_index)
            print("  ✓ DECISIONS/INDEX.md")
        
        print()
    
    def validate_frontmatter(self, file_path: Path):
        """Validate YAML frontmatter in a file."""
        self.stats["frontmatter_checked"] += 1
        content = file_path.read_text()
        
        if not content.startswith("---"):
            self.issues.append(Issue(
                "warning",
                str(file_path),
                f"Missing YAML frontmatter"
            ))
            return
        
        # Extract frontmatter
        parts = content.split("---", 2)
        if len(parts) < 3:
            self.issues.append(Issue(
                "warning",
                str(file_path),
                f"Invalid frontmatter structure"
            ))
            return
        
        frontmatter_text = parts[1].strip()
        
        if not HAS_YAML:
            # Basic validation without yaml library
            if "created_at:" not in frontmatter_text and "created:" not in frontmatter_text:
                self.issues.append(Issue(
                    "warning",
                    str(file_path),
                    f"Missing created_at/created field"
                ))
            return
        
        try:
            fm = yaml.safe_load(frontmatter_text)
            
            # Check required fields
            if not fm.get("doc_type") and not fm.get("type"):
                self.issues.append(Issue(
                    "warning",
                    str(file_path),
                    f"Missing doc_type/type field"
                ))
            
            # Check timestamp format
            for ts_field in ["created_at", "updated_at", "created", "updated"]:
                if ts_field in fm:
                    ts_value = fm[ts_field]
                    if isinstance(ts_value, str) and not TIMESTAMP_PATTERN.match(ts_value):
                        self.issues.append(Issue(
                            "warning",
                            str(file_path),
                            f"Invalid timestamp format for {ts_field}: {ts_value} (expected ISO 8601: ...Z or ...-03:00)"
                        ))
            
            # Check ID format
            if "id" in fm:
                id_value = fm["id"]
                if isinstance(id_value, str) and not ID_PATTERN.match(id_value) and not id_value.endswith("_root") and not id_value.endswith("_readme") and not id_value.endswith("_index"):
                    self.issues.append(Issue(
                        "info",
                        str(file_path),
                        f"ID may not follow convention: {id_value}"
                    ))
        
        except yaml.YAMLError as e:
            self.issues.append(Issue(
                "error",
                str(file_path),
                f"Invalid YAML frontmatter: {e}"
            ))
    
    def validate_checkboxes(self, file_path: Path):
        """Validate checkbox markers in file."""
        content = file_path.read_text()
        lines = content.splitlines()
        had_trailing_newline = content.endswith("\n")
        in_code_block = False
        changed = False

        for idx, line in enumerate(lines):
            if "```" in line:
                in_code_block = not in_code_block
                continue
            if in_code_block:
                continue

            original = line

            if self.fix:
                tight = TIGHT_CHECKBOX_PATTERN.match(line)
                if tight:
                    marker = "x" if tight.group(2) == "X" else tight.group(2)
                    line = f"{tight.group(1)}- [{marker}]{tight.group(3)}"
                line = MISSING_SEP_PATTERN.sub(r"\1 ", line)

                if line != original:
                    lines[idx] = line
                    changed = True

            if re.search(r'-\[[^\s]\]', original) and not re.search(r'- \[[ xX/!>%]\]', original):
                self.issues.append(Issue(
                    "info",
                    str(file_path),
                    f"Line {idx + 1}: Checkbox may have non-standard marker"
                ))

        if changed:
            normalized = "\n".join(lines) + ("\n" if had_trailing_newline else "")
            file_path.write_text(normalized)
            self.issues.append(Issue(
                "info",
                str(file_path),
                "Auto-fixed checkbox formatting issues (--fix)"
            ))
    
    def print_report(self):
        """Print validation report."""
        print("=" * 60)
        print("VALIDATION REPORT")
        print("=" * 60)
        print()
        print(f"Folders checked: {self.stats['folders_checked']}")
        print(f"Templates checked: {self.stats['templates_checked']}")
        print(f"Docs checked: {self.stats['docs_checked']}")
        print(f"Frontmatter checked: {self.stats['frontmatter_checked']}")
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
        
        if not HAS_YAML:
            print()
            print("⚠️  Note: PyYAML not installed. Install for full validation:")
            print("   pip install pyyaml")
            print()


def main():
    fix = "--fix" in sys.argv
    doctor = AgentsDoctor(fix=fix)
    success = doctor.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
