#!/usr/bin/env python3
"""
Sync agent documentation files from AGENTS.md template.

This script:
1. Copies AGENTS.md content to QWEN.md, CLAUDE.md, GEMINI.md
2. Detects if any target file has local modifications
3. Reports differences and asks for user decision

Usage:
    python sync-agent-docs.py [--force]

Options:
    --force    Overwrite local modifications without asking
"""

import hashlib
import os
import sys
from pathlib import Path

# Configuration
ROOT_DIR = Path(__file__).parent.parent.parent
AGENTS_FILE = ROOT_DIR / "AGENTS.md"
AGENT_FILES = [
    ROOT_DIR / "QWEN.md",
    ROOT_DIR / "CLAUDE.md",
    ROOT_DIR / "GEMINI.md",
]

# Header that should be preserved in target files
HEADER_TEMPLATE = """# Agent-specific instructions for {agent_name}
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

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
    return header + agents_content


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
    
    # Find files with local changes
    modified_files = [s for s in statuses if s["has_local_changes"] and s["exists"]]
    
    if modified_files and not force:
        print("⚠️  WARNING: The following files have local modifications:")
        for status in modified_files:
            print(f"   - {status['file'].name}")
        
        print("\nThese files differ from the expected content based on AGENTS.md.")
        print("This could mean:")
        print("  1. AGENTS.md was updated and needs to be synced")
        print("  2. The file has agent-specific customizations")
        print()
        
        # Show details for each modified file
        for status in modified_files:
            agent_file = status["file"]
            expected = get_expected_content(agent_file)
            actual = agent_file.read_text()
            show_diff(agent_file, expected, actual)
        
        # Ask user for decision
        print("\nOptions:")
        print("  [O] overwrite - Replace with current AGENTS.md content")
        print("  [K] keep      - Keep local modifications (skip this file)")
        print("  [A] abort     - Stop sync process entirely")
        print("  [F] force all - Overwrite all without asking")
        print()
        
        response = input("Your choice (O/K/A/F): ").strip().upper()
        
        if response == "A":
            print("Sync aborted.")
            return 1
        elif response == "K":
            print("Keeping local modifications. Files not synced.")
            return 0
        elif response in ["O", "F"]:
            force = (response == "F")
            if not force:
                print("Proceeding with overwrite...")
        else:
            print("Invalid choice. Sync aborted.")
            return 1
    
    # Perform sync
    synced_count = 0
    for agent_file in AGENT_FILES:
        status = check_file_status(agent_file)
        
        if status["matches"]:
            print(f"✓ {agent_file.name} - already up to date")
            continue
        
        if force or not status["has_local_changes"]:
            expected_content = get_expected_content(agent_file)
            agent_file.write_text(expected_content)
            print(f"✓ {agent_file.name} - synced")
            synced_count += 1
        else:
            # This shouldn't happen if force=True or we handled modifications above
            print(f"⚠ {agent_file.name} - skipped (has local changes)")
    
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
