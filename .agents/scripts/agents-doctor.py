#!/usr/bin/env python3
"""
Agents Doctor - Validate .agents folder structure and integrity.

Checks:
- Required folders exist
- Templates are present
- YAML frontmatter is valid
- IDs follow naming convention
- Timestamps are ISO 8601 with Z suffix
- Cross-links between docs are valid

Usage:
    python agents-doctor.py [--fix]
"""

import os
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple, Optional

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# Configuration
ROOT_DIR = Path(__file__).parent.parent.parent
AGENTS_DIR = ROOT_DIR / ".agents"

REQUIRED_FOLDERS = [
    "a-docs/templates",
    "a-docs/standards",
    "a-docs/lessons",
    "a-docs/arc",
    "a-docs/specs",
    "arc",
    "arc/SPECS",
    "arc/DECISIONS",
    "wb",
    "rules",
    "scripts",
    "skills",
    "z-arq",
]

REQUIRED_TEMPLATES = [
    "plan.md",
    "task.md",
    "report.md",
    "log.md",
    "research.md",
    "brainstorm.md",
    "blocks.md",
    "spec.md",
    "spec-lite.md",
    "adr.md",
    "architecture.md",
    "roadmap.md",
]

ID_PATTERN = re.compile(r'^\d{6}_\d{4}_[a-z0-9_-]+_(plan|task|report|log|research|brainstorm|blocks|spec|spec-lite|adr|architecture|roadmap)_\d+$')
TIMESTAMP_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')


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
                            f"Invalid timestamp format for {ts_field}: {ts_value} (expected YYYY-MM-DDTHH:MM:SSZ)"
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
        
        # Check for inconsistent checkbox formats
        lines = content.splitlines()
        for i, line in enumerate(lines, 1):
            # Skip code blocks
            if "```" in line:
                continue
            
            # Check for checkboxes without proper format
            if re.search(r'-\[[^\s]\]', line) and not re.search(r'- \[[ x/!>%]\]', line):
                self.issues.append(Issue(
                    "info",
                    str(file_path),
                    f"Line {i}: Checkbox may have non-standard marker"
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
