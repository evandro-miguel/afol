#!/usr/bin/env python3
"""Bootstrap .agents system into another repository."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Sequence, Set, Tuple


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_UNIVERSAL_SKILLS_REPO = "https://github.com/evandro-miguel/skill-universal.git"
DEFAULT_UNIVERSAL_SKILLS_REF = "main"

MANDATORY_FILES_TO_COPY = [
    Path("AGENTS.md"),
    Path("PLANS.md"),
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
    Path(".agents/arc/map/README.md"),
    Path(".agents/arc/SPECS/README.md"),
    Path(".agents/arc/SPECS/TEMPLATE_spec.md"),
    Path(".agents/arc/SPECS/TEMPLATE_spec-lite.md"),
    Path(".agents/arc/DECISIONS/TEMPLATE_adr.md"),
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
    Path(".agents/rules"),
    Path(".agents/skills"),
    Path(".agents/templates"),
    Path(".agents/data/telemetry/schemas"),
]

ENSURE_DIRS = [
    Path(".agents/arc"),
    Path(".agents/arc/SPECS"),
    Path(".agents/arc/DECISIONS"),
    Path(".agents/arc/map"),
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

MAKEFILE_INCLUDE_MARKER = "include .agents/a-docs/standards/Makefile"
MAKEFILE_INCLUDE = (
    "AGENTS_PRESERVE_LOCAL_ALL ?= 1\n"
    "include .agents/a-docs/standards/Makefile"
)
MAKEFILE_WRAPPER = """# Makefile wrapper - delegates to .agents/a-docs/standards/Makefile\n# This keeps the root clean while maintaining make functionality\n\n# Include the actual Makefile from a-docs\ninclude .agents/a-docs/standards/Makefile\n"""

COMMON_COPY_IGNORES = {".venv", "__pycache__", ".structure-cache.json"}
IgnoreFn = Callable[[str, List[str]], Set[str]]
INSTALL_MODE_FULL = "full"
INSTALL_MODE_PARTIAL = "partial"
FULL_STARTER_PARENT_SPECS = [
    {
        "file": Path(".agents/arc/SPECS/000000_0000_feature-f01-parent_spec_01.md"),
        "id": "000000_0000_feature-f01-parent_spec_01",
        "theme": "feature-f01-parent",
        "title": "Feature F-01 Parent",
        "feature_id": "F-01",
    },
    {
        "file": Path(".agents/arc/SPECS/000000_0000_feature-f02-parent_spec_01.md"),
        "id": "000000_0000_feature-f02-parent_spec_01",
        "theme": "feature-f02-parent",
        "title": "Feature F-02 Parent",
        "feature_id": "F-02",
    },
]
PARTIAL_STARTER_PARENT_SPECS = [
    {
        "file": Path(".agents/arc/SPECS/000000_0000_existing-project-adoption_spec_01.md"),
        "id": "000000_0000_existing-project-adoption_spec_01",
        "theme": "existing-project-adoption",
        "title": "Existing Project Adoption",
        "feature_id": "F-01",
    },
    {
        "file": Path(".agents/arc/SPECS/000000_0000_existing-backlog-alignment_spec_01.md"),
        "id": "000000_0000_existing-backlog-alignment_spec_01",
        "theme": "existing-backlog-alignment",
        "title": "Existing Backlog Alignment",
        "feature_id": "F-02",
    },
]


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
        safe_copy_dir(src, dst, force, dry_run, ignore=_ignore_for_dir(rel))


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
        "--partial",
        action="store_true",
        help="Install the scaffold into an existing project with an adoption-oriented baseline",
    )
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


def _common_ignored_names(names: List[str]) -> Set[str]:
    return {name for name in names if name in COMMON_COPY_IGNORES or name.endswith(".pyc")}


def _ignore_sanitized_adocs(src_path: str, names: List[str]) -> Set[str]:
    ignored = _common_ignored_names(names)
    rel = Path(src_path).resolve().relative_to(ROOT_DIR)

    if rel == Path(".agents/a-docs/knowledge"):
        ignored.add("INDEX.md")
    elif rel == Path(".agents/a-docs/lessons"):
        ignored.add("general-lessons.md")
    elif rel == Path(".agents/a-docs/lessons/entries"):
        ignored.update(name for name in names if name.endswith(".md") and name != "README.md")
    elif rel == Path(".agents/a-docs/telemetry"):
        ignored.add("reports")

    return ignored


def _ignore_default(_src_path: str, names: List[str]) -> Set[str]:
    return _common_ignored_names(names)


def _ignore_for_dir(rel: Path) -> IgnoreFn:
    if rel == Path(".agents/a-docs"):
        return _ignore_sanitized_adocs
    return _ignore_default


def safe_copy_dir(src: Path, dst: Path, force: bool, dry_run: bool, ignore: IgnoreFn):
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
    shutil.copytree(src, dst, ignore=ignore)


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
    if MAKEFILE_INCLUDE_MARKER in content:
        print_action("makefile include already present", makefile)
        return

    print_action("append include", makefile)
    if dry_run:
        return
    with makefile.open("a") as f:
        f.write("\n\n# .agents include\n")
        f.write(MAKEFILE_INCLUDE + "\n")


def current_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def render_template(template_rel: Path, timestamp: str) -> str:
    return (ROOT_DIR / template_rel).read_text(encoding="utf-8").replace("YYYY-MM-DDTHH:MM:SSZ", timestamp)


def roadmap_specs_for_mode(install_mode: str) -> List[Dict[str, str]]:
    return PARTIAL_STARTER_PARENT_SPECS if install_mode == INSTALL_MODE_PARTIAL else FULL_STARTER_PARENT_SPECS


def build_full_roadmap(timestamp: str, starter_specs: Sequence[Dict[str, str]]) -> str:
    roadmap = render_template(Path(".agents/a-docs/templates/roadmap.md"), timestamp)
    roadmap = roadmap.replace('id: "ROADMAP_general"', 'id: "000000_0000_general-roadmap_roadmap_01"', 1)
    for spec in starter_specs:
        roadmap = roadmap.replace(
            ".agents/arc/SPECS/<parent-spec-file>.md",
            spec["file"].as_posix(),
            1,
        )
    return roadmap


def build_partial_roadmap(timestamp: str, starter_specs: Sequence[Dict[str, str]]) -> str:
    adoption_spec, backlog_spec = starter_specs
    return "\n".join(
        [
            "---",
            "doc_type: roadmap",
            'id: "000000_0000_existing-project-roadmap_roadmap_01"',
            "status: active",
            'owners: ["orchestrator"]',
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# GENERAL ROADMAP",
            "",
            "## 1) North Star",
            "- Adopt the `.agents` governance layer into an existing project without disrupting the live product.",
            "- Replace temporary adoption placeholders with the project's real feature backlog as soon as discovery is complete.",
            "- Make future implementation traceable through roadmap features, parent specs, and governed workstreams.",
            "",
            "## 2) Mandatory Operating Model",
            "- Existing project work should migrate into this roadmap before new non-trivial implementation starts.",
            "- Every roadmap feature must reference a governing parent spec under `.agents/arc/SPECS/`.",
            "- Workstreams remain execution artifacts and should link back to roadmap and spec context.",
            "",
            "## 3) Current Phase",
            "- Phase: Existing Project Adoption",
            "- Goal: Install the scaffold safely and align the current project backlog with governed artifacts.",
            "- Definition of done:",
            "  - Runtime adapters and `.agents` tooling are installed and validated.",
            "  - The target project has replaced adoption placeholders with real roadmap/spec content.",
            "",
            "## 4) Feature Portfolio",
            "",
            "### F-01 Existing Project Adoption",
            "- Status: planned",
            "- Why: Install the scaffold into an already-running project with minimal disruption.",
            f"- Governing spec: `{adoption_spec['file'].as_posix()}`",
            "- Exit criteria:",
            "  - Runtime surface is installed and validated.",
            "  - Project owners understand the adaptation steps and validation path.",
            "- Delivery tasks:",
            "  - [ ] Validate runtime installation and adapter files",
            "  - [ ] Review generated docs and replace placeholders",
            "",
            "### F-02 Backlog and Spec Alignment",
            "- Status: planned",
            "- Why: The existing product backlog must be mapped into roadmap/spec governance before new work proceeds.",
            f"- Governing spec: `{backlog_spec['file'].as_posix()}`",
            "- Exit criteria:",
            "  - Existing project priorities are rewritten into roadmap features.",
            "  - Parent specs reflect the real product scope instead of scaffold placeholders.",
            "- Delivery tasks:",
            "  - [ ] Replace adoption roadmap placeholders with project features",
            "  - [ ] Create or adapt parent specs for current product areas",
            "",
            "## 5) Adoption Notes",
            "- This roadmap is a starter for an existing project, not a finished product backlog.",
            "- Replace placeholder content before starting non-trivial implementation.",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_roadmap(timestamp: str, install_mode: str, starter_specs: Sequence[Dict[str, str]]) -> str:
    if install_mode == INSTALL_MODE_PARTIAL:
        return build_partial_roadmap(timestamp, starter_specs)
    return build_full_roadmap(timestamp, starter_specs)


def build_project_brief(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: standard",
            'id: "000000_0000_project-brief_standard_01"',
            "status: draft",
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# Project Brief",
            "",
            "## Purpose",
            "- Provide a canonical, repo-local summary of what this project exists to ship.",
            "- Give operators and runtime adapters one stable product reference without creating a second governance tree.",
            "- Keep skill installation and bootstrap behavior explicit so fresh and existing repositories share the same adoption model.",
            "",
            "## Product Goal",
            "- <describe the product or system>",
            "- <describe the main user or operator outcome>",
            "",
            "## Core Outcomes",
            "- <outcome 1>",
            "- <outcome 2>",
            "- <outcome 3>",
            "",
            "## Canonical Sources",
            "- Roadmap: `.agents/arc/GENERAL-ROADMAP.md`",
            "- Goal-state canon: `.agents/arc/README.md`, `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `SPECS/`, and `DECISIONS/`",
            "- Current-state evidence: `.agents/arc/map/` when the repo adopts repository maps or analysis surfaces",
            "- Primary workflow standard: `.agents/a-docs/standards/workflow.md`",
            "- Runtime governance source: `AGENTS.md`",
            "- Skills baseline: `.agents/skills-sync.manifest.json` and `.agents/a-docs/standards/skills-sync.md`",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_tech_stack(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: standard",
            'id: "000000_0000_tech-stack_standard_01"',
            "status: draft",
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# Tech Stack",
            "",
            "## Primary Stack",
            "- <language/runtime>",
            "- <frameworks/libraries>",
            "- <package/build tool>",
            "- <data or artifact formats>",
            "",
            "## Runtime Surface",
            "- Canonical governance: `AGENTS.md` and `.agents/*`",
            "- Primary runtimes: OpenCode, Codex, and Qwen",
            "- Additional mirrors/adapters: Claude and Gemini when needed for portability",
            "",
            "## Verification Stack",
            "- <lint command>",
            "- <typecheck command or N/A>",
            "- <unit/integration test command>",
            "- `make lint`, `make test-scripts`, and `make all` for scaffold validation",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_engineering_guidelines(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: standard",
            'id: "000000_0000_engineering-guidelines_standard_01"',
            "status: draft",
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# Engineering Guidelines",
            "",
            "## Working Rules",
            "- Roadmap and parent spec must exist before non-trivial implementation.",
            "- Workbench artifacts are the execution source of truth.",
            "- Verification evidence must exist before work is treated as complete.",
            "",
            "## Documentation Rules",
            "- Keep `AGENTS.md` and `.agents/*` canonical.",
            "- Keep `arc/map/` descriptive and refreshable; keep desired-state intent in roadmap/spec/ADR/architecture docs outside that folder.",
            "- Update runtime mirrors when canonical runtime guidance changes.",
            "- Use automation for managed metadata such as `updated_at`.",
            "- Treat skills sync as an adoption baseline: fresh installs may initialize a new contract, while partial installs preserve existing project files and add only missing scaffold surface.",
            "",
            "## Safety Rules",
            "- Never commit secrets or runtime credentials.",
            "- Prefer logical, minimally destructive operations.",
            "- Use git as supporting evidence, not as a replacement for governed workbench state.",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_specs_index(timestamp: str, starter_specs: Sequence[Dict[str, str]]) -> str:
    lines = [
        "---",
        "doc_type: specs_index",
        'id: "specs_index"',
        "status: active",
        f'created_at: "{timestamp}"',
        f'updated_at: "{timestamp}"',
        "---",
        "",
        "# SPECS INDEX",
        "",
        "*Generated by `.agents/scripts/agents-bootstrap.py`*",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "|--------|-------|",
        f"| Total | {len(starter_specs)} |",
        f"| Draft | {len(starter_specs)} |",
        "| Active | 0 |",
        "| Final | 0 |",
        "",
        "## Index",
        "",
        "| SPEC ID | Theme | Status | Owner | Links |",
        "|--------:|-------|--------|-------|------|",
    ]

    for spec in starter_specs:
        lines.append(
            f"| {spec['id']} | {spec['theme']} | draft | orchestrator | "
            f"roadmap: .agents/arc/GENERAL-ROADMAP.md |"
        )

    lines.extend(
        [
            "",
            "---",
            "*Index: `.agents/arc/SPECS/INDEX.md`*",
            "",
        ]
    )
    return "\n".join(lines)


def build_decisions_index(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: adr_index",
            'id: "adr_index"',
            "status: active",
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# ADRS INDEX",
            "",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
            "## Summary",
            "",
            "| Metric | Count |",
            "|--------|-------|",
            "| Total | 0 |",
            "| Draft | 0 |",
            "| Active | 0 |",
            "| Final | 0 |",
            "",
            "## Index",
            "",
            "| ADR ID | Theme | Status | Owner | Links |",
            "|-------:|-------|--------|-------|------|",
            "| - | - | - | - | - |",
            "",
            "---",
            "*Index: `.agents/arc/DECISIONS/INDEX.md`*",
            "",
        ]
    )


def build_knowledge_index(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: index",
            'id: "knowledge_index"',
            "status: active",
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# Knowledge Index",
            "",
            "Low-token discovery index for reusable workbench knowledge artifacts.",
            "",
            "- Total indexed docs: 0",
            "",
            "## Status",
            "",
            "- No reusable workbench knowledge has been indexed yet.",
            "- Run `.agents/agents knowledge index` after the target repo accumulates research, reports, or postmortems.",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_parent_spec(timestamp: str, spec: Dict[str, str]) -> str:
    return "\n".join(
        [
            "---",
            "doc_type: spec",
            f'id: "{spec["id"]}"',
            f'theme: "{spec["theme"]}"',
            "status: draft",
            'owners: ["orchestrator"]',
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            f'roadmap_feature: "{spec["feature_id"]}"',
            'spec_role: "parent"',
            'parent_spec: ""',
            "links:",
            '  roadmap: ".agents/arc/GENERAL-ROADMAP.md"',
            '  plan: ""',
            '  task: ""',
            '  report: ""',
            "scope:",
            '  repo_areas: ["<area>"]',
            '  packages: ["<package_or_service>"]',
            "risk_level: low",
            "---",
            "",
            f'# SPEC: {spec["title"]}',
            "",
            "## 1) Feature Intent",
            "- Outcome: <what changes for the user or system>",
            "- Why now: <why this feature matters now>",
            f'- Roadmap feature: `{spec["feature_id"]}`',
            "- Role of this spec: parent",
            "",
            "## 2) Problem",
            "- <what is missing or unclear today>",
            "- <why the current state is insufficient>",
            "",
            "## 3) Users and User Journey",
            "Primary users:",
            "- <user type>",
            "",
            "User journey:",
            "1. <starting point>",
            "2. <interaction or decision>",
            "3. <expected outcome>",
            "",
            "Failure or friction points:",
            "- <problem> -> <expected handling>",
            "",
            "## 4) Experience and Behavior",
            "- Expected behavior:",
            "  - <behavior>",
            "  - <behavior>",
            "- Boundaries:",
            "  - <what should not happen>",
            "  - <what remains out of scope>",
            "",
            "## 5) Scope",
            "In scope:",
            "- <item>",
            "- <item>",
            "",
            "Out of scope:",
            "- <item>",
            "- <item>",
            "",
            "## 6) Child Spec Strategy",
            "- Child specs required: <yes/no>",
            "- Decomposition rule:",
            "  - <when this spec must split into child specs>",
            "- Planned child specs:",
            "  - <child spec + purpose>",
            "",
            "## 7) Constraints and Assumptions",
            "- Assumptions:",
            "  - <assumption>",
            "- Constraints:",
            "  - Compatibility: <constraint>",
            "  - Operational: <constraint>",
            "  - Security/privacy: <constraint>",
            "",
            "## 8) Acceptance",
            "- Success looks like:",
            "  - <acceptance statement>",
            "  - <acceptance statement>",
            "- Review questions:",
            "  - Does this spec explain the feature without code?",
            "  - Can an executor understand the user journey from this document alone?",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def generated_baseline_content(timestamp: str, install_mode: str = INSTALL_MODE_FULL) -> Dict[Path, str]:
    starter_specs = roadmap_specs_for_mode(install_mode)
    baseline = {
        Path(".agents/arc/ARCHITECTURE.md"): render_template(Path(".agents/a-docs/templates/architecture.md"), timestamp),
        Path(".agents/arc/GENERAL-ROADMAP.md"): build_roadmap(timestamp, install_mode, starter_specs),
        Path(".agents/arc/PROJECT-BRIEF.md"): build_project_brief(timestamp),
        Path(".agents/arc/ENGINEERING-GUIDELINES.md"): build_engineering_guidelines(timestamp),
        Path(".agents/arc/TECH-STACK.md"): build_tech_stack(timestamp),
        Path(".agents/arc/SPECS/INDEX.md"): build_specs_index(timestamp, starter_specs),
        Path(".agents/arc/DECISIONS/INDEX.md"): build_decisions_index(timestamp),
        Path(".agents/a-docs/knowledge/INDEX.md"): build_knowledge_index(timestamp),
    }
    for spec in starter_specs:
        baseline[spec["file"]] = build_parent_spec(timestamp, spec)
    return baseline


def safe_write_file(dst: Path, content: str, force: bool, dry_run: bool):
    if dst.exists() and not force:
        print_action("skip generated file (exists)", dst)
        return

    print_action("write generated file", dst)
    if dry_run:
        return

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(content, encoding="utf-8")


def write_generated_baseline(target: Path, force: bool, dry_run: bool, install_mode: str):
    timestamp = current_timestamp()
    for rel, content in generated_baseline_content(timestamp, install_mode).items():
        safe_write_file(target / rel, content, force, dry_run)


def write_adaptation_doc(target: Path, stack: Dict[str, List[str]], dry_run: bool, install_mode: str):
    out = target / ".agents" / "a-docs" / "standards" / "bootstrap-adaptation.md"
    install_label = "partial install for an existing project" if install_mode == INSTALL_MODE_PARTIAL else "full bootstrap for a fresh repo"
    body = [
        "---",
        "doc_type: standard",
        'id: "000000_0000_bootstrap-adaptation_standard_01"',
        "status: draft",
        'created_at: "YYYY-MM-DDTHH:MM:SSZ"',
        'updated_at: "YYYY-MM-DDTHH:MM:SSZ"',
        "---",
        "",
        "# Bootstrap Adaptation Checklist",
        "",
        "## Install Mode",
        f"- {install_label}",
        "",
        "## Current State vs Goal State",
        "- Goal-state canon lives outside `.agents/arc/map/` in docs such as `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `GENERAL-ROADMAP.md`, and `SPECS/`.",
        "- Current-state evidence belongs in `.agents/arc/map/` when the target repo adopts repository maps or analysis surfaces.",
        "- Workbench sessions remain the execution surface; `arc/map/` is never the approval source for roadmap or spec intent.",
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
            "## Skills Baseline",
            "",
            "- The bootstrap output is generic and history-free; it should not import scaffold-local workbench, lessons, or telemetry history into the target repo.",
            "- The current skills manifest is a compatibility layer. It should remain safe for existing repos while the richer universal-skills contract lands.",
            "- Existing projects should install skills without clobbering project-owned files; use the partial path when the target repo already has live content.",
            "- Prefer repo-local skills under `.agents/skills/`; keep Codex global skills lean and avoid using them as the primary project skill surface.",
            "- When the upstream contract becomes repo/ref/profile-based, bootstrap should still only prepare the baseline and leave project-specific selection to the target repo owners.",
            f"- Preferred shared source checkout for apps-style repos: `{(target.parent / 'universal-skills').resolve()}` when the target lives under an `apps/` directory.",
            "",
            "## Mandatory Adaptations",
            "",
            "1. Fill placeholders in `AGENTS.md` for project goal, stack, and structure.",
            "2. Replace the generated starter roadmap/spec placeholders with the real feature backlog for the target project.",
            "3. Create or adapt the governing parent spec in `.agents/arc/SPECS/` before starting non-trivial implementation.",
            "4. Confirm exported docs are generic baselines only; do not treat scaffold-local workbench, lessons, or knowledge history as project history.",
            "5. Treat skills sync as a baseline install step, not a source of project history.",
            "6. Update `.agents/agents.config` timezone/path settings if needed.",
            "7. Define real verification commands in repo docs (`install/dev/lint/typecheck/test/build`).",
            "8. Confirm mirror docs (`OPENCODE.md`/`QWEN.md`/`CLAUDE.md`/`GEMINI.md`) and runtime folders (`.opencode/.claude/.qwen/.codex/.gemini`) are present.",
            "9. Run `make doctor`, `make lint`, `make test-scripts`, and `make all`.",
            "10. Create the first workstream with `make new THEME=<theme> FEATURE_ID=F-01 PARENT_SPEC=<spec-id>`.",
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


def load_universal_skills_source_contract() -> Tuple[str, str]:
    manifest_path = ROOT_DIR / ".agents" / "skills-sync.manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}
        if isinstance(manifest, dict):
            repo = str(manifest.get("repo") or DEFAULT_UNIVERSAL_SKILLS_REPO).strip()
            ref = str(manifest.get("ref") or DEFAULT_UNIVERSAL_SKILLS_REF).strip()
            return repo or DEFAULT_UNIVERSAL_SKILLS_REPO, ref or DEFAULT_UNIVERSAL_SKILLS_REF
    return DEFAULT_UNIVERSAL_SKILLS_REPO, DEFAULT_UNIVERSAL_SKILLS_REF


def is_valid_universal_skills_checkout(path: Path) -> bool:
    return (
        path.exists()
        and (path / "skills").is_dir()
        and (path / "profiles").is_dir()
        and (path / "index.json").exists()
    )


def should_prepare_sibling_universal_skills(target: Path) -> bool:
    return target.parent.name == "apps" and target.name != "universal-skills"


def prepare_sibling_universal_skills_checkout(target: Path, dry_run: bool):
    if not should_prepare_sibling_universal_skills(target):
        return

    sibling = target.parent / "universal-skills"
    if is_valid_universal_skills_checkout(sibling):
        print_action("reuse sibling universal-skills source", sibling)
        return

    if sibling.exists():
        print_action("skip sibling universal-skills prep (path already exists)", sibling)
        return

    repo, ref = load_universal_skills_source_contract()
    print_action("prepare sibling universal-skills source", sibling)
    if dry_run:
        return

    sibling.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["git", "clone", "--branch", ref, repo, str(sibling)],
        cwd=target.parent,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to prepare sibling universal-skills checkout: {sibling}")


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


def validate_target(target: Path, dry_run: bool, install_mode: str):
    if not target.exists():
        if dry_run:
            target.mkdir(parents=True, exist_ok=True)
        elif install_mode == INSTALL_MODE_PARTIAL:
            raise FileNotFoundError(f"Partial install requires an existing target directory: {target}")
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
    install_mode = INSTALL_MODE_PARTIAL if args.partial else INSTALL_MODE_FULL
    print(f"Mode:   {'dry-run' if args.dry_run else 'apply'} ({install_mode})")
    print()

    try:
        validate_target(target, args.dry_run, install_mode)

        stack = detect_stack(target)
        print("Detected stack:")
        for signal in stack["signals"]:
            print(f"  - {signal}")

        prepare_sibling_universal_skills_checkout(target, args.dry_run)

        # Copy mandatory files and directories.
        copy_required_files(target, args.force, args.dry_run)
        copy_required_dirs(target, args.force, args.dry_run)
        copy_optional_files(target, args.force, args.dry_run)

        ensure_dirs(target, args.dry_run)
        write_generated_baseline(target, args.force, args.dry_run, install_mode)
        ensure_makefile(target, args.dry_run)
        write_adaptation_doc(target, stack, args.dry_run, install_mode)

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
