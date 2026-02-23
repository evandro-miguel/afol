#!/usr/bin/env python3
"""Bootstrap .agents system into another repository."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
SOURCE_AGENTS_DIR = ROOT_DIR / ".agents"

FILES_TO_COPY = [
    Path("AGENTS.md"),
    Path(".agents/agents"),
    Path(".agents/agents.config"),
    Path(".agents/tools.json"),
]

DIRS_TO_COPY = [
    Path(".agents/scripts"),
    Path(".agents/a-docs"),
    Path(".agents/rules"),
]

ENSURE_DIRS = [
    Path(".agents/arc"),
    Path(".agents/arc/SPECS"),
    Path(".agents/arc/DECISIONS"),
    Path(".agents/wb"),
    Path(".agents/skills"),
    Path(".agents/z-arq"),
]

MAKEFILE_INCLUDE = "include .agents/a-docs/standards/Makefile"
MAKEFILE_WRAPPER = """# Makefile wrapper - delegates to .agents/a-docs/standards/Makefile\n# This keeps the root clean while maintaining make functionality\n\n# Include the actual Makefile from a-docs\ninclude .agents/a-docs/standards/Makefile\n"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap .agents system into target repo")
    parser.add_argument("target", help="Target repository path")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing")
    parser.add_argument(
        "--skip-checks",
        action="store_true",
        help="Skip post-bootstrap doctor/tools-check verification",
    )
    return parser.parse_args()


def detect_stack(target: Path) -> Dict[str, List[str]]:
    stack: Dict[str, List[str]] = {"signals": [], "commands": []}

    if (target / "package.json").exists():
        stack["signals"].append("Node.js (package.json)")
        try:
            pkg = json.loads((target / "package.json").read_text())
            scripts = pkg.get("scripts", {})
            for key in ["dev", "lint", "test", "build", "typecheck"]:
                if key in scripts:
                    stack["commands"].append(f"npm run {key}")
        except Exception:
            pass

    if (target / "pnpm-lock.yaml").exists():
        stack["signals"].append("pnpm")
    if (target / "bun.lockb").exists() or (target / "bun.lock").exists():
        stack["signals"].append("Bun")
    if (target / "pyproject.toml").exists():
        stack["signals"].append("Python (pyproject.toml)")
        stack["commands"].append("python -m pytest")
    if (target / "go.mod").exists():
        stack["signals"].append("Go")
        stack["commands"].append("go test ./...")
    if (target / "Cargo.toml").exists():
        stack["signals"].append("Rust")
        stack["commands"].append("cargo test")

    if not stack["signals"]:
        stack["signals"].append("No known stack markers detected")

    return stack


def print_action(action: str, path: Path):
    print(f"- {action}: {path}")


def safe_copy_file(src: Path, dst: Path, force: bool, dry_run: bool):
    if dst.exists() and not force:
        print_action("skip (exists)", dst)
        return
    print_action("copy file", dst)
    if dry_run:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def safe_copy_dir(src: Path, dst: Path, force: bool, dry_run: bool):
    if dst.exists() and force:
        print_action("replace dir", dst)
        if not dry_run:
            shutil.rmtree(dst)
    elif dst.exists() and not force:
        print_action("skip dir (exists)", dst)
        return

    print_action("copy dir", dst)
    if dry_run:
        return
    shutil.copytree(
        src,
        dst,
        ignore=shutil.ignore_patterns(".venv", "__pycache__", "*.pyc", ".structure-cache.json"),
    )


def ensure_dirs(target: Path, dry_run: bool):
    for rel in ENSURE_DIRS:
        p = target / rel
        if p.exists():
            continue
        print_action("mkdir", p)
        if not dry_run:
            p.mkdir(parents=True, exist_ok=True)


def ensure_makefile(target: Path, dry_run: bool):
    makefile = target / "Makefile"
    if not makefile.exists():
        print_action("create", makefile)
        if not dry_run:
            makefile.write_text(MAKEFILE_WRAPPER)
        return

    content = makefile.read_text()
    if MAKEFILE_INCLUDE in content:
        print_action("makefile include already present", makefile)
        return

    print_action("append include", makefile)
    if dry_run:
        return
    with makefile.open("a") as f:
        f.write("\n\n# .agents include\n")
        f.write(MAKEFILE_INCLUDE + "\n")


def write_adaptation_doc(target: Path, stack: Dict[str, List[str]], dry_run: bool):
    out = target / ".agents" / "a-docs" / "standards" / "bootstrap-adaptation.md"
    body = [
        "---",
        "doc_type: standard",
        'id: "bootstrap-adaptation"',
        "status: draft",
        'created_at: "YYYY-MM-DDTHH:MM:SSZ"',
        'updated_at: "YYYY-MM-DDTHH:MM:SSZ"',
        "---",
        "",
        "# Bootstrap Adaptation Checklist",
        "",
        "## Detected Stack Signals",
    ]
    body.extend([f"- {s}" for s in stack["signals"]])
    body.extend(
        [
            "",
            "## Suggested Project Command Candidates",
        ]
    )
    if stack["commands"]:
        body.extend([f"- `{c}`" for c in sorted(set(stack["commands"]))])
    else:
        body.append("- No command candidates detected automatically")

    body.extend(
        [
            "",
            "## Mandatory Adaptations",
            "",
            "1. Fill placeholders in `AGENTS.md` for project goal, stack, and structure.",
            "2. Update `.agents/agents.config` timezone/path settings if needed.",
            "3. Define real verification commands in repo docs (`install/dev/lint/typecheck/test/build`).",
            "4. Run `make doctor`, `make tools-check`, and `make all`.",
            "5. Create first workstream with `make new THEME=<theme>`.",
            "",
            "## Verification Evidence",
            "",
            "- Command: `<command>`",
            "- Result: `<pass/fail>`",
            "- Evidence: `<output snippet or link>`",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )

    print_action("write adaptation doc", out)
    if not dry_run:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("\n".join(body))


def run_post_checks(target: Path):
    commands: List[Tuple[str, List[str]]] = [
        (
            "doctor",
            ["make", "-f", ".agents/a-docs/standards/Makefile", "doctor"],
        ),
        (
            "tools-check",
            ["make", "-f", ".agents/a-docs/standards/Makefile", "tools-check"],
        ),
    ]

    for name, cmd in commands:
        print(f"\n→ Running post-bootstrap check: {name}")
        result = subprocess.run(cmd, cwd=target)
        if result.returncode != 0:
            raise RuntimeError(f"Post-bootstrap check failed: {name}")


def validate_target(target: Path, dry_run: bool):
    if not target.exists():
        if dry_run:
            target.mkdir(parents=True, exist_ok=True)
        else:
            raise FileNotFoundError(f"Target directory not found: {target}")
    if not target.is_dir():
        raise FileNotFoundError(f"Target path is not a directory: {target}")
    if target.resolve() == ROOT_DIR.resolve():
        raise ValueError("Target must be a different repository path")


def main() -> int:
    args = parse_args()
    target = Path(args.target).resolve()

    print("=" * 70)
    print("AGENTS BOOTSTRAP")
    print("=" * 70)
    print(f"Source: {ROOT_DIR}")
    print(f"Target: {target}")
    print(f"Mode:   {'dry-run' if args.dry_run else 'apply'}")
    print()

    try:
        validate_target(target, args.dry_run)

        stack = detect_stack(target)
        print("Detected stack:")
        for signal in stack["signals"]:
            print(f"  - {signal}")

        # Copy core files
        for rel in FILES_TO_COPY:
            src = ROOT_DIR / rel
            dst = target / rel
            if src.exists():
                safe_copy_file(src, dst, args.force, args.dry_run)

        # Copy core directories
        for rel in DIRS_TO_COPY:
            src = ROOT_DIR / rel
            dst = target / rel
            if src.exists():
                safe_copy_dir(src, dst, args.force, args.dry_run)

        ensure_dirs(target, args.dry_run)
        ensure_makefile(target, args.dry_run)
        write_adaptation_doc(target, stack, args.dry_run)

        if not args.dry_run and not args.skip_checks:
            run_post_checks(target)

        print("\n✅ Bootstrap completed")
        if args.dry_run:
            print("Dry-run only: no files were written")
        else:
            print("Next: open `.agents/a-docs/standards/bootstrap-adaptation.md` in target repo")
        return 0

    except Exception as exc:
        print(f"\n❌ Bootstrap failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
