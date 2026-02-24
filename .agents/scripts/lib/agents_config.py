#!/usr/bin/env python3
"""Centralized configuration loader for .agents tooling."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

CONFIG_PATHS = (".agents/agents.config", "agents.config")

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": 1,
    "paths": {
        "agents_dir": ".agents",
        "wb_dir": ".agents/wb",
        "active_session_file": ".agents/wb/.active_session",
        "templates_dir": ".agents/a-docs/templates",
        "arc_dir": ".agents/arc",
        "specs_dir": ".agents/arc/SPECS",
        "decisions_dir": ".agents/arc/DECISIONS",
    },
    "time": {
        "default_offset": "+00:00",
        "wb_offset": "-03:00",
    },
    "lint": {
        "excluded_path_prefixes": [
            "arc/structure/",
            "scripts/.agent/docs/",
            ".cache/",
            "cache/",
            "z-arq/",
        ]
    },
    "doctor": {
        "required_folders": [
            "a-docs/templates",
            "a-docs/standards",
            "a-docs/lessons",
            "a-docs/arc",
            "a-docs/specs",
            "arc",
            "arc/SPECS",
            "arc/DECISIONS",
            "wb",
            "rules",
            "scripts",
            "skills",
            "z-arq",
        ],
        "required_templates": [
            "plan.md",
            "task.md",
            "report.md",
            "log.md",
            "research.md",
            "brainstorm.md",
            "blocks.md",
            "spec.md",
            "spec-lite.md",
            "adr.md",
            "architecture.md",
            "roadmap.md",
        ],
    },
    "sync": {
        "source_file": "AGENTS.md",
        "target_files": ["QWEN.md", "CLAUDE.md", "GEMINI.md"],
    },
    "skills_sync": {
        "enabled": False,
        "upstream_repo_url": "",
        "upstream_branch": "main",
        "pool_dir": ".agents/cache/universal-skills",
        "project_dir": "skills",
        "mode": "copy",
        "required": False,
        "manifest_file": ".agents/skills-sync.manifest.json",
        "upstream_skills_dir": "skills",
        "default_skills": ["writing-skills", "markdownlint-skill"],
    },
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in [current, *current.parents]:
        # Primary discovery: repo root has .agents/agents.config.
        if (candidate / ".agents" / "agents.config").exists():
            return candidate
        # Backward compatibility: root-level agents.config plus .agents folder.
        if (candidate / "agents.config").exists() and (candidate / ".agents").exists():
            return candidate
        # If caller starts under .agents/, map back to parent repo root.
        if candidate.name == ".agents" and (candidate / "agents.config").exists():
            return candidate.parent
        if (candidate / ".agents").exists() and candidate.name != ".agents":
            return candidate
    return current


def load_agents_config(repo_root: Path | None = None) -> tuple[Path, Dict[str, Any]]:
    root = find_repo_root(repo_root)
    config = DEFAULT_CONFIG
    cfg_path = next((root / rel for rel in CONFIG_PATHS if (root / rel).exists()), None)

    if cfg_path is not None:
        if yaml is None:
            raise RuntimeError("PyYAML is required to load agents.config")
        loaded = yaml.safe_load(cfg_path.read_text()) or {}
        if not isinstance(loaded, dict):
            raise ValueError("agents.config must be a YAML mapping")
        config = _deep_merge(DEFAULT_CONFIG, loaded)

    return root, config


def resolve_repo_path(root: Path, raw_path: str) -> Path:
    p = Path(raw_path)
    if p.is_absolute():
        return p
    return (root / p).resolve()


def get_cfg_path(root: Path, config: Dict[str, Any], key: str) -> Path:
    paths = config.get("paths", {})
    raw = paths.get(key)
    if not raw:
        raise KeyError(f"Missing paths.{key} in configuration")
    return resolve_repo_path(root, str(raw))


def parse_offset(offset: str) -> timezone:
    value = offset.strip()
    if value == "Z":
        return timezone.utc
    if len(value) != 6 or value[0] not in {"+", "-"} or value[3] != ":":
        raise ValueError(f"Invalid timezone offset format: {offset}")
    hours = int(value[1:3])
    minutes = int(value[4:6])
    delta = timedelta(hours=hours, minutes=minutes)
    if value[0] == "-":
        delta = -delta
    return timezone(delta)


def now_iso_with_offset(offset: str) -> str:
    tz = parse_offset(offset)
    return datetime.now(tz).strftime(f"%Y-%m-%dT%H:%M:%S{offset}")


def now_compact_for_session(offset: str) -> str:
    tz = parse_offset(offset)
    return datetime.now(tz).strftime("%y%m%d_%H%M")
