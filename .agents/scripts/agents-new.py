#!/usr/bin/env python3
"""
Agents New - Create new workstream with all required files.

Creates:
- Session folder with proper naming
- Plan file
- Task file
- Spec file (or spec-lite)
- Log file

Usage:
    python agents-new.py <theme> [--spec | --spec-lite] [--plan-only]
    
Examples:
    python agents-new.py auth-refactor
    python agents-new.py api-endpoint --spec
    python agents-new.py bugfix-login --spec-lite
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Configuration
ROOT_DIR = Path(__file__).parent.parent.parent
AGENTS_DIR = ROOT_DIR / ".agents"
TEMPLATES_DIR = AGENTS_DIR / "a-docs" / "templates"
WB_DIR = AGENTS_DIR / "wb"


def get_timestamp() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_session_id(theme: str) -> str:
    """Generate session folder ID."""
    now = datetime.now(timezone.utc)
    date_part = now.strftime("%y%m%d_%H%M")
    # Sanitize theme
    theme_clean = theme.lower().replace(" ", "-").replace("_", "-")
    theme_clean = "".join(c for c in theme_clean if c.isalnum() or c == "-")
    return f"{date_part}_{theme_clean}"


def load_template(template_name: str) -> str:
    """Load template content."""
    template_path = TEMPLATES_DIR / template_name
    
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    
    return template_path.read_text()


def fill_template(template: str, session_id: str, theme: str, timestamp: str) -> str:
    """Fill template with session data."""
    # Replace common placeholders
    content = template
    content = content.replace("<theme>", theme)
    content = content.replace("YYMMDD_HHMM_<theme>", session_id)
    content = content.replace("YYYY-MM-DDTHH:MM:SSZ", timestamp)
    
    # Replace ID placeholders
    content = content.replace('"YYMMDD_HHMM_<theme>_plan_01"', f'"{session_id}_plan_01"')
    content = content.replace('"YYMMDD_HHMM_<theme>_task_01"', f'"{session_id}_task_01"')
    content = content.replace('"YYMMDD_HHMM_<theme>_spec_01"', f'"{session_id}_spec_01"')
    content = content.replace('"YYMMDD_HHMM_<theme>_spec-lite_01"', f'"{session_id}_spec-lite_01"')
    content = content.replace('"YYMMDD_HHMM_<theme>_log_01"', f'"{session_id}_log_01"')
    
    # Replace links
    content = content.replace('"YYMMDD_HHMM_<theme>_plan_01"', f'"{session_id}_plan_01"')
    content = content.replace('"YYMMDD_HHMM_<theme>_task_01"', f'"{session_id}_task_01"')
    
    return content


def create_session_folder(session_id: str) -> Path:
    """Create session folder."""
    session_path = WB_DIR / session_id
    
    if session_path.exists():
        raise FileExistsError(f"Session folder already exists: {session_path}")
    
    session_path.mkdir(parents=True)
    return session_path


def create_file(session_path: Path, filename: str, content: str):
    """Create file in session folder."""
    file_path = session_path / filename
    
    if file_path.exists():
        print(f"  ⚠️  Skipping existing file: {filename}")
        return
    
    file_path.write_text(content)
    print(f"  ✓ Created: {filename}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python agents-new.py <theme> [--spec | --spec-lite] [--plan-only]")
        print()
        print("Examples:")
        print("  python agents-new.py auth-refactor")
        print("  python agents-new.py api-endpoint --spec")
        print("  python agents-new.py bugfix-login --spec-lite")
        sys.exit(1)
    
    theme = sys.argv[1]
    use_spec = "--spec" in sys.argv
    use_spec_lite = "--spec-lite" in sys.argv
    plan_only = "--plan-only" in sys.argv
    
    # Generate session data
    session_id = get_session_id(theme)
    timestamp = get_timestamp()
    
    print("=" * 60)
    print(f"Creating new workstream: {theme}")
    print("=" * 60)
    print()
    print(f"Session ID: {session_id}")
    print(f"Timestamp: {timestamp}")
    print()
    
    # Create session folder
    try:
        session_path = create_session_folder(session_id)
        print(f"✓ Created session folder: {session_path.name}")
        print()
    except FileExistsError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    
    # Create plan file (always)
    print("Creating files:")
    try:
        plan_template = load_template("plan.md")
        plan_content = fill_template(plan_template, session_id, theme, timestamp)
        create_file(session_path, f"{session_id}_plan_01.md", plan_content)
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    
    # Create task file (always)
    if not plan_only:
        try:
            task_template = load_template("task.md")
            task_content = fill_template(task_template, session_id, theme, timestamp)
            create_file(session_path, f"{session_id}_task_01.md", task_content)
        except FileNotFoundError as e:
            print(f"❌ Error: {e}")
            sys.exit(1)
        
        # Create spec file (optional)
        if use_spec:
            try:
                spec_template = load_template("spec.md")
                spec_content = fill_template(spec_template, session_id, theme, timestamp)
                create_file(session_path, f"{session_id}_spec_01.md", spec_content)
            except FileNotFoundError as e:
                print(f"❌ Error: {e}")
                sys.exit(1)
        elif use_spec_lite:
            try:
                spec_lite_template = load_template("spec-lite.md")
                spec_lite_content = fill_template(spec_lite_template, session_id, theme, timestamp)
                create_file(session_path, f"{session_id}_spec-lite_01.md", spec_lite_content)
            except FileNotFoundError as e:
                print(f"❌ Error: {e}")
                sys.exit(1)
        
        # Create log file (always)
        try:
            log_template = load_template("log.md")
            log_content = fill_template(log_template, session_id, theme, timestamp)
            create_file(session_path, f"{session_id}_log_01.md", log_content)
        except FileNotFoundError as e:
            print(f"❌ Error: {e}")
            sys.exit(1)
    
    print()
    print("=" * 60)
    print("Next steps:")
    print(f"1. Edit: .agents/wb/{session_id}/{session_id}_plan_01.md")
    if not plan_only:
        print(f"2. Edit: .agents/wb/{session_id}/{session_id}_task_01.md")
        if use_spec or use_spec_lite:
            print(f"3. Edit: .agents/wb/{session_id}/{session_id}_spec*.md")
    print()
    print("Session folder:")
    print(f"  .agents/wb/{session_id}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
