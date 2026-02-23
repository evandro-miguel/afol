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
from datetime import datetime

from lib.agents_config import get_cfg_path, load_agents_config, parse_offset

# Configuration
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
TEMPLATES_DIR = get_cfg_path(ROOT_DIR, CONFIG, "templates_dir")
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
ACTIVE_SESSION_FILE = get_cfg_path(ROOT_DIR, CONFIG, "active_session_file")
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WB_TZ = parse_offset(WB_OFFSET)


def get_timestamp() -> str:
    """Get current timestamp in configured workbench timezone."""
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{WB_OFFSET}")


def get_session_id(theme: str) -> str:
    """Generate session folder ID."""
    now = datetime.now(WB_TZ)
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
    content = content.replace("YYMMDD_HHMM_<theme>", session_id)
    content = content.replace("<theme>", theme)
    content = content.replace("<topic>", theme)
    content = content.replace("YYYY-MM-DDTHH:MM:SSZ", timestamp)
    
    return content


def create_session_folder(session_id: str) -> Path:
    """Create session folder."""
    session_path = WB_DIR / session_id
    
    if session_path.exists():
        raise FileExistsError(f"Session folder already exists: {session_path}")
    
    session_path.mkdir(parents=True)
    return session_path


def get_active_session() -> str | None:
    """Return active session id if configured and existing."""
    if not ACTIVE_SESSION_FILE.exists():
        return None
    session_id = ACTIVE_SESSION_FILE.read_text().strip()
    if not session_id:
        return None
    if not (WB_DIR / session_id).exists():
        return None
    return session_id


def set_active_session(session_id: str):
    """Set active session id."""
    ACTIVE_SESSION_FILE.write_text(session_id + "\n")


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
        print("Usage: python agents-new.py <theme> [--spec | --spec-lite] [--plan-only] [--force-new | --quick]")
        print()
        print("Examples:")
        print("  python agents-new.py auth-refactor")
        print("  python agents-new.py api-endpoint --spec")
        print("  python agents-new.py bugfix-login --spec-lite")
        print("  python agents-new.py tiny-fix --quick")
        print("  python agents-new.py new-epic --spec --force-new")
        sys.exit(1)
    
    theme = sys.argv[1]
    use_spec = "--spec" in sys.argv
    use_spec_lite = "--spec-lite" in sys.argv
    plan_only = "--plan-only" in sys.argv
    force_new = "--force-new" in sys.argv
    quick_mode = "--quick" in sys.argv

    active_session = get_active_session()

    # Quick mode: do not create new workstream, enforce single active stream.
    if quick_mode:
        if not active_session:
            print("❌ No active session found for quick mode.")
            print("Create one significant workstream first with:")
            print("  .agents/agents new <theme> [--spec|--spec-lite]")
            sys.exit(1)
        print("=" * 60)
        print(f"Quick task mode: {theme}")
        print("=" * 60)
        print()
        print(f"Active session: {active_session}")
        print(f"Session path: .agents/wb/{active_session}/")
        print()
        print("No new workstream created (quick mode).")
        print("Add the quick task to the current session task/log files.")
        print("=" * 60)
        sys.exit(0)

    if active_session and not force_new:
        print("❌ Active session already exists.")
        print(f"   Active: .agents/wb/{active_session}/")
        print()
        print("Policy: one active workstream at a time.")
        print("Use quick mode for small changes:")
        print(f"  .agents/agents new {theme} --quick")
        print()
        print("If this is a significant new stream, force creation:")
        print(f"  .agents/agents new {theme} --force-new [--spec|--spec-lite]")
        sys.exit(1)
    
    # Generate session data
    session_id = get_session_id(theme)
    timestamp = get_timestamp()
    
    print("=" * 60)
    print(f"Creating new workstream: {theme}")
    print("=" * 60)
    print()
    print(f"Session ID: {session_id}")
    print(f"Timestamp: {timestamp}")
    if active_session and force_new:
        print(f"Previous active session: {active_session}")
    print()
    
    # Create session folder
    try:
        session_path = create_session_folder(session_id)
        print(f"✓ Created session folder: {session_path.name}")
        print()
    except FileExistsError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

    set_active_session(session_id)
    print(f"✓ Set active session: {session_id}")
    print()
    
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
