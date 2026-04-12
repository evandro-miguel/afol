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


@dataclass(frozen=True)
class RuntimeConfig:
    repo_root: Path
    search_roots: tuple[Path, ...]
    write_blocklist: tuple[str, ...]
    archive_root: Path
    journal_root: Path
    required_folders: tuple[str, ...]
    required_templates: tuple[str, ...]



def _walk_up(start: Path) -> list[Path]:
    current = start.resolve()
    return [current, *current.parents]



def find_repo_root(start: Path | None = None) -> Path:
    env_root = os.environ.get("AGENTIC_REPO_ROOT", "").strip()
    if env_root:
        return Path(env_root).expanduser().resolve()

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



def build_runtime_config(repo_root: Path | None = None) -> RuntimeConfig:
    root = find_repo_root(repo_root)
    raw = load_agents_config(root)

    docs_dir = _path_from_cfg(root, raw, "docs_dir", "docs")
    wb_dir = _path_from_cfg(root, raw, "wb_dir", ".agents/wb")
    skills_dir = root / ".agents" / "skills"
    knowledge_dir = _path_from_cfg(root, raw, "knowledge_dir", "docs/knowledge")
    map_dir = _path_from_cfg(root, raw, "map_dir", "docs/map")
    arc_dir = _path_from_cfg(root, raw, "arc_dir", "docs/arc")
    agentic_docs_dir = _path_from_cfg(root, raw, "agentic_docs_dir", "docs/agentic")

    search_roots = tuple(
        path for path in [docs_dir, knowledge_dir, map_dir, arc_dir, agentic_docs_dir, wb_dir, skills_dir] if path.exists()
    )
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
    )
