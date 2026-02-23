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

import re
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
WORKFLOW_CFG = CONFIG.get("workflow", {})
MAX_PLAN_LINES_THRESHOLD = int(WORKFLOW_CFG.get("max_plan_lines_threshold", 500))
PLACEHOLDER_PATTERN = re.compile(r"\{([a-zA-Z0-9_.-]+)\}")


def get_timestamp() -> str:
    """Get current timestamp in configured workbench timezone."""
    return datetime.now(WB_TZ).strftime(f"%Y-%m-%dT%H:%M:%S{WB_OFFSET}")


def get_session_id(theme: str) -> str:
    """Generate session folder ID."""
    now = datetime.now(WB_TZ)
    date_part = now.strftime("%y%m%d_%H%M")
    theme_clean = sanitize_theme(theme)
    return f"{date_part}_{theme_clean}"


def sanitize_theme(theme: str) -> str:
    """Normalize/validate theme to a safe, bounded slug."""
    cleaned = theme.strip().lower().replace(" ", "-").replace("_", "-")
    cleaned = "".join(c for c in cleaned if c.isalnum() or c == "-")
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        raise ValueError("Theme is empty after sanitization. Use letters/numbers.")
    if len(cleaned) > 80:
        cleaned = cleaned[:80].rstrip("-")
    return cleaned


def get_config_placeholder(name: str) -> str | None:
    """Resolve placeholders like {max_plan_lines_threshold} from config defaults."""
    if name == "max_plan_lines_threshold":
        return str(MAX_PLAN_LINES_THRESHOLD)

    current = CONFIG
    for part in name.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return str(current)


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

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = get_config_placeholder(key)
        return value if value is not None else match.group(0)

    content = PLACEHOLDER_PATTERN.sub(_replace, content)

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


def find_primary_doc(session_path: Path, doc_type: str) -> Path | None:
    """Find the first workstream document by type."""
    matches = sorted(session_path.glob(f"*_{doc_type}_*.md"))
    return matches[0] if matches else None


def next_task_id(task_content: str) -> str:
    """Generate next T-XX identifier from existing checklist items."""
    ids = [int(m.group(1)) for m in re.finditer(r"T-(\d{2,3})\b", task_content)]
    next_num = (max(ids) + 1) if ids else 1
    width = 3 if next_num >= 100 else 2
    return f"T-{next_num:0{width}d}"


def insert_task_line(content: str, task_line: str) -> str:
    """Insert task line into Task List section when possible."""
    lines = content.splitlines()
    section_idx = next((i for i, l in enumerate(lines) if l.strip() == "## Task List"), -1)
    if section_idx == -1:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend(["## Task List", task_line])
        return "\n".join(lines) + "\n"

    insert_idx = section_idx + 1
    i = section_idx + 1
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("## "):
            break
        if s.startswith("- ["):
            insert_idx = i + 1
        i += 1
    lines.insert(insert_idx, task_line)
    return "\n".join(lines) + "\n"


def insert_log_timeline(content: str, entry: str) -> str:
    """Insert entry into Timeline section, fallback append."""
    lines = content.splitlines()
    section_idx = next((i for i, l in enumerate(lines) if l.strip() == "## Timeline"), -1)
    if section_idx == -1:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend(["## Timeline", entry])
        return "\n".join(lines) + "\n"

    insert_idx = section_idx + 1
    i = section_idx + 1
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("## "):
            break
        if s.startswith("- "):
            insert_idx = i + 1
        i += 1
    lines.insert(insert_idx, entry)
    return "\n".join(lines) + "\n"


def add_quick_task_to_active_session(active_session: str, theme: str, timestamp: str) -> tuple[str, Path, Path]:
    """Append a quick task and timeline entry to the active session docs."""
    session_path = WB_DIR / active_session
    task_file = find_primary_doc(session_path, "task")
    log_file = find_primary_doc(session_path, "log")
    if not task_file or not log_file:
        raise FileNotFoundError(
            "Active session is missing task/log file. Expected *_task_*.md and *_log_*.md."
        )

    task_content = task_file.read_text()
    task_id = next_task_id(task_content)
    task_line = f"- [ ] {task_id} {theme}"
    task_file.write_text(insert_task_line(task_content, task_line))

    log_content = log_file.read_text()
    timeline_entry = f"- {timestamp} - Added quick task {task_id}: {theme} - pending"
    log_file.write_text(insert_log_timeline(log_content, timeline_entry))

    return task_id, task_file, log_file


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
    
    raw_theme = sys.argv[1]
    try:
        theme = sanitize_theme(raw_theme)
    except ValueError as exc:
        print(f"❌ Invalid theme: {exc}")
        sys.exit(1)
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
        try:
            task_id, task_file, log_file = add_quick_task_to_active_session(
                active_session=active_session,
                theme=theme,
                timestamp=get_timestamp(),
            )
        except FileNotFoundError as exc:
            print(f"❌ {exc}")
            sys.exit(1)

        print("No new workstream created (quick mode).")
        print(f"✓ Added task: {task_id} in {task_file.relative_to(ROOT_DIR)}")
        print(f"✓ Added timeline entry in {log_file.relative_to(ROOT_DIR)}")
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

        # Create report file (always)
        try:
            report_template = load_template("report.md")
            report_content = fill_template(report_template, session_id, theme, timestamp)
            create_file(session_path, f"{session_id}_report_01.md", report_content)
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
    
    # Auto-record session_start telemetry
    record_session_start(session_id, theme, use_spec or use_spec_lite)
    
    # Auto-suggest patterns
    suggest_patterns_for_theme(theme)


def record_session_start(session_id: str, theme: str, has_spec: bool):
    """Record session_start event in telemetry."""
    if not TELEMETRY_SCRIPT.exists():
        return
    
    metadata = {
        "theme": theme,
        "workstream_type": "spec" if has_spec else "feature"
    }
    
    try:
        subprocess.run(
            ["python3", str(TELEMETRY_SCRIPT), "record", "session_start",
             "--session-id", session_id,
             "--metadata", json.dumps(metadata)],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass  # Silent fail - telemetry is non-blocking


def suggest_patterns_for_theme(theme: str):
    """Suggest relevant patterns for the theme."""
    if not PATTERNS_SCRIPT.exists():
        return
    
    try:
        result = subprocess.run(
            ["python3", str(PATTERNS_SCRIPT), "suggest", "--theme", theme, "--limit", "3"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.stdout.strip():
            print()
            print("📋 Suggested patterns for this workstream:")
            print(result.stdout)
    except Exception:
        pass  # Silent fail - patterns are non-blocking


if __name__ == "__main__":
    main()
