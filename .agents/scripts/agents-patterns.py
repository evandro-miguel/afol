#!/usr/bin/env python3
"""
Agents Patterns - Suggest and manage patterns for .agents system

Usage:
    agents-patterns.py suggest [--theme=<theme>] [--tags=<tags>]
    agents-patterns.py list [--type=<type>] [--status=<status>]
    agents-patterns.py show <pattern-id>
    agents-patterns.py apply <pattern-id> [--session=<session>]
    agents-patterns.py rate <pattern-id> --effectiveness=<high|medium|low>
    agents-patterns.py help

Commands:
    suggest     Suggest relevant patterns based on context
    list        List all patterns with filters
    show        Show detailed pattern information
    apply       Record pattern application in telemetry
    rate        Rate pattern effectiveness
    help        Show this help message

Options:
    --theme=<theme>           Workstream theme for suggestions
    --tags=<tags>             Comma-separated tags for filtering
    --type=<type>             Pattern type (success, anti, tool, template)
    --status=<status>         Pattern status (active, deprecated)
    --effectiveness=<rating>  Effectiveness rating (high, medium, low)
    --session=<session>       Session ID for apply command
"""

import json
import os
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import argparse


# Configuration
PATTERNS_DIR = Path(__file__).parent.parent / "a-docs" / "patterns"
TELEMETRY_SCRIPT = Path(__file__).parent / "agents-telemetry.py"
ACTIVE_SESSION_FILE = Path(__file__).parent.parent / "wb" / ".active_session"
ACTIVE_SESSION_FILE = Path(
    os.environ.get("AGENTS_ACTIVE_SESSION_FILE", str(ACTIVE_SESSION_FILE))
)

# Pattern subdirectories by type
PATTERN_SUBDIRS = {
    "success": "success",
    "anti": "anti",
    "tool": "tools",
    "template": "templates"
}


def get_iso_timestamp() -> str:
    """Get current timestamp in ISO 8601 format with timezone."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_active_session() -> Optional[str]:
    """Get current active session ID."""
    if not ACTIVE_SESSION_FILE.exists():
        return None
    with open(ACTIVE_SESSION_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()


def parse_frontmatter(content: str) -> Dict[str, Any]:
    """Parse YAML frontmatter from markdown content."""
    import re

    # Simple YAML frontmatter parser (avoids external dependency)
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return {}

    frontmatter = {}
    for line in match.group(1).split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip().strip('"\'')

            # Handle lists
            if value == '':
                continue
            # Handle arrays in single line
            if value.startswith('[') and value.endswith(']'):
                value = [v.strip().strip('"\'') for v in value[1:-1].split(',')]

            frontmatter[key] = value

    return frontmatter


def load_pattern(file_path: Path) -> Optional[Dict[str, Any]]:
    """Load pattern from markdown file."""
    if not file_path.exists():
        return None

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    frontmatter = parse_frontmatter(content)
    if not frontmatter:
        return None

    # Extract body
    body_start = content.find('---', content.find('---') + 3) + 3
    body = content[body_start:].strip()

    frontmatter['file_path'] = str(file_path)
    frontmatter['body'] = body

    return frontmatter


def scan_patterns() -> List[Dict[str, Any]]:
    """Scan all pattern files and load them."""
    patterns = []

    for pattern_type, subdir in PATTERN_SUBDIRS.items():
        type_dir = PATTERNS_DIR / subdir
        if not type_dir.exists():
            continue

        for file_path in type_dir.glob("*.md"):
            if file_path.name.startswith("TEMPLATE_"):
                continue

            pattern = load_pattern(file_path)
            if pattern:
                patterns.append(pattern)

    return patterns


def suggest_patterns(
    theme: Optional[str] = None,
    tags: Optional[List[str]] = None,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """Suggest relevant patterns based on theme or tags."""
    patterns = scan_patterns()

    # Only show active patterns
    patterns = [p for p in patterns if p.get('status') == 'active']

    scored_patterns = []

    for pattern in patterns:
        score = 0

        # Score by theme match
        if theme:
            theme_lower = theme.lower()
            pattern_id = pattern.get('id', '').lower()
            pattern_tags = pattern.get('tags', [])

            # Check if theme keywords appear in pattern
            if any(keyword in pattern_id for keyword in theme_lower.split('-')):
                score += 10

            # Check tag matches
            for tag in tags or []:
                if tag.lower() in [t.lower() for t in pattern_tags]:
                    score += 5

        # Score by tags
        if tags:
            pattern_tags = [t.lower() for t in pattern.get('tags', [])]
            for tag in tags:
                if tag.lower() in pattern_tags:
                    score += 3

        # Boost high effectiveness
        effectiveness = pattern.get('effectiveness', 'medium')
        if effectiveness == 'high':
            score += 2
        elif effectiveness == 'medium':
            score += 1

        if score > 0:
            scored_patterns.append((score, pattern))

    # Sort by score descending
    scored_patterns.sort(key=lambda x: -x[0])

    return [p for _, p in scored_patterns[:limit]]


def list_patterns(
    pattern_type: Optional[str] = None,
    status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List patterns with optional filters."""
    patterns = scan_patterns()

    if pattern_type:
        patterns = [p for p in patterns if p.get('type') == pattern_type]

    if status:
        patterns = [p for p in patterns if p.get('status') == status]

    return patterns


def show_pattern(pattern_id: str) -> Optional[Dict[str, Any]]:
    """Show detailed pattern information."""
    patterns = scan_patterns()

    for pattern in patterns:
        if pattern.get('id') == pattern_id:
            return pattern

    return None


def apply_pattern(
    pattern_id: str,
    session_id: Optional[str] = None
) -> bool:
    """Record pattern application in telemetry."""
    if not session_id:
        session_id = get_active_session()

    if not session_id:
        print("Error: No active session. Use --session to specify.", file=sys.stderr)
        return False

    # Verify pattern exists
    pattern = show_pattern(pattern_id)
    if not pattern:
        print(f"Error: Pattern {pattern_id} not found", file=sys.stderr)
        return False

    # Record pattern_applied event
    metadata = {
        "pattern_id": pattern_id,
        "pattern_type": pattern.get('type'),
        "outcome": "applied"
    }

    try:
        subprocess.run(
            [sys.executable, str(TELEMETRY_SCRIPT), "record", "pattern_applied",
             "--session-id", session_id,
             "--metadata", json.dumps(metadata)],
            capture_output=True,
            timeout=5
        )

        # Also record element_access for heat tracking
        subprocess.run(
            [sys.executable, str(TELEMETRY_SCRIPT), "record", "element_access",
             "--session-id", session_id,
             "--metadata", json.dumps({"element_id": pattern_id, "element_type": "pattern", "outcome": "success"})],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass  # Silent fail - telemetry is non-blocking

    return True


def rate_pattern(pattern_id: str, effectiveness: str) -> bool:
    """Rate pattern effectiveness (updates pattern file)."""
    pattern = show_pattern(pattern_id)
    if not pattern:
        print(f"Error: Pattern {pattern_id} not found", file=sys.stderr)
        return False

    if effectiveness not in ['high', 'medium', 'low']:
        print(f"Error: Invalid effectiveness: {effectiveness}", file=sys.stderr)
        return False

    # Read pattern file
    file_path = Path(pattern['file_path'])
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Update effectiveness in frontmatter
    import re
    new_content = re.sub(
        r'effectiveness:\s*["\']?(high|medium|low)["\']?',
        f'effectiveness: "{effectiveness}"',
        content
    )

    # Update updated_at
    new_content = re.sub(
        r'updated_at:\s*["\']?[\d\-T:Z+]+["\']?',
        f'updated_at: "{get_iso_timestamp()}"',
        new_content
    )

    # Write back
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"Updated {pattern_id} effectiveness to {effectiveness}")
    return True


def print_pattern_table(patterns: List[Dict[str, Any]]) -> None:
    """Print patterns in formatted table."""
    if not patterns:
        print("No patterns found.")
        return

    print(f"\n{'ID':10s} {'Type':10s} {'Name':30s} {'Effectiveness':15s} {'Tags'}")
    print("-" * 90)

    for pattern in patterns:
        pid = pattern.get('id', 'unknown')[:10]
        ptype = pattern.get('type', 'unknown')[:10]

        # Extract name from file path or pattern title
        file_path = pattern.get('file_path', '')
        name = Path(file_path).stem.replace('_', ' ').title()[:30]

        effectiveness = pattern.get('effectiveness', 'unknown')[:15]
        tags = ', '.join(pattern.get('tags', []))[:20]

        print(f"{pid:10s} {ptype:10s} {name:30s} {effectiveness:15s} {tags}")

    print()


def print_pattern_detail(pattern: Dict[str, Any]) -> None:
    """Print detailed pattern information."""
    print("\n" + "=" * 60)
    print(f"PATTERN: {pattern.get('id')}")
    print("=" * 60)
    print(f"Type: {pattern.get('type')}")
    print(f"Status: {pattern.get('status')}")
    print(f"Effectiveness: {pattern.get('effectiveness')}")
    print(f"Tags: {', '.join(pattern.get('tags', []))}")
    print()
    print("CONTEXT")
    print("-" * 40)

    # Extract context from body
    body = pattern.get('body', '')
    if '## Context' in body:
        context_start = body.find('## Context') + len('## Context')
        context_end = body.find('##', context_start)
        if context_end == -1:
            context_end = len(body)
        print(body[context_start:context_end].strip())

    print()
    print("PATTERN")
    print("-" * 40)
    if '## Pattern' in body:
        pattern_start = body.find('## Pattern') + len('## Pattern')
        pattern_end = body.find('##', pattern_start)
        if pattern_end == -1:
            pattern_end = len(body)
        print(body[pattern_start:pattern_end].strip())

    print()
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Agents Patterns - Suggest and manage patterns",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Suggest command
    suggest_parser = subparsers.add_parser("suggest", help="Suggest relevant patterns")
    suggest_parser.add_argument("--theme", help="Workstream theme")
    suggest_parser.add_argument("--tags", help="Comma-separated tags")
    suggest_parser.add_argument("--limit", type=int, default=5, help="Max suggestions")

    # List command
    list_parser = subparsers.add_parser("list", help="List patterns")
    list_parser.add_argument("--type", choices=["success", "anti", "tool", "template"])
    list_parser.add_argument("--status", choices=["active", "deprecated"])

    # Show command
    show_parser = subparsers.add_parser("show", help="Show pattern details")
    show_parser.add_argument("pattern_id", help="Pattern ID (e.g., PAT-001)")

    # Apply command
    apply_parser = subparsers.add_parser("apply", help="Apply pattern to session")
    apply_parser.add_argument("pattern_id", help="Pattern ID")
    apply_parser.add_argument("--session", help="Session ID")

    # Rate command
    rate_parser = subparsers.add_parser("rate", help="Rate pattern effectiveness")
    rate_parser.add_argument("pattern_id", help="Pattern ID")
    rate_parser.add_argument("--effectiveness", required=True, choices=["high", "medium", "low"])

    args = parser.parse_args()

    if args.command == "suggest":
        tags = args.tags.split(',') if args.tags else []
        patterns = suggest_patterns(
            theme=args.theme,
            tags=tags,
            limit=args.limit
        )

        if not patterns:
            print("No matching patterns found.")
            print("\nTip: Use --tags to search by tag (e.g., --tags=process,tools)")
        else:
            print(f"\nSuggested patterns for theme='{args.theme or 'any'}':\n")
            print_pattern_table(patterns)

            if patterns:
                print("Use 'agents-patterns.py show <ID>' for details")
                print("Use 'agents-patterns.py apply <ID>' to apply to current session")

    elif args.command == "list":
        patterns = list_patterns(
            pattern_type=args.type,
            status=args.status
        )
        print_pattern_table(patterns)

    elif args.command == "show":
        pattern = show_pattern(args.pattern_id)
        if pattern:
            print_pattern_detail(pattern)
        else:
            print(f"Pattern {args.pattern_id} not found")
            sys.exit(1)

    elif args.command == "apply":
        success = apply_pattern(args.pattern_id, session_id=args.session)
        if success:
            print(f"Applied {args.pattern_id} to session")
        else:
            sys.exit(1)

    elif args.command == "rate":
        success = rate_pattern(args.pattern_id, args.effectiveness)
        if not success:
            sys.exit(1)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
