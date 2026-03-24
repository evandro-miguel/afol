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

import json
import re
import sys
from pathlib import Path
from typing import Dict, List

from lib.agents_config import get_active_session_file_path, get_cfg_path, load_agents_config

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
ROADMAP_FILE = get_cfg_path(ROOT_DIR, CONFIG, "roadmap_file")
SPECS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "specs_dir")
ACTIVE_SESSION_FILE = get_active_session_file_path(ROOT_DIR, CONFIG)

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
    "postmortem",
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
        self.check_roadmap_governance()
        self.check_primary_runtime_compatibility()

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
                    "Required folder missing"
                ))
            elif not folder_path.is_dir():
                self.issues.append(Issue(
                    "error",
                    str(folder_path),
                    "Path exists but is not a directory"
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
                    "Required template missing"
                ))
            else:
                # Validate template has frontmatter
                content = template_path.read_text()
                if not content.startswith("---"):
                    self.issues.append(Issue(
                        "warning",
                        str(template_path),
                        "Template missing YAML frontmatter"
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
                    "Session folder name doesn't follow YYMMDD_HHMM_theme pattern"
                ))
            else:
                print(f"  ✓ {session.name}")

            # Check files in session
            for md_file in session.rglob("*.md"):
                self.validate_frontmatter(md_file)
                self.validate_checkboxes(md_file)

        print()

    def check_active_session_pointer(self):
        """Validate active session pointer consistency."""
        print("Checking active session pointer...")
        has_sessions = any(
            entry.is_dir() and not entry.name.startswith(".")
            for entry in WB_DIR.iterdir()
        ) if WB_DIR.exists() else False

        if not ACTIVE_SESSION_FILE.exists():
            if has_sessions:
                self.issues.append(Issue(
                    "warning",
                    str(ACTIVE_SESSION_FILE),
                    "Active session file missing"
                ))
            else:
                print("  ✓ no active session set")
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
                    "Recommended architecture file missing"
                ))

        # Check SPECS index
        specs_index = arc_dir / "SPECS" / "INDEX.md"
        if specs_index.exists():
            self.validate_frontmatter(specs_index)
            print("  ✓ SPECS/INDEX.md")

        # Check DECISIONS index
        decisions_index = arc_dir / "DECISIONS" / "INDEX.md"
        if decisions_index.exists():
            self.validate_frontmatter(decisions_index)
            print("  ✓ DECISIONS/INDEX.md")

        print()

    def check_roadmap_governance(self):
        """Validate roadmap-first governance structure in the main roadmap."""
        print("Checking roadmap governance...")

        if not ROADMAP_FILE.exists():
            self.issues.append(Issue(
                "error",
                str(ROADMAP_FILE),
                "Main roadmap file missing"
            ))
            print()
            return

        content = ROADMAP_FILE.read_text()
        feature_matches = list(re.finditer(r"^###\s+(F-\d{2,3})\b", content, re.MULTILINE))
        if not feature_matches:
            self.issues.append(Issue(
                "warning",
                str(ROADMAP_FILE),
                "No roadmap feature sections found (expected headings like '### F-01 ...')"
            ))
            print()
            return

        for idx, match in enumerate(feature_matches):
            feature_id = match.group(1)
            section_start = match.start()
            section_end = feature_matches[idx + 1].start() if idx + 1 < len(feature_matches) else len(content)
            section = content[section_start:section_end]

            governing_spec_match = re.search(r"^- Governing spec:\s+`?([^`\n]+)`?\s*$", section, re.MULTILINE)
            if not governing_spec_match:
                self.issues.append(Issue(
                    "warning",
                    str(ROADMAP_FILE),
                    f"Roadmap feature {feature_id} is missing a 'Governing spec' line"
                ))
                continue

            raw_ref = governing_spec_match.group(1).strip()
            spec_path = (ROOT_DIR / raw_ref).resolve() if not Path(raw_ref).is_absolute() else Path(raw_ref)
            if not spec_path.exists():
                self.issues.append(Issue(
                    "error",
                    str(ROADMAP_FILE),
                    f"Roadmap feature {feature_id} references missing governing spec: {raw_ref}"
                ))
                continue

            try:
                spec_path.relative_to(SPECS_DIR.resolve())
            except ValueError:
                self.issues.append(Issue(
                    "warning",
                    str(ROADMAP_FILE),
                    f"Roadmap feature {feature_id} governing spec is outside {SPECS_DIR.relative_to(ROOT_DIR)}"
                ))

        print(f"  ✓ {len(feature_matches)} roadmap feature(s) found")
        print()

    def check_primary_runtime_compatibility(self):
        """Validate committed primary-runtime adapters and boundaries."""
        print("Checking primary runtime compatibility...")

        runtime_docs = {
            "OpenCode": ROOT_DIR / "OPENCODE.md",
            "Qwen": ROOT_DIR / "QWEN.md",
            "Codex": ROOT_DIR / "AGENTS.md",
        }
        for runtime_name, path in runtime_docs.items():
            if not path.exists():
                self.issues.append(Issue(
                    "error",
                    str(path),
                    f"Primary runtime entrypoint missing for {runtime_name}"
                ))
            else:
                print(f"  ✓ {runtime_name} entrypoint -> {path.name}")

        runtime_dirs = {
            "OpenCode": ROOT_DIR / ".opencode",
            "Codex": ROOT_DIR / ".codex",
            "Qwen": ROOT_DIR / ".qwen",
        }
        for runtime_name, path in runtime_dirs.items():
            if not path.exists() or not path.is_dir():
                self.issues.append(Issue(
                    "error",
                    str(path),
                    f"Primary runtime folder missing for {runtime_name}"
                ))
                continue

            print(f"  ✓ {runtime_name} folder -> {path.relative_to(ROOT_DIR)}")

            readme_path = path / "README.md"
            if not readme_path.exists():
                self.issues.append(Issue(
                    "warning",
                    str(readme_path),
                    f"Runtime README missing for {runtime_name}"
                ))

            skills_path = path / "skills"
            if not skills_path.exists():
                self.issues.append(Issue(
                    "warning",
                    str(skills_path),
                    f"Runtime skills link missing for {runtime_name}"
                ))
            elif not skills_path.is_symlink():
                self.issues.append(Issue(
                    "warning",
                    str(skills_path),
                    f"Runtime skills path for {runtime_name} is not a symlink to .agents/skills"
                ))

        self._check_opencode_project_adapter()
        print()

    def _check_opencode_project_adapter(self):
        """Validate committed OpenCode adapter shape and secret boundary."""
        adapter_path = ROOT_DIR / "opencode.json"
        if not adapter_path.exists():
            self.issues.append(Issue(
                "error",
                str(adapter_path),
                "OpenCode project adapter missing"
            ))
            return

        try:
            config = json.loads(adapter_path.read_text())
        except json.JSONDecodeError as exc:
            self.issues.append(Issue(
                "error",
                str(adapter_path),
                f"Invalid JSON: {exc}"
            ))
            return

        schema_value = config.get("$schema")
        if schema_value != "https://opencode.ai/config.json":
            self.issues.append(Issue(
                "warning",
                str(adapter_path),
                "Expected OpenCode schema https://opencode.ai/config.json"
            ))

        instructions = config.get("instructions")
        if not isinstance(instructions, list):
            self.issues.append(Issue(
                "error",
                str(adapter_path),
                "OpenCode adapter must define an instructions array"
            ))
        else:
            required_refs = {"AGENTS.md", ".agents/arc/GENERAL-ROADMAP.md"}
            missing_refs = sorted(required_refs - set(instructions))
            if missing_refs:
                self.issues.append(Issue(
                    "error",
                    str(adapter_path),
                    f"OpenCode adapter is missing canonical references: {', '.join(missing_refs)}"
                ))

        permission = config.get("permission", {})
        if not isinstance(permission, dict):
            self.issues.append(Issue(
                "error",
                str(adapter_path),
                "OpenCode adapter permission block must be a JSON object"
            ))
        else:
            for key in ("edit", "bash", "webfetch"):
                if permission.get(key) != "ask":
                    self.issues.append(Issue(
                        "warning",
                        str(adapter_path),
                        f"OpenCode permission '{key}' should default to 'ask'"
                    ))

        serialized = json.dumps(config).lower()
        banned_tokens = ("token", "secret", "password", "api_key", "apikey", "bearer", "auth")
        if any(token in serialized for token in banned_tokens):
            self.issues.append(Issue(
                "warning",
                str(adapter_path),
                "OpenCode adapter appears to contain credential-like fields; review secret boundary"
            ))

    def _validate_frontmatter_fields(self, file_path: Path, fm: Dict):
        """Validate frontmatter field values."""
        # Check required fields
        if not fm.get("doc_type") and not fm.get("type"):
            self.issues.append(Issue(
                "warning",
                str(file_path),
                "Missing doc_type/type field"
            ))

        # Check timestamp format
        self._check_frontmatter_timestamps(file_path, fm)

        # Check ID format
        self._check_frontmatter_id(file_path, fm)

    def _check_frontmatter_timestamps(self, file_path: Path, fm: Dict):
        """Check timestamp fields format in frontmatter."""
        for ts_field in ["created_at", "updated_at", "created", "updated"]:
            if ts_field in fm:
                ts_value = fm[ts_field]
                if isinstance(ts_value, str) and not TIMESTAMP_PATTERN.match(ts_value):
                    self.issues.append(Issue(
                        "warning",
                        str(file_path),
                        f"Invalid timestamp format for {ts_field}: {ts_value} (expected ISO 8601: ...Z or ...-03:00)"
                    ))

    def _check_frontmatter_id(self, file_path: Path, fm: Dict):
        """Check ID field format in frontmatter."""
        if "id" in fm:
            id_value = fm["id"]
            if isinstance(id_value, str) and not ID_PATTERN.match(id_value) and not id_value.endswith("_root") and not id_value.endswith("_readme") and not id_value.endswith("_index"):
                self.issues.append(Issue(
                    "info",
                    str(file_path),
                    f"ID may not follow convention: {id_value}"
                ))

    def validate_frontmatter(self, file_path: Path):
        """Validate YAML frontmatter in a file."""
        self.stats["frontmatter_checked"] += 1
        content = file_path.read_text()

        if not content.startswith("---"):
            self.issues.append(Issue(
                "warning",
                str(file_path),
                "Missing YAML frontmatter"
            ))
            return

        # Extract frontmatter
        parts = content.split("---", 2)
        if len(parts) < 3:
            self.issues.append(Issue(
                "warning",
                str(file_path),
                "Invalid frontmatter structure"
            ))
            return

        frontmatter_text = parts[1].strip()

        if not HAS_YAML:
            # Basic validation without yaml library
            if "created_at:" not in frontmatter_text and "created:" not in frontmatter_text:
                self.issues.append(Issue(
                    "warning",
                    str(file_path),
                    "Missing created_at/created field"
                ))
            return

        try:
            fm = yaml.safe_load(frontmatter_text)
            self._validate_frontmatter_fields(file_path, fm)
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
