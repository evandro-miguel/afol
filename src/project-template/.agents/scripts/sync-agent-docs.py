#!/usr/bin/env python3
"""
Sync agent documentation files from AGENTS.md template.

This script:
1. Copies AGENTS.md content to OPENCODE.md, QWEN.md, CLAUDE.md, GEMINI.md
2. Detects if any target file has local modifications
3. Reports differences and asks for user decision

Usage:
    python sync-agent-docs.py [--force]

Options:
    --force    Overwrite local modifications without asking
"""

import hashlib
import sys
from pathlib import Path

from lib.agents_config import load_agents_config, resolve_repo_path

# Configuration
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
SYNC_CFG = CONFIG.get("sync", {})
AGENTS_FILE = resolve_repo_path(ROOT_DIR, SYNC_CFG.get("source_file", "AGENTS.md"))
AGENT_FILES = [
    resolve_repo_path(ROOT_DIR, p)
    for p in SYNC_CFG.get("target_files", ["OPENCODE.md", "QWEN.md", "CLAUDE.md", "GEMINI.md"])
]

# Header that should be preserved in target files
HEADER_TEMPLATE = """# Agent-specific instructions for {agent_name}
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

"""

# Footer warning to add at the end of each agent file
FOOTER_WARNING = """
---

> **⚠️ IMPORTANT:** THIS FILE IS A REPLICA OF THE `AGENTS.md`.
>
> - **DO NOT READ** the `AGENTS.md` AGAIN if you read this one.
> - The official skills and files of the repo are always on `.agents/skills`.
> - This file is auto-synced. Run `.agents/scripts/sync-agent-docs.py` to update.
"""


def compute_hash(content: str) -> str:
    """Compute SHA256 hash of content."""
    return hashlib.sha256(content.encode()).hexdigest()


def get_expected_content(agent_file: Path) -> str:
    """Get expected content for an agent file based on AGENTS.md."""
    if not AGENTS_FILE.exists():
        raise FileNotFoundError(f"Source file not found: {AGENTS_FILE}")

    agents_content = AGENTS_FILE.read_text()
    agent_name = agent_file.stem.upper()
    header = HEADER_TEMPLATE.format(agent_name=agent_name)

    # Add footer warning
    content = header + agents_content

    # Ensure there's a newline before footer
    if not content.endswith('\n'):
        content += '\n'
    content += FOOTER_WARNING

    return content


def check_file_status(agent_file: Path) -> dict:
    """Check if agent file matches expected content."""
    result = {
        "file": agent_file,
        "exists": agent_file.exists(),
        "matches": False,
        "has_local_changes": False,
        "expected_hash": None,
        "actual_hash": None,
    }

    expected_content = get_expected_content(agent_file)
    result["expected_hash"] = compute_hash(expected_content)

    if not agent_file.exists():
        return result

    actual_content = agent_file.read_text()
    result["actual_hash"] = compute_hash(actual_content)

    # Check if content matches (ignoring header differences for agent name)
    if actual_content == expected_content:
        result["matches"] = True
    else:
        # Check if it has local modifications (different from just having old AGENTS.md content)
        result["has_local_changes"] = True

    return result


def show_diff(agent_file: Path, expected: str, actual: str) -> None:
    """Show differences between expected and actual content."""
    print(f"\n{'='*60}")
    print(f"File: {agent_file}")
    print(f"{'='*60}")

    expected_lines = expected.splitlines()
    actual_lines = actual.splitlines()

    print("\nExpected (from AGENTS.md):")
    print("-" * 40)
    for i, line in enumerate(expected_lines[:10], 1):
        print(f"{i:3d}: {line}")
    if len(expected_lines) > 10:
        print(f"     ... ({len(expected_lines) - 10} more lines)")

    print("\nActual (current file):")
    print("-" * 40)
    for i, line in enumerate(actual_lines[:10], 1):
        print(f"{i:3d}: {line}")
    if len(actual_lines) > 10:
        print(f"     ... ({len(actual_lines) - 10} more lines)")

    print("\n" + "="*60)


def _print_modified_files_warning(modified_files: list[dict]) -> None:
    print("⚠️  WARNING: The following files have local modifications:")
    for status in modified_files:
        print(f"   - {status['file'].name}")

    print("\nThese files differ from the expected content based on AGENTS.md.")
    print("This could mean:")
    print("  1. AGENTS.md was updated and needs to be synced")
    print("  2. The file has agent-specific customizations")
    print()


def _show_modified_files_details(modified_files: list[dict]) -> None:
    for status in modified_files:
        agent_file = status["file"]
        expected = get_expected_content(agent_file)
        actual = agent_file.read_text()
        show_diff(agent_file, expected, actual)


def _prompt_for_modified_files_action() -> str:
    print("\nOptions:")
    print("  [O] overwrite - Replace with current AGENTS.md content")
    print("  [K] keep      - Keep local modifications (skip this file)")
    print("  [A] abort     - Stop sync process entirely")
    print("  [F] force all - Overwrite all without asking")
    print()

    if not sys.stdin.isatty():
        print("ERROR: Non-interactive input detected and modified target files exist.")
        print("Run with --force to overwrite in CI/non-interactive environments.")
        return "error"

    try:
        return input("Your choice (O/K/A/F): ").strip().upper()
    except EOFError:
        print("ERROR: No interactive input available. Use --force for non-interactive runs.")
        return "error"


def _resolve_modified_files(force: bool, statuses: list[dict]) -> tuple[bool, int]:
    """Resolve interactive behavior when modified files are present."""
    modified_files = [s for s in statuses if s["has_local_changes"] and s["exists"]]
    if not modified_files or force:
        return force, 0

    _print_modified_files_warning(modified_files)
    _show_modified_files_details(modified_files)
    response = _prompt_for_modified_files_action()

    if response in {"A", "error"}:
        if response == "A":
            print("Sync aborted.")
        return force, 1
    if response == "K":
        print("Keeping local modifications. Files not synced.")
        return force, 2
    if response in {"O", "F"}:
        force = (response == "F")
        if not force:
            print("Proceeding with overwrite...")
        return force, 0

    print("Invalid choice. Sync aborted.")
    return force, 1


def _sync_single_file(agent_file: Path, force: bool) -> int:
    status = check_file_status(agent_file)
    if status["matches"]:
        print(f"✓ {agent_file.name} - already up to date")
        return 0

    if force or not status["has_local_changes"]:
        expected_content = get_expected_content(agent_file)
        agent_file.write_text(expected_content)
        print(f"✓ {agent_file.name} - synced")
        return 1

    print(f"⚠ {agent_file.name} - skipped (has local changes)")
    return 0


def sync_files(force: bool = False) -> int:
    """Sync all agent files from AGENTS.md."""
    if not AGENTS_FILE.exists():
        print(f"ERROR: Source file not found: {AGENTS_FILE}")
        return 1

    print(f"Syncing agent documentation from: {AGENTS_FILE}")
    print(f"Target files: {[f.name for f in AGENT_FILES]}")
    print()

    # Check status of all files
    statuses = [check_file_status(f) for f in AGENT_FILES]

    force, status_code = _resolve_modified_files(force, statuses)
    if status_code == 1:
        return 1
    if status_code == 2:
        return 0
    if not force and any(s["has_local_changes"] and s["exists"] for s in statuses):
        if not sys.stdin.isatty():
            return 1

    # Perform sync
    synced_count = 0
    for agent_file in AGENT_FILES:
        synced_count += _sync_single_file(agent_file, force)

    print(f"\nSync complete. {synced_count} file(s) updated.")
    return 0


def main():
    """Main entry point."""
    force = "--force" in sys.argv

    try:
        sys.exit(sync_files(force))
    except KeyboardInterrupt:
        print("\nSync interrupted.")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
