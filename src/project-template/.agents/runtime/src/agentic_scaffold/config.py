from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

DEFAULT_BLOCKLIST = (
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".agents/cache",
    ".agents/data/telemetry/events.jsonl",
)

RUNTIME_DOC_FILENAMES = (
    "AGENTS.md",
    "CLAUDE.md",
)

MANIFEST_MAJOR_SURFACES = (
    "docs/",
    "docs/arc/",
    "docs/map/",
    ".agents/scripts/",
    ".agents/skills/",
    ".agents/wb/",
    ".agents/runtime/",
)

SEARCH_ROOT_PATHS: tuple[tuple[str, str], ...] = (
    ("docs_dir", "docs"),
    ("knowledge_dir", "docs/knowledge"),
    ("map_dir", "docs/map"),
    ("arc_dir", "docs/arc"),
    ("agentic_docs_dir", "docs/agentic"),
    ("wb_dir", ".agents/wb"),
)


@dataclass(frozen=True)
class RuntimeConfig:
    repo_root: Path
    search_roots: tuple[Path, ...]
    write_blocklist: tuple[str, ...]
    archive_root: Path
    journal_root: Path
    required_folders: tuple[str, ...]
    required_templates: tuple[str, ...]
    runtime_docs: tuple[str, ...]
    manifest_major_surfaces: tuple[str, ...]



def _walk_up(start: Path) -> list[Path]:
    current = start.resolve()
    return [current, *current.parents]



def find_repo_root(start: Path | None = None) -> Path:
    def _looks_like_repo_root(candidate: Path) -> bool:
        return (candidate / "AGENTS.md").exists() and (candidate / ".agents").exists()

    env_root = os.environ.get("AGENTIC_REPO_ROOT", "").strip()
    if env_root:
        candidate = Path(env_root).expanduser().resolve()
        if not candidate.exists() or not candidate.is_dir():
            raise FileNotFoundError(f"AGENTIC_REPO_ROOT does not point to a directory: {env_root}")
        if not _looks_like_repo_root(candidate):
            raise FileNotFoundError(f"AGENTIC_REPO_ROOT does not appear to be an AGENTS repo: {candidate}")
        return candidate

    seed = (start or Path.cwd()).resolve()
    if seed.is_file():
        seed = seed.parent
    for candidate in _walk_up(seed):
        if (candidate / "AGENTS.md").exists() and (candidate / ".agents").exists():
            return candidate
    raise FileNotFoundError("Could not locate repository root containing AGENTS.md and .agents/")



def load_agents_config(repo_root: Path) -> dict[str, Any]:
    config_path = repo_root / ".agents" / "agents.config"
    if not config_path.exists():
        return {}
    data = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(".agents/agents.config must parse to a mapping")
    return data



def _path_from_cfg(repo_root: Path, cfg: dict[str, Any], key: str, fallback: str) -> Path:
    rel = str(cfg.get("paths", {}).get(key, fallback)).strip() or fallback
    return (repo_root / rel).resolve()


def _paths_from_cfg(repo_root: Path, cfg: dict[str, Any], entries: tuple[tuple[str, str], ...]) -> tuple[Path, ...]:
    return tuple(
        path
        for key, fallback in entries
        if (path := _path_from_cfg(repo_root, cfg, key, fallback)).exists()
    )



def build_runtime_config(repo_root: Path | None = None) -> RuntimeConfig:
    root = find_repo_root(repo_root)
    raw = load_agents_config(root)

    skills_dir = root / ".agents" / "skills"
    search_root_candidates = list(_paths_from_cfg(root, raw, SEARCH_ROOT_PATHS))
    if skills_dir.exists():
        search_root_candidates.append(skills_dir)
    search_roots = tuple(search_root_candidates)
    archive_root = (root / ".agents" / "z-arq").resolve()
    journal_root = (root / ".agents" / "journal" / "agentic-runtime").resolve()
    doctor_cfg = raw.get("doctor", {}) if isinstance(raw, dict) else {}
    required_folders = tuple(str(item) for item in doctor_cfg.get("required_folders", []) if str(item).strip())
    required_templates = tuple(str(item) for item in doctor_cfg.get("required_templates", []) if str(item).strip())

    return RuntimeConfig(
        repo_root=root,
        search_roots=search_roots,
        write_blocklist=tuple(DEFAULT_BLOCKLIST),
        archive_root=archive_root,
        journal_root=journal_root,
        required_folders=required_folders,
        required_templates=required_templates,
        runtime_docs=RUNTIME_DOC_FILENAMES,
        manifest_major_surfaces=MANIFEST_MAJOR_SURFACES,
    )
