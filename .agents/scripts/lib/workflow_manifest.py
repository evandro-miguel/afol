#!/usr/bin/env python3
"""Shared workflow artifact catalog and policy helpers."""

from __future__ import annotations

from typing import Any, Dict, TypedDict


class ArtifactManifestEntry(TypedDict, total=False):
    """Declarative definition for a governed workstream artifact."""

    doc_type: str
    template: str
    phase: str
    flag: str
    id_placeholder: str
    replacements: Dict[str, str]
    depends_on: list[str]
    purpose: str


class ArtifactIntentProfile(TypedDict, total=False):
    """Declarative creation/validation policy for a workstream intent."""

    create: list[str]
    allow: list[str]
    required_context: list[str]


DEFAULT_ARTIFACT_MANIFEST: tuple[ArtifactManifestEntry, ...] = (
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
        "doc_type": "spec-child",
        "template": "spec-child.md",
        "phase": "delivery",
        "flag": "use_spec_child",
        "replacements": {"<spec_role>": "child"},
        "depends_on": ["plan"],
        "purpose": "Capture the canonical child spec for scoped workstream implementation intent.",
    },
    {
        "doc_type": "spec-test",
        "template": "spec-test.md",
        "phase": "delivery",
        "flag": "use_spec_test",
        "replacements": {"<spec_role>": "test-strategy"},
        "depends_on": ["plan"],
        "purpose": "Capture focused test strategy intent, scope, and verification boundaries.",
    },
    {
        "doc_type": "spec-lite",
        "template": "spec-lite.md",
        "phase": "delivery",
        "flag": "use_spec_lite",
        "depends_on": ["plan"],
        "purpose": "Legacy compatibility alias for older lightweight scoped intent artifacts.",
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
)

DEFAULT_ARTIFACT_POLICY: Dict[str, Any] = {
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
                "spec-child",
                "spec-test",
                "spec-lite",
                "log",
                "report",
                "postmortem",
            ],
            "required_context": ["roadmap", "task", "workflow", "product", "guidelines", "tech-stack"],
        },
        "planning": {
            "create": ["plan"],
            "allow": [
                "brainstorm",
                "research",
                "explorer-check",
                "plan",
                "spec",
                "spec-child",
                "spec-test",
                "spec-lite",
            ],
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
            "create": ["spec-child"],
            "allow": ["research", "explorer-check", "plan", "spec", "spec-child", "spec-test", "spec-lite"],
            "required_context": ["roadmap", "workflow", "product", "guidelines", "tech-stack"],
        },
        "closure": {
            "create": ["report"],
            "allow": ["log", "report", "postmortem"],
            "required_context": ["roadmap", "report", "workflow", "product", "guidelines", "tech-stack"],
        },
    },
}


def _normalize_string_mapping(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in raw.items()
        if isinstance(key, str) and isinstance(value, str)
    }


def _normalize_string_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(item).strip() for item in raw if isinstance(item, str) and str(item).strip()]


def coerce_manifest_entry(raw: Any) -> ArtifactManifestEntry | None:
    """Normalize a raw manifest entry into a validated entry."""
    if not isinstance(raw, dict):
        return None

    doc_type = str(raw.get("doc_type", "")).strip()
    template = str(raw.get("template", "")).strip()
    phase = str(raw.get("phase", "delivery")).strip()
    if not doc_type or not template or phase not in {"planning", "delivery"}:
        return None

    entry: ArtifactManifestEntry = {
        "doc_type": doc_type,
        "template": template,
        "phase": phase,
    }

    flag = str(raw.get("flag", "")).strip()
    if flag:
        entry["flag"] = flag

    id_placeholder = str(raw.get("id_placeholder", "")).strip()
    if id_placeholder:
        entry["id_placeholder"] = id_placeholder

    replacements = _normalize_string_mapping(raw.get("replacements", {}))
    if replacements:
        entry["replacements"] = replacements

    depends_on = _normalize_string_list(raw.get("depends_on", []))
    if depends_on:
        entry["depends_on"] = depends_on

    purpose = str(raw.get("purpose", "")).strip()
    if purpose:
        entry["purpose"] = purpose

    return entry


def coerce_artifact_manifest(raw: Any) -> tuple[ArtifactManifestEntry, ...]:
    """Build artifact manifest from config with fallback to defaults."""
    if not isinstance(raw, dict):
        return DEFAULT_ARTIFACT_MANIFEST

    raw_artifacts = raw.get("artifacts")
    if isinstance(raw_artifacts, list):
        entries = [coerce_manifest_entry(entry) for entry in raw_artifacts]
        normalized = [entry for entry in entries if entry]
        if normalized:
            return tuple(normalized)

    return DEFAULT_ARTIFACT_MANIFEST


def default_doc_id_placeholder(doc_type: str) -> str:
    return f"<{doc_type.replace('-', '_')}_doc_id>"


def manifest_id_placeholders(manifest: tuple[ArtifactManifestEntry, ...]) -> dict[str, str]:
    return {
        entry["doc_type"]: entry.get("id_placeholder", default_doc_id_placeholder(entry["doc_type"]))
        for entry in manifest
    }


def load_artifact_manifest(workflow_cfg: Dict[str, Any]) -> tuple[ArtifactManifestEntry, ...]:
    """Load and normalize the artifact manifest from workflow config."""
    return coerce_artifact_manifest(workflow_cfg.get("artifact_manifest", {}))


def coerce_intent_profile(raw: Any, valid_doc_types: set[str]) -> ArtifactIntentProfile | None:
    """Normalize a raw intent policy entry."""
    if not isinstance(raw, dict):
        return None

    create = [item for item in _normalize_string_list(raw.get("create", [])) if item in valid_doc_types]
    allow = [item for item in _normalize_string_list(raw.get("allow", [])) if item in valid_doc_types]
    required_context = _normalize_string_list(raw.get("required_context", []))

    if not create and not allow and not required_context:
        return None

    profile: ArtifactIntentProfile = {}
    if create:
        profile["create"] = create
    if allow:
        profile["allow"] = allow
    if required_context:
        profile["required_context"] = required_context
    return profile


def load_artifact_policy(
    workflow_cfg: Dict[str, Any],
    manifest: tuple[ArtifactManifestEntry, ...] | None = None,
) -> tuple[str, Dict[str, ArtifactIntentProfile]]:
    """Load creation/context policy with safe defaults."""
    catalog = manifest or DEFAULT_ARTIFACT_MANIFEST
    valid_doc_types = {entry["doc_type"] for entry in catalog}
    raw_policy = workflow_cfg.get("artifact_policy", {})
    default_intent = str(raw_policy.get("default_intent", DEFAULT_ARTIFACT_POLICY["default_intent"])).strip() or str(
        DEFAULT_ARTIFACT_POLICY["default_intent"]
    )
    raw_intents = raw_policy.get("intents", {})

    profiles: Dict[str, ArtifactIntentProfile] = {}
    if isinstance(raw_intents, dict):
        for name, profile_raw in raw_intents.items():
            if not isinstance(name, str) or not name.strip():
                continue
            profile = coerce_intent_profile(profile_raw, valid_doc_types)
            if profile:
                profiles[name.strip()] = profile

    if not profiles:
        for name, profile_raw in DEFAULT_ARTIFACT_POLICY["intents"].items():
            profile = coerce_intent_profile(profile_raw, valid_doc_types)
            if profile:
                profiles[name] = profile

    if default_intent not in profiles:
        default_intent = "delivery" if "delivery" in profiles else next(iter(profiles), "delivery")

    return default_intent, profiles
