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

MANDATORY_FILES_TO_COPY = [
    Path("AGENTS.md"),
    Path("OPENCODE.md"),
    Path("QWEN.md"),
    Path("CLAUDE.md"),
    Path("GEMINI.md"),
    Path("opencode.json"),
    Path(".agents/agents"),
    Path(".agents/agents.config"),
    Path(".agents/tools.json"),
    Path(".agents/skills-sync.manifest.json"),
    Path(".agents/arc/README.md"),
    Path(".agents/arc/ARCHITECTURE.md"),
    Path(".agents/arc/GENERAL-ROADMAP.md"),
    Path(".agents/arc/PROJECT-BRIEF.md"),
    Path(".agents/arc/ENGINEERING-GUIDELINES.md"),
    Path(".agents/arc/TECH-STACK.md"),
]

OPTIONAL_FILES_TO_COPY = [
    Path(".opencode/README.md"),
    Path(".opencode/agent/README.md"),
    Path(".claude/README.md"),
    Path(".claude/rules/README.md"),
    Path(".qwen/README.md"),
    Path(".codex/README.md"),
    Path(".gemini/README.md"),
]

MANDATORY_DIRS_TO_COPY = [
    Path(".agents/scripts"),
    Path(".agents/a-docs"),
    Path(".agents/arc/SPECS"),
    Path(".agents/rules"),
    Path(".agents/skills"),
    Path(".agents/templates"),
    Path(".agents/data/telemetry/schemas"),
]

ENSURE_DIRS = [
    Path(".agents/arc"),
    Path(".agents/arc/SPECS"),
    Path(".agents/arc/DECISIONS"),
    Path(".agents/tmp"),
    Path(".agents/wb"),
    Path(".agents/skills"),
    Path(".agents/z-arq"),
    Path(".agents/data/telemetry"),
    Path(".opencode"),
    Path(".opencode/agent"),
    Path(".claude"),
    Path(".claude/rules"),
    Path(".qwen"),
    Path(".codex"),
    Path(".gemini"),
]

MAKEFILE_INCLUDE = "include .agents/a-docs/standards/Makefile"
MAKEFILE_WRAPPER = """# Makefile wrapper - delegates to .agents/a-docs/standards/Makefile\n# This keeps the root clean while maintaining make functionality\n\n# Include the actual Makefile from a-docs\ninclude .agents/a-docs/standards/Makefile\n"""


def copy_required_files(target: Path, force: bool, dry_run: bool):
    for rel in MANDATORY_FILES_TO_COPY:
        src = ROOT_DIR / rel
        if not src.exists():
            raise FileNotFoundError(f"Mandatory source file missing: {src}")
        dst = target / rel
        safe_copy_file(src, dst, force, dry_run)


def copy_required_dirs(target: Path, force: bool, dry_run: bool):
    for rel in MANDATORY_DIRS_TO_COPY:
        src = ROOT_DIR / rel
        if not src.exists():
            raise FileNotFoundError(f"Mandatory source directory missing: {src}")
        dst = target / rel
        safe_copy_dir(src, dst, force, dry_run)


def copy_optional_files(target: Path, force: bool, dry_run: bool):
    for rel in OPTIONAL_FILES_TO_COPY:
        src = ROOT_DIR / rel
        if not src.exists():
            print_action("skip optional (missing in source)", src)
            continue
        dst = target / rel
        safe_copy_file(src, dst, force, dry_run)


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
            "2. Confirm `.agents/arc/GENERAL-ROADMAP.md` contains the real feature backlog for the target project.",
            "3. Create or adapt the governing parent spec in `.agents/arc/SPECS/` before starting non-trivial implementation.",
            "4. Update `.agents/agents.config` timezone/path settings if needed.",
            "5. Define real verification commands in repo docs (`install/dev/lint/typecheck/test/build`).",
            "6. Confirm mirror docs (`OPENCODE.md`/`QWEN.md`/`CLAUDE.md`/`GEMINI.md`) and runtime folders (`.opencode/.claude/.qwen/.codex/.gemini`) are present.",
            "7. Run `make doctor`, `make lint`, `make test-scripts`, and `make all`.",
            "8. Create the first workstream with `make new THEME=<theme> FEATURE_ID=F-01 PARENT_SPEC=<spec-id>`.",
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
    commands: List[Tuple[str, List[str], bool]] = [
        (
            "sync-agent-docs",
            ["./.agents/agents", "sync", "--force"],
            True,
        ),
        (
            "skills-sync",
            ["./.agents/agents", "skills-sync", "sync"],
            False,
        ),
        (
            "fix-symlinks",
            ["./.agents/agents", "fix-symlinks", "--force"],
            True,
        ),
        (
            "doctor",
            ["make", "-f", ".agents/a-docs/standards/Makefile", "doctor"],
            True,
        ),
        ("lint", ["make", "-f", ".agents/a-docs/standards/Makefile", "lint"], True),
        ("test-scripts", ["make", "-f", ".agents/a-docs/standards/Makefile", "test-scripts"], True),
        ("all", ["make", "-f", ".agents/a-docs/standards/Makefile", "all"], True),
    ]

    for name, cmd, required in commands:
        print(f"\n→ Running post-bootstrap check: {name}")
        result = subprocess.run(cmd, cwd=target)
        if result.returncode != 0:
            if required:
                raise RuntimeError(f"Post-bootstrap check failed: {name}")
            print(f"⚠️  Optional post-bootstrap check failed: {name}")


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

        # Copy mandatory files and directories.
        copy_required_files(target, args.force, args.dry_run)
        copy_required_dirs(target, args.force, args.dry_run)
        copy_optional_files(target, args.force, args.dry_run)

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
