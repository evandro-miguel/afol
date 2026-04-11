#!/usr/bin/env python3
"""Centralized configuration loader for .agents tooling."""

from __future__ import annotations

import os
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
        "docs_dir": "docs",
        "wb_dir": ".agents/wb",
        "active_session_file": ".agents/wb/.active_session",
        "templates_dir": "docs/templates",
        "standards_dir": "docs/standards",
        "knowledge_dir": "docs/knowledge",
        "lessons_dir": "docs/lessons",
        "patterns_dir": "docs/patterns",
        "agentic_docs_dir": "docs/agentic",
        "telemetry_docs_dir": "docs/telemetry",
        "arc_dir": "docs/arc",
        "map_dir": "docs/map",
        "roadmap_file": "docs/arc/GENERAL-ROADMAP.md",
        "specs_dir": "docs/arc/SPECS",
        "decisions_dir": "docs/arc/DECISIONS",
    },
    "time": {
        "default_offset": "+00:00",
        "wb_offset": "-03:00",
    },
    "workflow": {
        "artifact_manifest": {
            "version": 1,
            "enabled": True,
            "source": ".agents/agents.config",
            "artifacts": [
                {
                    "doc_type": "brainstorm",
                    "template": "brainstorm.md",
                    "phase": "planning",
                    "purpose": "Capture real option analysis before committing to a direction.",
                },
                {
                    "doc_type": "research",
                    "template": "research.md",
                    "phase": "planning",
                    "purpose": "Preserve findings, sources, and unknowns that materially affect the work.",
                },
                {
                    "doc_type": "explorer-check",
                    "template": "explorer-check.md",
                    "phase": "planning",
                    "depends_on": ["brainstorm"],
                    "purpose": "Prove the current repo was inspected and the plan is grounded in real code.",
                },
                {
                    "doc_type": "plan",
                    "template": "plan.md",
                    "phase": "planning",
                    "depends_on": ["brainstorm", "research", "explorer-check"],
                    "purpose": "Define the concrete execution path for work that will actually be performed.",
                },
                {
                    "doc_type": "task",
                    "template": "task.md",
                    "phase": "delivery",
                    "depends_on": ["plan"],
                    "purpose": "Track executable work items with owners, state, and evidence expectations.",
                },
                {
                    "doc_type": "spec",
                    "template": "spec.md",
                    "phase": "delivery",
                    "flag": "use_spec",
                    "replacements": {"<spec_role>": "workstream"},
                    "depends_on": ["plan"],
                    "purpose": "Describe localized implementation intent when the parent spec is not enough.",
                },
                {
                    "doc_type": "spec-lite",
                    "template": "spec-lite.md",
                    "phase": "delivery",
                    "flag": "use_spec_lite",
                    "depends_on": ["plan"],
                    "purpose": "Capture a lightweight scoped intent when a full child spec would be excessive.",
                },
                {
                    "doc_type": "log",
                    "template": "log.md",
                    "phase": "delivery",
                    "depends_on": ["task"],
                    "purpose": "Record timeline events only after real execution, decisions, or blockers occur.",
                },
                {
                    "doc_type": "report",
                    "template": "report.md",
                    "phase": "delivery",
                    "id_placeholder": "<report_doc_id_or_empty>",
                    "depends_on": ["task", "log"],
                    "purpose": "Summarize delivered changes and verification after real work lands.",
                },
                {
                    "doc_type": "postmortem",
                    "template": "postmortem.md",
                    "phase": "delivery",
                    "depends_on": ["report"],
                    "purpose": "Capture reusable lessons and closure context after a real outcome exists.",
                },
            ],
            "legacy": {
                "planning_order": [
                    "brainstorm",
                    "research",
                    "explorer-check",
                    "plan",
                ],
                "delivery_order": [
                    "task",
                    "spec",
                    "spec-lite",
                    "log",
                    "report",
                    "postmortem",
                ],
                "optional_artifacts": ["spec", "spec-lite"],
                "spec_flags": {
                    "spec": "use_spec",
                    "spec-lite": "use_spec_lite",
                },
            },
        },
        "artifact_policy": {
            "version": 1,
            "default_intent": "delivery",
            "intents": {
                "delivery": {
                    "create": ["task"],
                    "allow": [
                        "brainstorm",
                        "research",
                        "explorer-check",
                        "plan",
                        "task",
                        "spec",
                        "spec-lite",
                        "log",
                        "report",
                        "postmortem",
                    ],
                    "required_context": ["roadmap", "task", "workflow", "product", "guidelines", "tech-stack"],
                },
                "planning": {
                    "create": ["plan"],
                    "allow": ["brainstorm", "research", "explorer-check", "plan", "spec", "spec-lite"],
                    "required_context": ["roadmap", "plan", "workflow", "product", "guidelines", "tech-stack"],
                },
                "research": {
                    "create": ["research"],
                    "allow": ["brainstorm", "research", "explorer-check", "log", "report"],
                    "required_context": ["roadmap", "research", "workflow", "product", "guidelines", "tech-stack"],
                },
                "brainstorming": {
                    "create": ["brainstorm"],
                    "allow": ["brainstorm", "research", "explorer-check", "plan"],
                    "required_context": ["roadmap", "brainstorm", "workflow", "product", "guidelines", "tech-stack"],
                },
                "exploration": {
                    "create": ["explorer-check"],
                    "allow": ["explorer-check", "research", "plan"],
                    "required_context": ["roadmap", "explorer-check", "workflow", "product", "guidelines", "tech-stack"],
                },
                "specification": {
                    "create": ["spec-lite"],
                    "allow": ["research", "explorer-check", "plan", "spec", "spec-lite"],
                    "required_context": ["roadmap", "workflow", "product", "guidelines", "tech-stack"],
                },
                "closure": {
                    "create": ["report"],
                    "allow": ["log", "report", "postmortem"],
                    "required_context": ["roadmap", "report", "workflow", "product", "guidelines", "tech-stack"],
                },
            },
        },
        "max_plan_lines_threshold": 500,
        "governance_required": True,
        "quick_mode_bypasses_governance": True,
        "feature_id_pattern": r"^F-\d{2,3}$",
        "require_brainstorm_before_plan_final": True,
        "require_explorer_check_before_plan_final": True,
        "require_execplan_sections_before_plan_final": True,
        "require_execplan_progress_before_plan_final": True,
        "require_postmortem_before_report_final": True,
        "pack_dir_name": "packs",
        "knowledge_lookup_required_before_major_plan": True,
    },
    "lint": {
        "excluded_path_prefixes": [
            ".agents/tmp/",
            ".tmp/",
            "tmp/",
            ".agents/arc/map/extra/",
            "docs/map/extra/",
            "docs/arc/structure/",
            "scripts/.agent/docs/",
            "scripts/.venv/",
            "skills/",
            ".cache/",
            "cache/",
            "source/",
            "z-arq/",
            ".venv/",
        ]
    },
    "doctor": {
        "required_folders": [
            "docs/templates",
            "docs/standards",
            "docs/knowledge",
            "docs/lessons",
            "docs/patterns",
            "docs/agentic",
            "docs/telemetry",
            "docs/arc",
            "docs/arc/SPECS",
            "docs/arc/DECISIONS",
            "docs/arc/structure",
            "docs/map",
            ".agents/tmp",
            ".agents/wb",
            ".agents/rules",
            ".agents/scripts",
            ".agents/skills",
            ".agents/z-arq",
        ],
        "required_templates": [
            "plan.md",
            "task.md",
            "report.md",
            "log.md",
            "research.md",
            "brainstorm.md",
            "explorer-check.md",
            "postmortem.md",
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
        "target_files": ["OPENCODE.md", "QWEN.md", "CLAUDE.md", "GEMINI.md"],
    },
    "telemetry": {
        "enabled": True,
        "data_dir": ".agents/data/telemetry",
        "schema_dir": ".agents/data/telemetry/schemas",
        "reports_dir": "docs/telemetry/reports",
    },
    "patterns": {
        "enabled": True,
        "patterns_dir": "docs/patterns",
        "auto_suggest": True,
        "min_effectiveness": "medium",
    },
    "skills_sync": {
        "enabled": False,
        "upstream_repo_url": "",
        "upstream_branch": "main",
        "source_dir": ".agents/source/universal-skills",
        "external_source_dir": "",
        "proposal_branch_prefix": "skills-sync",
        "project_dir": ".agents/skills",
        "mode": "copy",
        "required": False,
        "manifest_file": ".agents/skills-sync.manifest.json",
        "upstream_skills_dir": "skills",
        "default_skills": ["writing-skills", "markdownlint-skill"],
    },
    "repo_map": {
        "runner_path": "",
        "docker_image": "docker-analisys-tools:latest",
        "required_root_docs": ["README.md"],
    },
    "memory": {
        "enabled": True,
        "required": False,
        "provider": "basic_memory",
        "mode": "contract",
        "authority": "auxiliary",
        "project": "main",
        "workspace": "",
        "runtime_server": "basic_memory",
        "search_tool": "search_notes",
        "context_tool": "build_context",
        "recent_tool": "recent_activity",
        "show_tool": "read_note",
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


def get_active_session_file_path(root: Path, config: Dict[str, Any]) -> Path:
    """Resolve active-session pointer path, allowing per-process override."""
    override = os.environ.get("AGENTS_ACTIVE_SESSION_FILE")
    if override:
        return resolve_repo_path(root, override)
    return get_cfg_path(root, config, "active_session_file")


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
