#!/usr/bin/env python3
"""Bootstrap .agents system into another repository."""

from __future__ import annotations

import argparse
import json
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from enum import Enum
from typing import Callable, Dict, Iterable, List, NamedTuple, Sequence, Set, Tuple

from lib.agents_config import now_iso_with_offset


ROOT_DIR = Path(__file__).resolve().parent.parent.parent
TEMPLATE_ROOT = ROOT_DIR / "src" / "project-template"
LOCAL_UNIVERSAL_SKILLS_DIR = Path(".agents/source/universal-skills")

MANDATORY_FILES_TO_COPY = [
    Path("AGENTS.md"),
    Path("CLAUDE.md"),
    Path("Justfile"),
    Path(".agents/agents"),
    Path(".agents/agents-mcp"),
    Path(".agents/agents.config"),
    Path(".agents/tools.json"),
    Path(".agents/skills-sync.manifest.json"),
    Path("docs/arc/README.md"),
    Path("docs/arc/SPECS/README.md"),
    Path("docs/map/structure/README.md"),
]

OPTIONAL_FILES_TO_COPY = [
    Path(".claude/README.md"),
    Path(".claude/rules/README.md"),
]

MANDATORY_DIRS_TO_COPY = [
    Path(".agents/scripts"),
    Path(".agents/rules"),
    Path(".agents/skills"),
    Path(".agents/runtime"),
    Path(".agents/data/telemetry/schemas"),
    Path("docs/agentic"),
    Path("docs/knowledge"),
    Path("docs/lessons"),
    Path("docs/patterns"),
    Path("docs/standards"),
    Path("docs/telemetry"),
    Path("docs/templates"),
]

ENSURE_DIRS = [
    Path("docs"),
    Path("docs/arc"),
    Path("docs/arc/SPECS"),
    Path("docs/arc/DECISIONS"),
    Path("docs/map/structure"),
    Path("docs/map"),
    Path(".agents/tmp"),
    Path(".agents/wb"),
    Path(".agents/skills"),
    Path(".agents/z-arq"),
    Path(".agents/data/telemetry"),
    Path(".claude"),
    Path(".claude/rules"),
]

JUSTFILE_STANDARDS_PATH = "docs/standards/Justfile"
JUSTFILE_IMPORT_MARKER = f"import '{JUSTFILE_STANDARDS_PATH}'"
JUSTFILE_IMPORT_MARKER_DOUBLE = f'import "{JUSTFILE_STANDARDS_PATH}"'
JUSTFILE_MODULE_MARKER = f"mod agents_scaffold '{JUSTFILE_STANDARDS_PATH}'"
JUSTFILE_MODULE_MARKER_DOUBLE = f'mod agents_scaffold "{JUSTFILE_STANDARDS_PATH}"'
JUSTFILE_WRAPPER = """set unstable := true
set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set working-directory := "."

# .agents scaffold module (safe default for downstream recipe overrides)
mod agents_scaffold 'docs/standards/Justfile'
"""
JUSTFILE_MODULE_APPEND = """# .agents scaffold module (collision-safe namespaced recipes)
mod agents_scaffold 'docs/standards/Justfile'
"""
JUSTFILE_IMPORT_RE = re.compile(r'^\s*import\s+["\']docs/standards/Justfile["\']\s*$')
JUSTFILE_MODULE_RE = re.compile(r'^\s*mod\s+agents_scaffold\s+["\']docs/standards/Justfile["\']\s*$')

COMMON_COPY_IGNORES = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".structure-cache.json",
    "node_modules",
    "events.jsonl",
    "settings.local.json",
}
IgnoreFn = Callable[[str, List[str]], Set[str]]
INSTALL_MODE_FULL = "full"
INSTALL_MODE_PARTIAL = "partial"
FULL_STARTER_PARENT_SPECS = [
    {
        "file": Path("docs/arc/SPECS/000000_0000_feature-f01-parent_spec_01.md"),
        "id": "000000_0000_feature-f01-parent_spec_01",
        "theme": "feature-f01-parent",
        "title": "Feature F-01 Parent",
        "feature_id": "F-01",
    },
    {
        "file": Path("docs/arc/SPECS/000000_0000_feature-f02-parent_spec_01.md"),
        "id": "000000_0000_feature-f02-parent_spec_01",
        "theme": "feature-f02-parent",
        "title": "Feature F-02 Parent",
        "feature_id": "F-02",
    },
]
PARTIAL_STARTER_PARENT_SPECS = [
    {
        "file": Path("docs/arc/SPECS/000000_0000_existing-project-adoption_spec_01.md"),
        "id": "000000_0000_existing-project-adoption_spec_01",
        "theme": "existing-project-adoption",
        "title": "Existing Project Adoption",
        "feature_id": "F-01",
    },
    {
        "file": Path("docs/arc/SPECS/000000_0000_existing-backlog-alignment_spec_01.md"),
        "id": "000000_0000_existing-backlog-alignment_spec_01",
        "theme": "existing-backlog-alignment",
        "title": "Existing Backlog Alignment",
        "feature_id": "F-02",
    },
]

BOOTSTRAP_MANIFEST_PATH = Path(".agents/bootstrap-manifest.json")
BOOTSTRAP_MANIFEST_VERSION = 1
POST_CHECK_TIMEOUT_SECONDS = 600
_VERBOSE_OUTPUT = True
_ACTION_COUNTS: Dict[str, int] = {}


class BootstrapAction(str, Enum):
    CREATE = "create"
    SKIP_IDENTICAL = "skip-identical"
    UPDATE_MANAGED = "update-managed"
    CONFLICT_USER_EDITED = "conflict-user-edited"
    PRESERVE_UNMANAGED = "preserve-unmanaged"
    DELETE_STALE_MANAGED = "delete-stale-managed"


class ManagedFileEntry(NamedTuple):
    path: str
    hash: str


class BootstrapManifest(NamedTuple):
    version: int
    generated_at: str
    managed_files: Dict[str, str]


class BootstrapPlanItem(NamedTuple):
    action: BootstrapAction
    path: Path
    source: Path | None
    reason: str


BOOTSTRAP_RECONCILE_SCOPE: Sequence[Path] = (
    Path("AGENTS.md"),
    Path("CLAUDE.md"),
    Path("Justfile"),
    Path(".agents"),
)


def bootstrap_lock_file(target: Path) -> Path:
    return target / BOOTSTRAP_MANIFEST_PATH


def bootstrap_manifest_payload_from_data(data: object) -> Dict[str, object]:
    if not isinstance(data, dict):
        return {}
    return data


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _managed_entry_key(path: Path) -> str:
    return path.as_posix()


def _collect_dir_file_records(
    source_dir: Path,
    rel: Path,
) -> Dict[Path, Path]:
    entries: Dict[Path, Path] = {}
    ignore = _ignore_for_dir(rel)
    for dirpath, dirnames, filenames in os.walk(source_dir):
        root_path = Path(dirpath)
        ignored_names = ignore(str(dirpath), sorted(list(dirnames) + list(filenames)))

        dirnames[:] = [name for name in dirnames if name not in ignored_names]
        for filename in sorted(filenames):
            if filename in ignored_names:
                continue
            source_file = root_path / filename
            if source_file.is_file():
                rel_file = source_file.resolve().relative_to(TEMPLATE_ROOT)
                entries[rel_file] = source_file
    return entries


def _managed_files_from_template() -> Dict[Path, Path]:
    managed: Dict[Path, Path] = {}
    for rel in MANDATORY_FILES_TO_COPY:
        source_file = _template_source(rel)
        if source_file.is_file():
            managed[rel] = source_file
    for rel in OPTIONAL_FILES_TO_COPY:
        source_file = _template_source(rel)
        if source_file.is_file():
            managed[rel] = source_file
    for rel in MANDATORY_DIRS_TO_COPY:
        source_dir = _template_source(rel)
        if not source_dir.is_dir():
            continue
        managed.update(_collect_dir_file_records(source_dir, rel))
    return managed


def _load_bootstrap_manifest(target: Path) -> BootstrapManifest:
    manifest_path = bootstrap_lock_file(target)
    if not manifest_path.exists():
        return BootstrapManifest(version=BOOTSTRAP_MANIFEST_VERSION, generated_at=current_timestamp(), managed_files={})

    try:
        payload = bootstrap_manifest_payload_from_data(json.loads(manifest_path.read_text(encoding="utf-8")))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse bootstrap manifest {manifest_path}: {exc}") from exc

    managed_files = payload.get("managed_files")
    if not isinstance(managed_files, dict):
        managed_files = {}
    cleaned: Dict[str, str] = {
        k: v
        for k, v in managed_files.items()
        if isinstance(k, str) and isinstance(v, str)
    }
    return BootstrapManifest(
        version=int(payload.get("version", BOOTSTRAP_MANIFEST_VERSION)),
        generated_at=str(payload.get("generated_at", current_timestamp())),
        managed_files=cleaned,
    )


def bootstrap_manifest(target: Path) -> BootstrapManifest:
    managed = _managed_files_from_template()
    return BootstrapManifest(
        version=BOOTSTRAP_MANIFEST_VERSION,
        generated_at=current_timestamp(),
        managed_files={
            _managed_entry_key(rel): file_hash(path) for rel, path in sorted(managed.items(), key=lambda item: _managed_entry_key(item[0]))
        },
    )


def write_bootstrap_manifest(target: Path, manifest: BootstrapManifest):
    manifest_path = bootstrap_lock_file(target)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "version": manifest.version,
                "generated_at": manifest.generated_at,
                "managed_files": manifest.managed_files,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def finalize_bootstrap_manifest(target: Path, dry_run: bool):
    manifest_path = bootstrap_lock_file(target)
    print_action("write bootstrap manifest", manifest_path)
    if dry_run:
        return
    write_bootstrap_manifest(target, bootstrap_manifest(target))


def _iter_preserve_scope_files(target: Path) -> Iterable[Path]:
    seen: Set[str] = set()
    for rel in BOOTSTRAP_RECONCILE_SCOPE:
        scope_root = target / rel
        if not scope_root.exists():
            continue
        if scope_root.is_file():
            yield scope_root
            continue

        for root, dirs, filenames in os.walk(scope_root):
            ignored = _common_ignored_names(sorted(list(dirs) + list(filenames)))
            dirs[:] = [name for name in dirs if name not in ignored]
            for filename in sorted(filenames):
                if filename in ignored:
                    continue
                absolute = Path(root) / filename
                rel_path = absolute.relative_to(target).as_posix()
                if rel_path in seen:
                    continue
                seen.add(rel_path)
                yield absolute


def _classify_reconcile_item(
    rel: Path,
    source_path: Path,
    target_path: Path,
    prev_hash: str | None,
) -> BootstrapPlanItem:
    source_hash = file_hash(source_path)
    if not target_path.exists():
        return BootstrapPlanItem(BootstrapAction.CREATE, target_path, source_path, "missing in target")

    target_hash = file_hash(target_path)
    if target_hash == source_hash:
        return BootstrapPlanItem(
            BootstrapAction.SKIP_IDENTICAL,
            target_path,
            source_path,
            "source and target identical",
        )
    if prev_hash is None:
        return BootstrapPlanItem(
            BootstrapAction.UPDATE_MANAGED,
            target_path,
            source_path,
            "managed change (no prior manifest hash)",
        )
    if prev_hash == source_hash:
        return BootstrapPlanItem(
            BootstrapAction.CONFLICT_USER_EDITED,
            target_path,
            source_path,
            "target diverged from locked managed state",
        )
    if target_hash == prev_hash:
        return BootstrapPlanItem(
            BootstrapAction.UPDATE_MANAGED,
            target_path,
            source_path,
            "source changed since prior manifest",
        )

    return BootstrapPlanItem(
        BootstrapAction.CONFLICT_USER_EDITED,
        target_path,
        source_path,
        "target and source diverged from manifest",
    )


def bootstrap_reconcile_plan(target: Path, manifest: BootstrapManifest | None = None) -> List[BootstrapPlanItem]:
    planned_source = _managed_files_from_template()
    managed_paths = {_managed_entry_key(path) for path in planned_source}
    manifest = manifest or _load_bootstrap_manifest(target)
    actions: List[BootstrapPlanItem] = []

    for rel, source_path in sorted(planned_source.items(), key=lambda item: _managed_entry_key(item[0])):
        target_path = target / rel
        prev_hash = manifest.managed_files.get(_managed_entry_key(rel))
        actions.append(_classify_reconcile_item(rel, source_path, target_path, prev_hash))

    for rel_str, _prev in manifest.managed_files.items():
        if rel_str in managed_paths:
            continue
        stale_path = target / rel_str
        if stale_path.exists():
            actions.append(BootstrapPlanItem(BootstrapAction.DELETE_STALE_MANAGED, stale_path, None, "managed file removed from manifest"))

    for absolute_path in _iter_preserve_scope_files(target):
        rel_str = absolute_path.relative_to(target).as_posix()
        if rel_str in managed_paths:
            continue
        if rel_str in manifest.managed_files:
            continue
        if rel_str == _managed_entry_key(BOOTSTRAP_MANIFEST_PATH):
            continue
        if absolute_path.is_file():
            actions.append(BootstrapPlanItem(BootstrapAction.PRESERVE_UNMANAGED, absolute_path, None, "local file outside managed manifest"))

    return actions

def _template_source(rel: Path) -> Path:
    return TEMPLATE_ROOT / rel


def copy_required_files(target: Path, force: bool, dry_run: bool):
    for rel in MANDATORY_FILES_TO_COPY:
        src = _template_source(rel)
        if not src.exists():
            raise FileNotFoundError(f"Mandatory source file missing: {src}")
        dst = target / rel
        safe_copy_file(src, dst, force, dry_run)


def copy_required_dirs(target: Path, force: bool, dry_run: bool):
    for rel in MANDATORY_DIRS_TO_COPY:
        src = _template_source(rel)
        if not src.exists():
            raise FileNotFoundError(f"Mandatory source directory missing: {src}")
        dst = target / rel
        safe_copy_dir(src, dst, force, dry_run, ignore=_ignore_for_dir(rel))


def copy_optional_files(target: Path, force: bool, dry_run: bool):
    for rel in OPTIONAL_FILES_TO_COPY:
        src = _template_source(rel)
        if not src.exists():
            print_action("skip optional (missing in source)", src)
            continue
        dst = target / rel
        safe_copy_file(src, dst, force, dry_run)


def _wrapper_needs_runtime_refresh(path: Path, markers: Sequence[str]) -> bool:
    if not path.exists():
        return False
    content = path.read_text(encoding="utf-8")
    return any(marker not in content for marker in markers)


def ensure_partial_runtime_surfaces(target: Path, dry_run: bool):
    managed_surfaces: Sequence[Tuple[Path, Sequence[str], str]] = [
        (
            Path(".agents/agents"),
            (
                "run_runtime_and_record",
                'run --project "${SCRIPT_DIR}/runtime" --locked',
                "mcp|agents-mcp)",
                "command-registry",
            ),
            "patch managed wrapper",
        ),
        (
            Path(".agents/agents-mcp"),
            (
                'run --project "${SCRIPT_DIR}/runtime" --locked agentic-mcp',
            ),
            "refresh managed mcp wrapper",
        ),
    ]

    for rel, markers, action in managed_surfaces:
        src = _template_source(rel)
        dst = target / rel
        if not dst.exists():
            safe_copy_file(src, dst, force=False, dry_run=dry_run)
            continue
        if not _wrapper_needs_runtime_refresh(dst, markers):
            continue
        print_action(action, dst)
        if dry_run:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


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
    parser.add_argument("--verbose", action="store_true", help="Show per-file action output")
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
        stack["commands"].append("./.agents/tools/uv/bin/uv run --project . pytest")
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
    _ACTION_COUNTS[action] = _ACTION_COUNTS.get(action, 0) + 1
    if _VERBOSE_OUTPUT:
        print(f"- {action}: {path}")


def print_action_summary() -> None:
    if not _ACTION_COUNTS:
        print("actions: none")
        return
    summary = ", ".join(f"{name}={count}" for name, count in sorted(_ACTION_COUNTS.items()))
    print(f"actions: {summary}")


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


def _ignore_sanitized_docs(src_path: str, names: List[str]) -> Set[str]:
    ignored = _common_ignored_names(names)
    rel = Path(src_path).resolve().relative_to(TEMPLATE_ROOT)

    if rel == Path("docs/knowledge"):
        ignored.add("INDEX.md")
    elif rel == Path("docs/lessons"):
        ignored.add("general-lessons.md")
    elif rel == Path("docs/lessons/entries"):
        ignored.update(name for name in names if name.endswith(".md") and name != "README.md")
    elif rel == Path("docs/telemetry"):
        ignored.add("reports")

    return ignored


def _ignore_default(_src_path: str, names: List[str]) -> Set[str]:
    return _common_ignored_names(names)


def _ignore_for_dir(rel: Path) -> IgnoreFn:
    if rel in {
        Path("docs/knowledge"),
        Path("docs/lessons"),
        Path("docs/telemetry"),
        Path("docs/map/structure"),
    }:
        return _ignore_sanitized_docs
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


def _justfile_has_scaffold_reference(content: str) -> bool:
    return any(
        JUSTFILE_IMPORT_RE.match(line) or JUSTFILE_MODULE_RE.match(line)
        for line in _iter_justfile_directives(content)
    )


def _iter_justfile_directives(content: str) -> List[str]:
    directives: List[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        directives.append(stripped)
    return directives


def _justfile_uses_scaffold_module(content: str) -> bool:
    return any(JUSTFILE_MODULE_RE.match(line) for line in _iter_justfile_directives(content))


def _justfile_uses_root_wrapper(content: str) -> bool:
    return any(JUSTFILE_IMPORT_RE.match(line) for line in _iter_justfile_directives(content))


def ensure_justfile(target: Path, dry_run: bool):
    justfile = target / "Justfile"
    if not justfile.exists():
        print_action("create", justfile)
        if not dry_run:
            justfile.write_text(JUSTFILE_WRAPPER, encoding="utf-8")
        return

    content = justfile.read_text(encoding="utf-8")
    if _justfile_has_scaffold_reference(content):
        print_action("justfile scaffold import/module already present", justfile)
        return

    print_action("append scaffold module", justfile)
    if dry_run:
        return

    with justfile.open("a", encoding="utf-8") as handle:
        if not content.endswith("\n"):
            handle.write("\n")
        handle.write("\n")
        handle.write(JUSTFILE_MODULE_APPEND)


def current_timestamp() -> str:
    return now_iso_with_offset("Z")


def render_template(template_rel: Path, timestamp: str) -> str:
    return _template_source(template_rel).read_text(encoding="utf-8").replace("YYYY-MM-DDTHH:MM:SSZ", timestamp)


def roadmap_specs_for_mode(install_mode: str) -> List[Dict[str, str]]:
    return PARTIAL_STARTER_PARENT_SPECS if install_mode == INSTALL_MODE_PARTIAL else FULL_STARTER_PARENT_SPECS


def build_full_roadmap(timestamp: str, starter_specs: Sequence[Dict[str, str]]) -> str:
    roadmap = render_template(Path("docs/templates/roadmap.md"), timestamp)
    roadmap = roadmap.replace('id: "ROADMAP_general"', 'id: "000000_0000_general-roadmap_roadmap_01"', 1)
    for spec in starter_specs:
        roadmap = roadmap.replace(
            "docs/arc/SPECS/<parent-spec-file>.md",
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
            "- Every roadmap feature must reference a governing parent spec under `docs/arc/SPECS/`.",
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
            "- Roadmap: `docs/arc/GENERAL-ROADMAP.md`",
            "- Goal-state canon: `docs/arc/README.md`, `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `SPECS/`, and `DECISIONS/`",
            "- Current-state evidence: `docs/map/` when the repo adopts repository maps or analysis surfaces",
            "- Primary workflow standard: `docs/standards/workflow.md`",
            "- Runtime governance source: `AGENTS.md`",
            "- Skills baseline: `.agents/skills-sync.manifest.json` and `docs/standards/skills-sync.md`",
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
            "- `just lint`, `just test-scripts`, and `just all` for scaffold validation",
            "",
            "---",
            "*Generated by `.agents/scripts/agents-bootstrap.py`*",
            "",
        ]
    )


def build_current_state_map_readme(timestamp: str) -> str:
    return "\n".join(
        [
            "---",
            'title: "Current-State Map"',
            'description: "Refreshable repository-map surface for current-state evidence"',
            'doc_kind: "map"',
            'version: "bootstrap-baseline"',
            f'created_at: "{timestamp}"',
            f'updated_at: "{timestamp}"',
            "---",
            "",
            "# Current-State Map",
            "",
            "- `docs/map/` is the current-state, descriptive evidence surface.",
            "- Run `./.agents/agents repo-map .` to refresh repository-wide map artifacts.",
            "- Keep goal-state canon in `docs/arc/` and execution history in `.agents/wb/`.",
            "- Bootstrap ships only this generic entrypoint, not source-repo-specific current-state artifacts.",
            "",
            "## Expected Surface",
            "",
            "- Root docs like `README.md`, `ARCHITECTURE.md`, `FEATURES.md`, `API_MAP.md`, and related codemap artifacts may appear here after `repo-map` runs.",
            "- Raw or machine-generated evidence should live under `docs/map/extra/`.",
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
            "- Keep `docs/map/` descriptive and refreshable; keep desired-state intent in roadmap/spec/ADR/architecture docs outside that folder.",
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
            f"roadmap: docs/arc/GENERAL-ROADMAP.md |"
        )

    lines.extend(
        [
            "",
            "---",
            "*Index: `docs/arc/SPECS/INDEX.md`*",
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
            "*Index: `docs/arc/DECISIONS/INDEX.md`*",
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
            '  roadmap: "docs/arc/GENERAL-ROADMAP.md"',
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
        Path("docs/arc/ARCHITECTURE.md"): render_template(Path("docs/templates/architecture.md"), timestamp),
        Path("docs/arc/GENERAL-ROADMAP.md"): build_roadmap(timestamp, install_mode, starter_specs),
        Path("docs/arc/PROJECT-BRIEF.md"): build_project_brief(timestamp),
        Path("docs/arc/ENGINEERING-GUIDELINES.md"): build_engineering_guidelines(timestamp),
        Path("docs/arc/TECH-STACK.md"): build_tech_stack(timestamp),
        Path("docs/arc/SPECS/INDEX.md"): build_specs_index(timestamp, starter_specs),
        Path("docs/arc/DECISIONS/INDEX.md"): build_decisions_index(timestamp),
        Path("docs/knowledge/INDEX.md"): build_knowledge_index(timestamp),
        Path("docs/map/README.md"): build_current_state_map_readme(timestamp),
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
    out = target / "docs" / "standards" / "bootstrap-adaptation.md"
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
        "- Goal-state canon lives outside `docs/map/` in docs such as `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `GENERAL-ROADMAP.md`, and `SPECS/`.",
        "- Current-state evidence belongs in `docs/map/` when the target repo adopts repository maps or analysis surfaces.",
        "- Workbench sessions remain the execution surface; `docs/map/` is never the approval source for roadmap or spec intent.",
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
            f"- Preferred repo-local universal-skills checkout: `{(target / LOCAL_UNIVERSAL_SKILLS_DIR).resolve()}`.",
            "",
            "## Mandatory Adaptations",
            "",
            "1. Fill placeholders in `AGENTS.md` for project goal, stack, and structure.",
            "2. Replace the generated starter roadmap/spec placeholders with the real feature backlog for the target project.",
            "3. Create or adapt the governing parent spec in `docs/arc/SPECS/` before starting non-trivial implementation.",
            "4. Confirm exported docs are generic baselines only; do not treat scaffold-local workbench, lessons, or knowledge history as project history.",
            "5. Treat skills sync as a baseline install step, not a source of project history.",
            "6. Update `.agents/agents.config` timezone/path settings if needed.",
            "7. Define real verification commands in repo docs (`install/dev/lint/typecheck/test/build`).",
            "8. Confirm `AGENTS.md`, `CLAUDE.md`, and the `.claude/` runtime folder are present.",
            "9. Run `just --fmt --check`, `just --list`, and the scaffold validation recipes exposed by the root `Justfile` (fresh baselines use `just --justfile Justfile agents_scaffold::doctor`, `agents_scaffold::lint`, `agents_scaffold::test-scripts`, and `agents_scaffold::all`).",
            "10. Create the first workstream with `.agents/agents new <theme> --feature-id F-01 --parent-spec <spec-id> --spec`.",
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


def load_local_skills_manifest() -> Dict[str, object]:
    manifest_path = ROOT_DIR / ".agents" / "skills-sync.manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _checkout_skill_names(skills_dir: Path) -> Set[str]:
    return {
        item.name
        for item in skills_dir.iterdir()
        if item.is_dir() and (item / "SKILL.md").exists()
    }


def _profile_skill_names(profile_file: Path) -> List[str] | None:
    try:
        payload = json.loads(profile_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    skills = payload.get("skills")
    if not isinstance(skills, list):
        return None
    if any(not isinstance(name, str) for name in skills):
        return None
    return skills


def is_valid_universal_skills_checkout(path: Path) -> bool:
    profiles_dir = path / "profiles"
    expected_profiles = profile_names_for_local_seed()
    skills_dir = path / "skills"
    if not (
        path.exists()
        and skills_dir.is_dir()
        and profiles_dir.is_dir()
        and (path / "index.json").exists()
        and all((profiles_dir / f"{name}.json").exists() for name in expected_profiles)
    ):
        return False

    available_skills = _checkout_skill_names(skills_dir)
    if not available_skills:
        return False

    for profile_file in profiles_dir.glob("*.json"):
        skills = _profile_skill_names(profile_file)
        if skills is None:
            return False
        if any(name not in available_skills for name in skills):
            return False

    return True


def local_project_skills_root() -> Path:
    return ROOT_DIR / ".agents" / "skills"


def local_project_skill_names() -> List[str]:
    skills_root = local_project_skills_root()
    if not skills_root.exists():
        return []
    return sorted(
        item.name
        for item in skills_root.iterdir()
        if item.is_dir() and (item / "SKILL.md").exists()
    )


def _profile_names_from_installs(installs: object) -> Set[str]:
    profile_names: Set[str] = set()
    if not isinstance(installs, list):
        return profile_names
    for entry in installs:
        if not isinstance(entry, dict):
            continue
        profile = entry.get("profile")
        if isinstance(profile, str) and profile.strip():
            profile_names.add(profile.strip())
    return profile_names


def profile_names_for_local_seed() -> List[str]:
    manifest = load_local_skills_manifest()
    profile_names = _profile_names_from_installs(manifest.get("installs"))

    if not profile_names:
        profile_names.add("core")
    return sorted(profile_names)


def write_local_seed_profile(profile_path: Path, skills: Sequence[str]):
    payload = {"name": profile_path.stem, "skills": list(skills)}
    profile_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_local_seed_index(index_path: Path, skills: Sequence[str], profiles: Sequence[str]):
    payload = {
        "generated_by": "agents-bootstrap local seed",
        "generated_at": current_timestamp(),
        "profiles": list(profiles),
        "skills": [
            {
                "name": name,
                "path": f"skills/{name}",
            }
            for name in skills
        ],
    }
    index_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def copy_repo_local_universal_skills_checkout(source: Path, checkout: Path):
    shutil.copytree(
        source,
        checkout,
        ignore=shutil.ignore_patterns(".git", "__pycache__", "*.pyc"),
    )


def seed_repo_local_universal_skills_checkout(checkout: Path) -> bool:
    local_source = ROOT_DIR / LOCAL_UNIVERSAL_SKILLS_DIR
    if is_valid_universal_skills_checkout(local_source):
        copy_repo_local_universal_skills_checkout(local_source, checkout)
        return True

    skill_names = local_project_skill_names()
    if not skill_names:
        return False

    skills_root = checkout / "skills"
    profiles_root = checkout / "profiles"
    skills_root.mkdir(parents=True, exist_ok=True)
    profiles_root.mkdir(parents=True, exist_ok=True)

    source_skills_root = local_project_skills_root()
    for name in skill_names:
        shutil.copytree(source_skills_root / name, skills_root / name)

    profile_names = profile_names_for_local_seed()
    for profile_name in profile_names:
        write_local_seed_profile(profiles_root / f"{profile_name}.json", skill_names)

    write_local_seed_index(checkout / "index.json", skill_names, profile_names)
    return True


def should_prepare_sibling_universal_skills(target: Path) -> bool:
    return target.name != "universal-skills"


def prepare_sibling_universal_skills_checkout(target: Path, dry_run: bool):
    if not should_prepare_sibling_universal_skills(target):
        return

    checkout = target / LOCAL_UNIVERSAL_SKILLS_DIR
    if is_valid_universal_skills_checkout(checkout):
        print_action("reuse repo-local universal-skills source", checkout)
        return

    if checkout.exists():
        print_action("skip repo-local universal-skills prep (path already exists)", checkout)
        return

    print_action("prepare repo-local universal-skills source", checkout)
    if dry_run:
        return

    checkout.parent.mkdir(parents=True, exist_ok=True)
    if seed_repo_local_universal_skills_checkout(checkout):
        print_action("seeded repo-local universal-skills source", checkout)
        return

    raise RuntimeError(
        "Failed to prepare repo-local universal-skills checkout from committed project assets"
    )


def _just_post_check_command(*args: str) -> List[str]:
    return ["just", "--justfile", "Justfile", *args]


def _just_recipe_prefix(target: Path) -> str:
    justfile = target / "Justfile"
    if not justfile.exists():
        return ""

    content = justfile.read_text(encoding="utf-8")
    if _justfile_uses_root_wrapper(content):
        return ""
    if _justfile_uses_scaffold_module(content):
        return "agents_scaffold::"
    return ""


def post_checks_use_just(target: Path) -> bool:
    return shutil.which("just") is not None and (target / "Justfile").exists()


def build_post_check_commands(target: Path, install_mode: str = INSTALL_MODE_FULL) -> List[Tuple[str, List[str], bool]]:
    recipe_prefix = _just_recipe_prefix(target)
    if not post_checks_use_just(target):
        raise RuntimeError("just is required for post-bootstrap checks")
    repo_validation_required = install_mode != INSTALL_MODE_PARTIAL
    commands: List[Tuple[str, List[str], bool]] = [
        (
            "hydrate",
            ["./.agents/agents", "hydrate"],
            True,
        ),
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
    ]
    commands.extend(
        [
            ("fmt-check", _just_post_check_command("--fmt", "--check"), True),
            ("list", _just_post_check_command("--list"), True),
            ("doctor", _just_post_check_command(f"{recipe_prefix}doctor"), True),
            ("lint", _just_post_check_command(f"{recipe_prefix}lint"), repo_validation_required),
            ("test-scripts", _just_post_check_command(f"{recipe_prefix}test-scripts"), repo_validation_required),
            ("all", _just_post_check_command(f"{recipe_prefix}all"), repo_validation_required),
        ]
    )
    return commands


def _format_post_check_output(stdout: object, stderr: object) -> str:
    parts: List[str] = []
    if stdout:
        parts.append(f"stdout:\n{stdout.decode() if isinstance(stdout, bytes) else stdout}")
    if stderr:
        parts.append(f"stderr:\n{stderr.decode() if isinstance(stderr, bytes) else stderr}")
    return "\n".join(parts).strip()


def run_post_checks(target: Path, install_mode: str = INSTALL_MODE_FULL):
    commands = build_post_check_commands(target, install_mode)

    for name, cmd, required in commands:
        print(f"\n→ Running post-bootstrap check: {name}")
        try:
            result = subprocess.run(
                cmd,
                cwd=target,
                capture_output=True,
                text=True,
                timeout=POST_CHECK_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as exc:
            details = _format_post_check_output(exc.stdout, exc.stderr)
            message = f"Post-bootstrap check timed out after {POST_CHECK_TIMEOUT_SECONDS}s: {name}"
            if details:
                message = f"{message}\n{details}"
            if required:
                raise RuntimeError(message) from exc
            print(message)
            continue
        except OSError as exc:
            message = f"Post-bootstrap check could not start: {name}: {exc}"
            if required:
                raise RuntimeError(message) from exc
            print(message)
            continue
        if result.returncode != 0:
            details = _format_post_check_output(result.stdout, result.stderr)
            message = f"Post-bootstrap check failed: {name} (exit {result.returncode})"
            if details:
                message = f"{message}\n{details}"
            if required:
                raise RuntimeError(message)
            print(message)


def validate_target(target: Path, dry_run: bool, install_mode: str):
    if not target.exists():
        if dry_run or install_mode == INSTALL_MODE_FULL:
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
    global _VERBOSE_OUTPUT
    _VERBOSE_OUTPUT = args.verbose
    _ACTION_COUNTS.clear()

    install_mode = INSTALL_MODE_PARTIAL if args.partial else INSTALL_MODE_FULL
    print(
        "bootstrap: "
        f"source={TEMPLATE_ROOT} target={target} mode={'dry-run' if args.dry_run else 'apply'} "
        f"install_mode={install_mode}"
    )

    try:
        validate_target(target, args.dry_run, install_mode)

        stack = detect_stack(target)
        print("detected_stack:")
        for signal in stack["signals"]:
            print(f"  - {signal}")

        prepare_sibling_universal_skills_checkout(target, args.dry_run)

        # Copy mandatory files and directories.
        copy_required_files(target, args.force, args.dry_run)
        copy_required_dirs(target, args.force, args.dry_run)
        copy_optional_files(target, args.force, args.dry_run)
        if install_mode == INSTALL_MODE_PARTIAL:
            ensure_partial_runtime_surfaces(target, args.dry_run)

        ensure_dirs(target, args.dry_run)
        write_generated_baseline(target, args.force, args.dry_run, install_mode)
        ensure_justfile(target, args.dry_run)
        write_adaptation_doc(target, stack, args.dry_run, install_mode)
        finalize_bootstrap_manifest(target, args.dry_run)

        if not args.dry_run and not args.skip_checks:
            run_post_checks(target, install_mode)

        print("✅ Bootstrap completed")
        print_action_summary()
        if args.dry_run:
            print("Dry-run only: no files were written")
        else:
            print("Next: open `docs/standards/bootstrap-adaptation.md` in target repo")
        return 0

    except Exception as exc:
        print_action_summary()
        print(f"❌ Bootstrap failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
