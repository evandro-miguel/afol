#!/usr/bin/env python3
"""Repair agent symlinks and fallback to content replication when needed."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Iterable, List, Tuple


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
AGENT_DIRS = [".claude", ".qwen", ".codex", ".gemini"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fix symlinks for agent folders with copy fallback"
    )
    parser.add_argument(
        "--mode",
        choices=["auto", "symlink", "copy"],
        default="auto",
        help="auto: try symlink then copy fallback; symlink: enforce symlink only; copy: replicate only",
    )
    parser.add_argument(
        "--targets",
        default="skills,rules",
        help="Comma-separated target groups: skills,rules",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show planned actions only")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace conflicting files/dirs when needed",
    )
    return parser.parse_args()


def parse_targets(raw: str) -> set[str]:
    allowed = {"skills", "rules"}
    selected = {token.strip() for token in raw.split(",") if token.strip()}
    if not selected:
        return allowed
    invalid = selected - allowed
    if invalid:
        raise ValueError(f"Invalid --targets value: {', '.join(sorted(invalid))}")
    return selected


def list_mappings(root: Path, selected: set[str]) -> List[Tuple[str, Path, Path, str]]:
    mappings: List[Tuple[str, Path, Path, str]] = []

    if "skills" in selected:
        src_skills = root / ".agents" / "skills"
        for agent_dir in AGENT_DIRS:
            parent = root / agent_dir
            if parent.exists():
                target = parent / "skills"
                mappings.append((f"{agent_dir}/skills", src_skills, target, "../.agents/skills"))

    if "rules" in selected:
        src_rules = root / ".agents" / "rules"
        claude_rules_parent = root / ".claude" / "rules"
        if claude_rules_parent.exists():
            target = claude_rules_parent / "default"
            mappings.append(
                (".claude/rules/default", src_rules, target, "../../.agents/rules")
            )

    return mappings


def ensure_parent(path: Path, dry_run: bool) -> None:
    if path.parent.exists():
        return
    print(f"- mkdir: {path.parent}")
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)


def remove_target(path: Path, dry_run: bool) -> None:
    if not path.exists() and not path.is_symlink():
        return
    print(f"- remove: {path}")
    if dry_run:
        return
    if path.is_symlink() or path.is_file():
        path.unlink()
    else:
        shutil.rmtree(path)


def same_symlink(target: Path, expected_rel: str) -> bool:
    if not target.is_symlink():
        return False
    current = target.readlink()
    return current.as_posix() == expected_rel


def replicate_dir(src: Path, dst: Path, dry_run: bool) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Source not found: {src}")
    print(f"- replicate: {src} -> {dst}")
    if dry_run:
        return
    dst.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True)


def create_symlink(link_target: str, target: Path, dry_run: bool) -> None:
    print(f"- symlink: {target} -> {link_target}")
    if dry_run:
        return
    target.symlink_to(link_target, target_is_directory=True)


def process_mapping(
    label: str,
    src: Path,
    target: Path,
    link_target: str,
    mode: str,
    dry_run: bool,
    force: bool,
) -> int:
    print(f"\n[{label}]")
    ensure_parent(target, dry_run)

    # Perfect state: valid symlink
    if same_symlink(target, link_target):
        print("- ok: symlink already valid")
        return 0

    # symlink mode always enforces symlink
    if mode == "symlink":
        if target.exists() or target.is_symlink():
            if not force:
                print("- skip: target exists (use --force to replace)")
                return 1
            remove_target(target, dry_run)
        create_symlink(link_target, target, dry_run)
        return 0

    # copy mode always replicates content
    if mode == "copy":
        if target.is_symlink():
            if not force:
                print("- skip: target is symlink (use --force to replace with copy)")
                return 1
            remove_target(target, dry_run)
        replicate_dir(src, target, dry_run)
        return 0

    # auto mode
    if target.is_symlink():
        # wrong/broken symlink: replace with expected link first
        if force:
            remove_target(target, dry_run)
            try:
                create_symlink(link_target, target, dry_run)
                return 0
            except OSError as exc:
                print(f"- warn: symlink create failed ({exc}); fallback to replicate")
                replicate_dir(src, target, dry_run)
                return 0
        print("- skip: symlink mismatch (use --force to fix)")
        return 1

    # if it's a directory/file fallback to replication
    if target.exists():
        if target.is_file():
            if not force:
                print("- skip: target is file (use --force to replace)")
                return 1
            remove_target(target, dry_run)
        replicate_dir(src, target, dry_run)
        return 0

    # missing target: try symlink first
    try:
        create_symlink(link_target, target, dry_run)
        return 0
    except OSError as exc:
        print(f"- warn: symlink create failed ({exc}); fallback to replicate")
        replicate_dir(src, target, dry_run)
        return 0


def main() -> int:
    args = parse_args()
    try:
        selected = parse_targets(args.targets)
    except ValueError as exc:
        print(f"❌ {exc}")
        return 1

    mappings = list_mappings(ROOT_DIR, selected)
    if not mappings:
        print("⚠️ No applicable targets found in this repository")
        return 0

    print("=" * 70)
    print("AGENTS SYMLINK REPAIR")
    print("=" * 70)
    print(f"Mode: {'dry-run' if args.dry_run else args.mode}")
    print(f"Targets: {', '.join(sorted(selected))}")

    failures = 0
    for label, src, dst, link_target in mappings:
        failures += process_mapping(
            label=label,
            src=src,
            target=dst,
            link_target=link_target,
            mode=args.mode,
            dry_run=args.dry_run,
            force=args.force,
        )

    print()
    if failures:
        print(f"⚠️ Completed with {failures} skipped/failed item(s)")
        return 1
    print("✅ Completed successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())

