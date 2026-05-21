#!/usr/bin/env python3
"""
Agents New - Create new workstream with all required files.

Creates:
- Session folder with proper naming
- Plan file
- Task file
- Spec file (or spec-child/spec-lite alias)
- Log file

Usage:
    python agents-new.py <theme> [--spec | --spec-child | --spec-lite] [--spec-test] [--plan-only]

Examples:
    python agents-new.py auth-refactor
    python agents-new.py api-endpoint --spec
    python agents-new.py bugfix-login --spec-child
"""

import re
import subprocess
import sys
import json
from pathlib import Path
from typing import Dict, Optional

from lib.agents_config import (
    get_active_session_file_path,
    get_cfg_path,
    load_agents_config,
    now_compact_for_session,
    now_iso_with_offset,
)
from lib.markdown_docs import split_markdown_frontmatter
from lib.workflow_manifest import (
    ArtifactManifestEntry,
    ArtifactIntentProfile,
    coerce_artifact_manifest as _coerce_artifact_manifest_impl,
    coerce_manifest_entry as _coerce_manifest_entry_impl,
    default_doc_id_placeholder as _default_doc_id_placeholder_impl,
    load_artifact_manifest,
    load_artifact_policy,
    manifest_id_placeholders as _manifest_id_placeholders_impl,
)

try:
    from lib.task_integrity import (
        validate_task_board as _validate_task_board_impl,
        validate_plan_concrete_steps as _validate_plan_concrete_steps_impl,
        validate_task_text as _validate_task_text_impl,
    )
except Exception:
    _validate_task_board_impl = None
    _validate_plan_concrete_steps_impl = None
    _validate_task_text_impl = None


META_TASK_RE = re.compile(
    r"\b(?:create|write|make|prepare|draft|build|delega|assign|plan|plano)\b",
    re.IGNORECASE,
)
PLACEHOLDER_TASK_RE = re.compile(r"^\s*(?:<note>|<task description>|todo|tbd)\s*$", re.IGNORECASE)


def _validate_task_text_fallback(task_text: str, source: str = "task") -> None:
    """Fallback task validation when shared integrity module is unavailable."""
    normalized = " ".join(str(task_text or "").split())
    if not normalized:
        raise ValueError(f"{source} requires executable task text.")
    if PLACEHOLDER_TASK_RE.match(normalized):
        raise ValueError(f"{source} contains placeholder task text: '{normalized}'")
    if "plan" in normalized.lower() and META_TASK_RE.search(normalized):
        raise ValueError(f"{source} contains meta-planning task text: '{normalized}'")


def validate_task_text(task_text: str, source: str = "task") -> None:
    """Validate task text for placeholder/meta-planning patterns."""
    if _validate_task_text_impl is not None:
        return _validate_task_text_impl(task_text, source=source)
    return _validate_task_text_fallback(task_text, source=source)


def validate_task_board(body: str, source: str = "task board") -> None:
    """Validate task board text for executable task presence."""
    if _validate_task_board_impl is not None:
        return _validate_task_board_impl(body, source=source)
    if not body or not str(body).strip():
        raise ValueError(f"{source} requires at least one executable task.")


def validate_plan_concrete_steps(body: str, source: str = "plan") -> None:
    """Validate plan concrete steps for executable content."""
    if _validate_plan_concrete_steps_impl is not None:
        return _validate_plan_concrete_steps_impl(body, source=source)
    if not body or not str(body).strip():
        raise ValueError(f"{source} requires at least one concrete step.")
# Configuration
ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
SCRIPTS_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = get_cfg_path(ROOT_DIR, CONFIG, "templates_dir")
AGENTS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "agents_dir")
WB_DIR = get_cfg_path(ROOT_DIR, CONFIG, "wb_dir")
CANONICAL_WB_DIR = AGENTS_DIR / "wb"
ROADMAP_FILE = get_cfg_path(ROOT_DIR, CONFIG, "roadmap_file")
SPECS_DIR = get_cfg_path(ROOT_DIR, CONFIG, "specs_dir")
ACTIVE_SESSION_FILE = get_active_session_file_path(ROOT_DIR, CONFIG)
TELEMETRY_SCRIPT = SCRIPTS_DIR / "agents-telemetry.py"
PATTERNS_SCRIPT = SCRIPTS_DIR / "agents-patterns.py"
WB_OFFSET = CONFIG.get("time", {}).get("wb_offset", "-03:00")
WORKFLOW_CFG = CONFIG.get("workflow", {})
MAX_PLAN_LINES_THRESHOLD = int(WORKFLOW_CFG.get("max_plan_lines_threshold", 500))
GOVERNANCE_REQUIRED = bool(WORKFLOW_CFG.get("governance_required", True))
QUICK_MODE_BYPASSES_GOVERNANCE = bool(WORKFLOW_CFG.get("quick_mode_bypasses_governance", True))
FEATURE_ID_PATTERN = re.compile(WORKFLOW_CFG.get("feature_id_pattern", r"^F-\d{2,3}$"))
PACK_DIR_NAME = str(WORKFLOW_CFG.get("pack_dir_name", "packs")).strip() or "packs"
PLACEHOLDER_PATTERN = re.compile(r"\{([a-zA-Z0-9_.-]+)\}")


def _coerce_manifest_entry(raw):
    return _coerce_manifest_entry_impl(raw)


def _coerce_artifact_manifest(raw):
    return _coerce_artifact_manifest_impl(raw)


def _default_doc_id_placeholder(doc_type: str) -> str:
    return _default_doc_id_placeholder_impl(doc_type)


def _manifest_id_placeholders(manifest: tuple[ArtifactManifestEntry, ...]) -> dict[str, str]:
    return _manifest_id_placeholders_impl(manifest)


ARTIFACT_MANIFEST = load_artifact_manifest(WORKFLOW_CFG)
WORKFLOW_ARTIFACT_DOC_PLACEHOLDERS = _manifest_id_placeholders(ARTIFACT_MANIFEST)
DEFAULT_WORKSTREAM_INTENT, ARTIFACT_POLICY = load_artifact_policy(WORKFLOW_CFG, ARTIFACT_MANIFEST)
VALID_WORKSTREAM_INTENTS = set(ARTIFACT_POLICY.keys())
VALID_ARTIFACT_DOC_TYPES = {entry["doc_type"] for entry in ARTIFACT_MANIFEST}
THEME_INTENT_HINTS = {
    "research": ("research", "investigate", "investigation", "analysis", "analyze", "discovery", "spike"),
    "brainstorming": ("brainstorm", "options", "direction"),
    "exploration": ("explore", "exploration", "inventory", "audit", "survey", "repo-map", "codemap"),
    "closure": ("closure", "wrap-up", "postmortem", "retro", "retrospective"),
}
DOC_TYPE_ALIASES = {
    "spec-lite": "spec-lite",
    "spec_lite": "spec-lite",
    "spec-child": "spec-child",
    "spec_child": "spec-child",
    "spec-test": "spec-test",
    "spec_test": "spec-test",
}


def _normalize_doc_type_alias(doc_type: str) -> str:
    """Normalize historical and underscore aliases to canonical doc types."""
    cleaned = str(doc_type).strip().lower()
    if not cleaned:
        return ""
    return DOC_TYPE_ALIASES.get(cleaned, cleaned)


def get_timestamp() -> str:
    """Get current timestamp in configured workbench timezone."""
    return now_iso_with_offset(WB_OFFSET)


def canonical_wb_label() -> str:
    try:
        return str(CANONICAL_WB_DIR.relative_to(ROOT_DIR))
    except ValueError:
        return str(CANONICAL_WB_DIR)


def require_canonical_session_path(session_path: Path, *, source: str) -> Path:
    resolved = session_path.resolve()
    try:
        resolved.relative_to(CANONICAL_WB_DIR.resolve())
    except ValueError:
        raise ValueError(f"{source} must target a session under {canonical_wb_label()}")
    return resolved


def get_session_id(theme: str) -> str:
    """Generate session folder ID."""
    date_part = now_compact_for_session(WB_OFFSET)
    theme_clean = sanitize_theme(theme)
    return f"{date_part}_{theme_clean}"


def sanitize_theme(theme: str) -> str:
    """Normalize/validate theme to a safe, bounded slug."""
    cleaned = theme.strip().lower().replace(" ", "-").replace("_", "-")
    cleaned = "".join(c for c in cleaned if c.isalnum() or c == "-")
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    if not cleaned:
        raise ValueError("Theme is empty after sanitization. Use letters/numbers.")
    if len(cleaned) > 80:
        cleaned = cleaned[:80].rstrip("-")
    return cleaned


def get_config_placeholder(name: str) -> str | None:
    """Resolve placeholders like {max_plan_lines_threshold} from config defaults."""
    if name == "max_plan_lines_threshold":
        return str(MAX_PLAN_LINES_THRESHOLD)

    current = CONFIG
    for part in name.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return str(current)


def load_template(template_name: str) -> str:
    """Load template content."""
    template_path = TEMPLATES_DIR / template_name

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    return template_path.read_text()


def fill_template(
    template: str,
    session_id: str,
    theme: str,
    timestamp: str,
    replacements: Optional[Dict[str, str]] = None,
) -> str:
    """Fill template with session data."""
    # Replace common placeholders
    content = template
    content = content.replace("YYMMDD_HHMM_<theme>", session_id)
    content = content.replace("<theme>", theme)
    content = content.replace("<topic>", theme)
    content = content.replace("YYYY-MM-DDTHH:MM:SSZ", timestamp)
    for placeholder, value in (replacements or {}).items():
        content = content.replace(placeholder, value)

    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = get_config_placeholder(key)
        return value if value is not None else match.group(0)

    content = PLACEHOLDER_PATTERN.sub(_replace, content)

    return content


def create_session_folder(session_id: str) -> Path:
    """Create session folder."""
    session_path = WB_DIR / session_id
    require_canonical_session_path(session_path, source="New sessions")

    if session_path.exists():
        raise FileExistsError(f"Session folder already exists: {session_path}")

    session_path.mkdir(parents=True)
    return session_path


def next_available_session_id(session_id: str) -> str:
    """Return a session id that does not collide with an existing workbench folder."""
    candidate = session_id
    counter = 2
    while (WB_DIR / candidate).exists():
        candidate = f"{session_id}_{counter:02d}"
        counter += 1
    return candidate


def _artifact_doc_id(doc_prefix: str, doc_type: str) -> str:
    """Return canonical workstream document id for a doc type."""
    return f"{doc_prefix}_{doc_type}_01"


def _artifact_filename(doc_prefix: str, doc_type: str) -> str:
    """Return canonical filename for a generated workstream artifact."""
    return f"{_artifact_doc_id(doc_prefix, doc_type)}.md"


def resolve_existing_session(session_id: str) -> Path:
    """Resolve an existing session directory by id or path."""
    candidate = Path(session_id)
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / session_id).resolve() if "/" in session_id else (WB_DIR / session_id).resolve()
    if not candidate.exists() or not candidate.is_dir():
        raise FileNotFoundError(f"Session folder not found: {session_id}")
    require_canonical_session_path(candidate, source="--into-session")
    return candidate


def get_active_session() -> str | None:
    """Return active session id if configured and existing."""
    if not ACTIVE_SESSION_FILE.exists():
        return None
    session_id = ACTIVE_SESSION_FILE.read_text().strip()
    if not session_id:
        return None
    candidate = WB_DIR / session_id
    if not candidate.exists():
        return None
    require_canonical_session_path(candidate, source=".active_session")
    return session_id


def set_active_session(session_id: str):
    """Set active session id."""
    ACTIVE_SESSION_FILE.write_text(session_id + "\n")


def create_file(session_path: Path, filename: str, content: str):
    """Create file in session folder."""
    file_path = session_path / filename

    if file_path.exists():
        print(f"  ⚠️  Skipping existing file: {filename}")
        return

    file_path.write_text(content)
    print(f"  ✓ Created: {filename}")


def _read_frontmatter(path: Path) -> Dict[str, object]:
    """Read YAML frontmatter from a markdown file when present."""
    try:
        content = path.read_text()
    except FileNotFoundError:
        return {}
    parsed = split_markdown_frontmatter(content)
    if parsed is None:
        return {}
    loaded, _ = parsed
    return loaded


def _doc_id_from_path(path: Path) -> str:
    """Return frontmatter id when available, fallback to stem."""
    doc_id = _read_frontmatter(path).get("id")
    if isinstance(doc_id, str) and doc_id.strip():
        return doc_id.strip()
    return path.stem


def _infer_theme_from_session(session_path: Path) -> str:
    parts = session_path.name.split("_", 2)
    if len(parts) == 3 and parts[2].strip():
        return parts[2].strip()
    return session_path.name


def _session_seed_args(session_path: Path) -> Dict[str, object]:
    """Rebuild minimal template args from an existing session."""
    for doc_type in (
        "task",
        "plan",
        "research",
        "brainstorm",
        "explorer-check",
        "spec",
        "spec-child",
        "spec-lite",
        "spec-test",
        "report",
        "log",
    ):
        doc_path = find_primary_doc(session_path, doc_type)
        if not doc_path:
            continue
        fm = _read_frontmatter(doc_path)
        return {
            "theme": str(fm.get("theme") or _infer_theme_from_session(session_path)),
            "feature_id": str(fm.get("roadmap_feature") or ""),
            "parent_spec": str(fm.get("parent_spec") or ""),
            "child_spec": str(fm.get("child_spec") or ""),
            "intent": str(fm.get("workstream_intent") or DEFAULT_WORKSTREAM_INTENT),
            "pack": "",
        }
    return {
        "theme": _infer_theme_from_session(session_path),
        "feature_id": "",
        "parent_spec": "",
        "child_spec": "",
        "intent": DEFAULT_WORKSTREAM_INTENT,
        "pack": "",
    }


def _materialize_session_artifact(session_path: Path, doc_type: str, timestamp: str) -> Path:
    """Create a missing root-level session artifact only when it is first needed."""
    existing = find_primary_doc(session_path, doc_type)
    if existing:
        return existing

    entry = next((item for item in ARTIFACT_MANIFEST if item["doc_type"] == doc_type), None)
    if entry is None:
        raise FileNotFoundError(f"Unknown artifact type: {doc_type}")

    seed_args = _session_seed_args(session_path)
    doc_prefix = session_path.name
    replacements = _build_template_replacements(session_path.name, seed_args)
    replacements["<artifact_purpose>"] = entry.get("purpose", "")
    replacements.update(entry.get("replacements", {}))
    content = fill_template(
        load_template(entry["template"]),
        doc_prefix,
        str(seed_args["theme"]),
        timestamp,
        replacements,
    )
    file_path = session_path / _artifact_filename(doc_prefix, doc_type)
    file_path.write_text(content)
    return file_path


def _resolve_spec_reference(reference: str) -> Optional[Path]:
    """Resolve a spec by frontmatter id or by file path."""
    if not reference:
        return None

    if "/" in reference or reference.endswith(".md"):
        candidate = Path(reference)
        if not candidate.is_absolute():
            candidate = (ROOT_DIR / candidate).resolve()
        if candidate.exists() and candidate.is_file():
            return candidate
        return None

    for spec_file in sorted(SPECS_DIR.rglob("*.md")):
        if spec_file.name in {"INDEX.md", "README.md"}:
            continue
        if _doc_id_from_path(spec_file) == reference:
            return spec_file
    return None


def _roadmap_has_feature(feature_id: str) -> bool:
    """Return True when the roadmap contains a heading for the feature id."""
    if not ROADMAP_FILE.exists():
        return False
    pattern = re.compile(rf"^###\s+{re.escape(feature_id)}\b", re.MULTILINE)
    return bool(pattern.search(ROADMAP_FILE.read_text()))


def _get_cli_flag_value(flag: str) -> str:
    """Read value for --flag value or --flag=value forms."""
    prefix = f"{flag}="
    for idx, arg in enumerate(sys.argv):
        if arg == flag and idx + 1 < len(sys.argv):
            return sys.argv[idx + 1].strip()
        if arg.startswith(prefix):
            return arg[len(prefix):].strip()
    return ""


def _get_cli_flag_values(flag: str) -> list[str]:
    """Read repeated --flag value and --flag=value forms."""
    values: list[str] = []
    prefix = f"{flag}="
    idx = 0
    while idx < len(sys.argv):
        arg = sys.argv[idx]
        if arg == flag and idx + 1 < len(sys.argv):
            candidate = sys.argv[idx + 1].strip()
            if candidate:
                values.append(candidate)
            idx += 2
            continue
        if arg.startswith(prefix):
            candidate = arg[len(prefix):].strip()
            if candidate:
                values.append(candidate)
        idx += 1
    return values


def _infer_intent(theme: str, raw_args: Dict[str, object]) -> str:
    """Infer a safer minimal intent when the caller did not specify one explicitly."""
    if raw_args.get("plan_only"):
        return "planning"

    lowered_theme = str(theme).lower()
    for intent, hints in THEME_INTENT_HINTS.items():
        if any(hint in lowered_theme for hint in hints):
            return intent

    return DEFAULT_WORKSTREAM_INTENT


def _normalize_spec_reference(reference: str, role: str) -> str:
    """Validate and normalize a spec reference to its frontmatter id."""
    spec_path = _resolve_spec_reference(reference)
    if spec_path is None:
        print(f"❌ {role} spec not found: {reference}")
        print(f"Expected a file under {SPECS_DIR.relative_to(ROOT_DIR)} or a matching frontmatter id.")
        sys.exit(1)

    try:
        spec_path.resolve().relative_to(SPECS_DIR.resolve())
    except ValueError:
        print(f"❌ {role} spec must live under {SPECS_DIR.relative_to(ROOT_DIR)}: {spec_path}")
        sys.exit(1)

    return _doc_id_from_path(spec_path)


def _validate_governance_requirements(args: Dict[str, object]) -> None:
    """Enforce roadmap/spec linkage for standard workstreams."""
    if args.get("quick_mode") and QUICK_MODE_BYPASSES_GOVERNANCE:
        return
    if not GOVERNANCE_REQUIRED:
        return

    missing_flags = []
    if not args.get("feature_id"):
        missing_flags.append("--feature-id")
    if not args.get("parent_spec"):
        missing_flags.append("--parent-spec")

    if missing_flags:
        print("❌ Roadmap-first governance is mandatory for standard workstreams.")
        print(f"Missing required flags: {', '.join(missing_flags)}")
        print("Example:")
        print("  .agents/agents new <theme> --feature-id F-01 --parent-spec <parent-spec-id>")
        sys.exit(1)

    feature_id = str(args["feature_id"]).strip()
    if not FEATURE_ID_PATTERN.match(feature_id):
        print(f"❌ Invalid feature id: {feature_id}")
        print(f"Expected pattern: {FEATURE_ID_PATTERN.pattern}")
        sys.exit(1)

    if not ROADMAP_FILE.exists():
        print(f"❌ Roadmap file not found: {ROADMAP_FILE}")
        sys.exit(1)
    if not _roadmap_has_feature(feature_id):
        print(f"❌ Roadmap feature not found in {ROADMAP_FILE.relative_to(ROOT_DIR)}: {feature_id}")
        print("Add the feature to the roadmap before creating a new standard workstream.")
        sys.exit(1)

    args["feature_id"] = feature_id
    args["parent_spec"] = _normalize_spec_reference(str(args["parent_spec"]), "Parent")

    child_spec = str(args.get("child_spec") or "").strip()
    if child_spec:
        if args.get("use_spec_child") or args.get("use_spec_lite"):
            print("❌ Do not combine --child-spec with --spec-child/--spec-lite.")
            print("Use --child-spec <spec-id> to link an existing child spec.")
            print("Use --spec-child only when this session must create a new local child-spec artifact.")
            sys.exit(1)
        normalized_child = _normalize_spec_reference(child_spec, "Child")
        if normalized_child == args["parent_spec"]:
            print("❌ --child-spec must differ from --parent-spec")
            sys.exit(1)
        args["child_spec"] = normalized_child
    else:
        args["child_spec"] = ""


def _validate_nonquick_delivery_task_text(args: Dict[str, object]) -> None:
    """Require an executable delivery task for non-quick delivery workstreams."""
    if args.get("quick_mode"):
        return

    if str(args.get("intent") or "").strip() != "delivery":
        return

    task_text = str(args.get("task") or "").strip()
    if not task_text:
        print("❌ Delivery workstreams require --task text.")
        print("Example:")
        print("  ./.agents/agents new <theme> --intent delivery --task \"Implement X and verify Y\"")
        sys.exit(1)

    try:
        validate_task_text(task_text, source="Delivery task")
    except ValueError as exc:
        print(f"❌ {exc}")
        sys.exit(1)


def _get_repo_name() -> str:
    """Return repository folder name."""
    return ROOT_DIR.name


def _get_branch_or_worktree() -> str:
    """Return current git branch when available."""
    try:
        result = subprocess.run(
            ["git", "-C", str(ROOT_DIR), "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        branch = result.stdout.strip()
        return branch or "main"
    except Exception:
        return "main"


def _build_template_replacements(session_id: str, args: Dict[str, object]) -> Dict[str, str]:
    """Build placeholder replacements for workstream templates."""
    doc_prefix = _doc_prefix(session_id, args)
    task_seed = str(args.get("task") or "").strip()
    fallback_task = "Complete the selected workstream artifact and record verification evidence"
    task_note = task_seed if task_seed else fallback_task
    task_description = task_seed if task_seed else fallback_task
    replacements = {
        "<repo_name>": _get_repo_name(),
        "<branch_or_worktree>": _get_branch_or_worktree(),
        "<feature_id>": str(args.get("feature_id") or ""),
        "<parent_spec_id>": str(args.get("parent_spec") or ""),
        "<parent_spec_id_or_empty>": str(args.get("parent_spec") or ""),
        "<child_spec_id_or_empty>": str(args.get("child_spec") or ""),
        "<note>": task_note,
        "<task description>": task_description,
        "<roadmap_path>": f"docs/arc/{ROADMAP_FILE.name}",
        "<spec_role>": "workstream",
        "<workstream_intent>": str(args.get("intent") or DEFAULT_WORKSTREAM_INTENT),
    }
    for doc_type, placeholder in WORKFLOW_ARTIFACT_DOC_PLACEHOLDERS.items():
        replacements[placeholder] = _artifact_doc_id(doc_prefix, doc_type)
    return replacements


def _doc_prefix(session_id: str, args: Dict[str, object]) -> str:
    pack = str(args.get("pack") or "").strip()
    return f"{session_id}-{pack}" if pack else session_id


def _doc_dir(session_path: Path, args: Dict[str, object]) -> Path:
    pack = str(args.get("pack") or "").strip()
    if not pack:
        return session_path
    target = session_path / PACK_DIR_NAME / pack
    target.mkdir(parents=True, exist_ok=True)
    return target


def _intent_profile(intent: str) -> ArtifactIntentProfile:
    return ARTIFACT_POLICY.get(intent, ARTIFACT_POLICY[DEFAULT_WORKSTREAM_INTENT])


def _allowed_doc_types(intent: str) -> set[str]:
    profile = _intent_profile(intent)
    allowed = set(profile.get("allow", []))
    allowed.update(profile.get("create", []))
    return allowed or set(VALID_ARTIFACT_DOC_TYPES)


def _ordered_selected_doc_types(args: Dict[str, object]) -> list[str]:
    """Resolve the concrete artifact set that should be materialized."""
    intent = str(args.get("intent") or DEFAULT_WORKSTREAM_INTENT)
    selected = list(_intent_profile(intent).get("create", []))
    if args.get("plan_only"):
        selected = ["plan"]
    selected.extend(_normalize_doc_type_alias(str(doc_type)) for doc_type in args.get("with_artifacts") or [])

    selected_set = {doc_type for doc_type in selected if doc_type in VALID_ARTIFACT_DOC_TYPES}
    if args.get("use_spec"):
        selected_set.discard("spec-child")
        selected_set.discard("spec-lite")
        selected_set.add("spec")
    elif args.get("use_spec_child") or args.get("use_spec_lite"):
        selected_set.discard("spec")
        selected_set.discard("spec-lite")
        selected_set.add("spec-child")
    if args.get("use_spec_test"):
        selected_set.add("spec-test")

    if not selected_set:
        raise ValueError(
            "No artifacts selected for creation. Choose a different --intent or add explicit --with <doc-type> flags."
        )

    allowed = _allowed_doc_types(intent)
    if not args.get("plan_only"):
        disallowed = sorted(doc_type for doc_type in selected_set if doc_type not in allowed)
        if disallowed:
            raise ValueError(
                f"Artifacts not allowed for intent '{intent}': {', '.join(disallowed)}. "
                f"Allowed: {', '.join(sorted(allowed))}"
            )

    return [entry["doc_type"] for entry in ARTIFACT_MANIFEST if entry["doc_type"] in selected_set]


def _iter_workstream_artifacts(args: Dict[str, object]) -> list[ArtifactManifestEntry]:
    """Return the ordered artifact manifest selected by intent/policy."""
    selected_doc_types = set(_ordered_selected_doc_types(args))
    return [entry for entry in ARTIFACT_MANIFEST if entry["doc_type"] in selected_doc_types]


def _create_manifest_artifacts(
    target_dir: Path,
    doc_prefix: str,
    theme: str,
    timestamp: str,
    replacements: Dict[str, str],
    args: Dict[str, object],
) -> None:
    """Render and create workstream artifacts from the declarative manifest."""
    for entry in _iter_workstream_artifacts(args):
        template = load_template(entry["template"])
        artifact_replacements = dict(replacements)
        artifact_replacements.update(entry.get("replacements", {}))
        artifact_replacements["<artifact_purpose>"] = entry.get("purpose", "")
        content = fill_template(
            template,
            doc_prefix,
            theme,
            timestamp,
            artifact_replacements,
        )
        if entry["doc_type"] == "task":
            try:
                validate_task_board(content, source=f"{entry['doc_type']} artifact")
            except ValueError as exc:
                print(f"❌ {exc}")
                sys.exit(1)
        create_file(target_dir, _artifact_filename(doc_prefix, entry["doc_type"]), content)


def find_primary_doc(session_path: Path, doc_type: str) -> Path | None:
    """Find the first workstream document by type."""
    normalized = _normalize_doc_type_alias(doc_type)
    patterns = [f"*_{normalized}_*.md"]
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(session_path.rglob(pattern))
    ordered = sorted(set(matches))
    return ordered[0] if ordered else None


def next_task_id(task_content: str) -> str:
    """Generate next T-XX identifier from existing checklist items."""
    ids = [int(m.group(1)) for m in re.finditer(r"T-(\d{2,3})\b", task_content)]
    next_num = (max(ids) + 1) if ids else 1
    width = 3 if next_num >= 100 else 2
    return f"T-{next_num:0{width}d}"


def insert_task_line(content: str, task_line: str) -> str:
    """Insert task line into Task List section when possible."""
    lines = content.splitlines()
    section_idx = next((i for i, line in enumerate(lines) if line.strip() == "## Task List"), -1)
    if section_idx == -1:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend(["## Task List", task_line])
        return "\n".join(lines) + "\n"

    insert_idx = section_idx + 1
    i = section_idx + 1
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("## "):
            break
        if s.startswith("- ["):
            insert_idx = i + 1
        i += 1
    lines.insert(insert_idx, task_line)
    return "\n".join(lines) + "\n"


def insert_log_timeline(content: str, entry: str) -> str:
    """Insert entry into Timeline section, fallback append."""
    lines = content.splitlines()
    section_idx = next((i for i, line in enumerate(lines) if line.strip() == "## Timeline"), -1)
    if section_idx == -1:
        if lines and lines[-1].strip():
            lines.append("")
        lines.extend(["## Timeline", entry])
        return "\n".join(lines) + "\n"

    insert_idx = section_idx + 1
    i = section_idx + 1
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith("## "):
            break
        if s.startswith("- "):
            insert_idx = i + 1
        i += 1
    lines.insert(insert_idx, entry)
    return "\n".join(lines) + "\n"


def add_quick_task_to_active_session(active_session: str, theme: str, timestamp: str) -> tuple[str, Path, Path]:
    """Append a quick task and timeline entry to the active session docs."""
    session_path = WB_DIR / active_session
    require_canonical_session_path(session_path, source="Quick mode")
    task_file = find_primary_doc(session_path, "task")
    if not task_file:
        raise FileNotFoundError("Active session is missing task file. Expected *_task_*.md.")
    log_file = _materialize_session_artifact(session_path, "log", timestamp)

    task_content = task_file.read_text()
    task_id = next_task_id(task_content)
    task_line = f"- [ ] {task_id} {theme}"
    task_file.write_text(insert_task_line(task_content, task_line))

    log_content = log_file.read_text()
    timeline_entry = f"- {timestamp} - Added quick task {task_id}: {theme} - pending"
    log_file.write_text(insert_log_timeline(log_content, timeline_entry))

    return task_id, task_file, log_file


def _parse_args():
    """Parse command line arguments."""
    if any(arg in {"-h", "--help", "help"} for arg in sys.argv[1:]):
        _print_usage()
        sys.exit(0)
    if len(sys.argv) < 2:
        return None
    raw_theme = sys.argv[1]
    try:
        theme = sanitize_theme(raw_theme)
    except ValueError:
        return None

    raw_args = {
        "theme": theme,
        "use_spec": "--spec" in sys.argv,
        "use_spec_child": "--spec-child" in sys.argv,
        "use_spec_lite": "--spec-lite" in sys.argv,
        "use_spec_test": "--spec-test" in sys.argv,
        "plan_only": "--plan-only" in sys.argv,
        "force_new": "--force-new" in sys.argv,
        "quick_mode": "--quick" in sys.argv,
        "intent": _get_cli_flag_value("--intent"),
        "feature_id": _get_cli_flag_value("--feature-id"),
        "parent_spec": _get_cli_flag_value("--parent-spec"),
        "child_spec": _get_cli_flag_value("--child-spec"),
        "task": _get_cli_flag_value("--task"),
        "pack": sanitize_theme(_get_cli_flag_value("--pack")) if _get_cli_flag_value("--pack") else "",
        "into_session": _get_cli_flag_value("--into-session"),
        "with_artifacts": [
            _normalize_doc_type_alias(value)
            for value in _get_cli_flag_values("--with")
            if _normalize_doc_type_alias(value)
        ],
    }
    raw_args["intent"] = str(raw_args["intent"] or _infer_intent(theme, raw_args))
    return raw_args


def _print_usage():
    """Print usage information."""
    print(
        "Usage: ./.agents/agents new <theme> "
        "[--feature-id F-01 --parent-spec <spec-id> [--child-spec <spec-id>]] "
        "[--intent delivery|planning|research|brainstorming|exploration|specification|closure] "
        "[--task \"<task text>\"] "
        "[--with <doc-type>] [--spec | --spec-child | --spec-lite] [--spec-test] [--pack <pack-slug>] "
        "[--into-session <session-id>] [--plan-only] [--force-new | --quick]"
    )
    print()
    print("Governed delivery lifecycle:")
    print("  1. new: create/target the .agents/wb session before product edits")
    print("  2. implement start: move the execution task to in_progress")
    print("  3. edit and verify the product change")
    print("  4. implement complete: record verification evidence and mark done")
    print()
    print("Examples:")
    print("  ./.agents/agents new auth-refactor --feature-id F-01 --parent-spec my-parent-spec")
    print("  ./.agents/agents new api-endpoint --feature-id F-02 --parent-spec my-parent-spec --spec")
    print("  ./.agents/agents new bugfix-login --feature-id F-03 --parent-spec my-parent-spec --child-spec existing-child-spec")
    print("  ./.agents/agents new new-child-spec --feature-id F-03 --parent-spec my-parent-spec --spec-child")
    print("  ./.agents/agents new hardening-tests --feature-id F-03 --parent-spec my-parent-spec --spec-test")
    print("  ./.agents/agents new investigate-auth --feature-id F-03 --parent-spec my-parent-spec --intent research")
    print("  ./.agents/agents new api-follow-up --feature-id F-07 --parent-spec parent --pack api-cleanup --into-session 260306_2002_execution-intelligence-system --spec")
    print("  ./.agents/agents new tiny-fix --quick")
    print("  ./.agents/agents new delivery-task --feature-id F-02 --parent-spec parent-spec --intent delivery --task \"Fix input validation bug\"")
    print("  ./.agents/agents new new-epic --feature-id F-04 --parent-spec parent --child-spec child --force-new")
    print()
    print("Spec linking vs artifact creation:")
    print("  --child-spec <spec-id> links an existing child spec and creates no spec artifact.")
    print("  --spec-child / --spec-lite creates a new local child-spec artifact.")
    print("  Do not combine --child-spec with --spec-child or --spec-lite.")


def _handle_quick_mode(args: Dict, active_session: str) -> bool:
    """Handle quick mode execution. Returns True if handled."""
    if not args["quick_mode"]:
        return False

    quick_task_text = str(args.get("task") or args["theme"]).strip()
    if _validate_task_text_impl is not None:
        try:
            validate_task_text(quick_task_text, source="Quick task")
        except ValueError as exc:
            print(f"❌ {exc}")
            sys.exit(1)

    if not active_session:
        print("❌ No active session found for quick mode.")
        print("Create one significant workstream first with:")
        print("  .agents/agents new <theme> --feature-id F-01 --parent-spec <spec-id> [--spec|--spec-child|--spec-lite]")
        sys.exit(1)

    print("=" * 60)
    print(f"Quick task mode: {quick_task_text}")
    print("=" * 60)
    print()
    print(f"Active session: {active_session}")
    print(f"Session path: .agents/wb/{active_session}/")
    print()

    try:
        task_id, task_file, log_file = add_quick_task_to_active_session(
            active_session=active_session,
            theme=quick_task_text,
            timestamp=get_timestamp(),
        )
    except FileNotFoundError as exc:
        print(f"❌ {exc}")
        sys.exit(1)

    print("No new workstream created (quick mode).")
    print(f"✓ Added task: {task_id} in {task_file.relative_to(ROOT_DIR)}")
    print(f"✓ Added timeline entry in {log_file.relative_to(ROOT_DIR)}")
    print("=" * 60)
    return True


def _check_active_session_policy(active_session: Optional[str], theme: str, force_new: bool) -> None:
    """Check active session policy and inform user (non-blocking)."""
    if active_session and not force_new:
        print(f"⚠️  Note: Another session is currently active: {active_session}")
        print()
        print("Creating new session. To target a specific session in future commands:")
        print(f"  .agents/agents wb-update <command> --session {active_session}")
        print()
        print("Tip: Use --quick for small tasks in the current session:")
        print(f"  .agents/agents new {theme} --quick")
        print()


def _create_workstream(session_id: str, theme: str, timestamp: str, args: Dict) -> None:
    """Create new workstream with all files."""
    created_doc_types = _ordered_selected_doc_types(args)
    if args.get("into_session"):
        try:
            session_path = resolve_existing_session(str(args["into_session"]))
        except (FileNotFoundError, ValueError) as exc:
            print(f"❌ {exc}")
            sys.exit(1)
        session_id = session_path.name
    else:
        session_path = create_session_folder(session_id)
    target_dir = _doc_dir(session_path, args)
    doc_prefix = _doc_prefix(session_id, args)
    replacements = _build_template_replacements(session_id, args)
    if args.get("into_session"):
        print(f"✓ Reusing session folder: {session_path.name}")
    else:
        print(f"✓ Created session folder: {session_path.name}")
    print()

    if not args.get("into_session"):
        set_active_session(session_id)
        print(f"✓ Set active session: {session_id}")
        print()
    if target_dir != session_path:
        print(f"✓ Created pack directory: {target_dir.relative_to(ROOT_DIR)}")
    print()

    print("Creating files:")
    try:
        _create_manifest_artifacts(target_dir, doc_prefix, theme, timestamp, replacements, args)
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

    print()
    print("=" * 60)
    print("Next steps:")
    print(f"0. Confirm roadmap feature `{args['feature_id']}` and parent spec `{args['parent_spec']}` stay current")
    if str(args.get("intent") or "") == "delivery":
        print(f"1. Start execution: ./.agents/agents implement start --session {session_id} --task-id T-01")
        print("2. Make the scoped product change and run the named verification command")
        print(
            "3. Complete with evidence: ./.agents/agents implement complete "
            f"--session {session_id} --task-id T-01 --command \"<verification command>\" "
            "--result passed --artifact <path-or-report>"
        )
        print("4. Edit plan/task only when their scaffolded content is materially wrong")
    else:
        for idx, doc_type in enumerate(created_doc_types, start=1):
            print(f"{idx}. Edit: {target_dir.relative_to(ROOT_DIR)}/{_artifact_filename(doc_prefix, doc_type)}")
    print()
    print("Session folder:")
    print(f"  .agents/wb/{session_id}/")
    if target_dir != session_path:
        print("Pack folder:")
        print(f"  {target_dir.relative_to(ROOT_DIR)}/")
    print("=" * 60)

    # Auto-record session_start telemetry
    record_session_start(
        session_id,
        theme,
        any(doc_type in {"spec", "spec-child", "spec-test"} for doc_type in created_doc_types),
        args=args,
    )
    # Auto-suggest patterns
    suggest_patterns_for_theme(theme)


def main():
    """Main entry point."""
    args = _parse_args()
    if args is None:
        _print_usage()
        sys.exit(1)

    try:
        active_session = get_active_session()
    except ValueError as exc:
        print(f"❌ {exc}")
        sys.exit(1)

    # Quick mode: do not create new workstream, enforce single active stream.
    if _handle_quick_mode(args, active_session):
        return

    _validate_governance_requirements(args)
    _validate_nonquick_delivery_task_text(args)

    if args["intent"] not in VALID_WORKSTREAM_INTENTS:
        print(f"❌ Invalid --intent: {args['intent']}")
        print(f"Allowed intents: {', '.join(sorted(VALID_WORKSTREAM_INTENTS))}")
        sys.exit(1)

    invalid_doc_types = sorted(doc_type for doc_type in args["with_artifacts"] if doc_type not in VALID_ARTIFACT_DOC_TYPES)
    if invalid_doc_types:
        print(f"❌ Invalid --with doc_type(s): {', '.join(invalid_doc_types)}")
        print(f"Allowed doc types: {', '.join(sorted(VALID_ARTIFACT_DOC_TYPES))}")
        sys.exit(1)
    try:
        _ordered_selected_doc_types(args)
    except ValueError as exc:
        print(f"❌ {exc}")
        sys.exit(1)

    # Check active session policy
    if not args.get("into_session"):
        _check_active_session_policy(active_session, args["theme"], args["force_new"])

    # Generate session data
    if args.get("into_session"):
        session_id = str(args["into_session"]).strip()
    else:
        session_id = next_available_session_id(get_session_id(args["theme"]))
    timestamp = get_timestamp()

    print("=" * 60)
    print(f"Creating new workstream: {args['theme']}")
    print("=" * 60)
    print()
    print(f"Session ID: {session_id}")
    print(f"Timestamp: {timestamp}")
    print(f"Roadmap feature: {args['feature_id']}")
    print(f"Parent spec: {args['parent_spec']}")
    print(f"Intent: {args['intent']}")
    if args.get("child_spec"):
        print(f"Child spec: {args['child_spec']}")
    if args.get("pack"):
        print(f"Pack: {args['pack']}")
    if args.get("into_session"):
        print(f"Into existing session: {args['into_session']}")
    if args.get("with_artifacts"):
        print(f"Explicit artifacts: {', '.join(args['with_artifacts'])}")
    if active_session and args["force_new"]:
        print(f"Previous active session: {active_session}")
    print()

    _create_workstream(session_id, args["theme"], timestamp, args)


def record_session_start(session_id: str, theme: str, has_spec: bool, args: Optional[Dict] = None):
    """Record session_start event in telemetry."""
    if not TELEMETRY_SCRIPT.exists():
        return

    metadata = {
        "theme": theme,
        "workstream_type": "spec" if has_spec else "feature",
    }
    if args:
        metadata["intent"] = args.get("intent", DEFAULT_WORKSTREAM_INTENT)
        metadata["artifacts"] = _ordered_selected_doc_types(args)
        metadata["feature_id"] = args.get("feature_id", "")
        metadata["parent_spec"] = args.get("parent_spec", "")
        if args.get("child_spec"):
            metadata["child_spec"] = args["child_spec"]
        if args.get("pack"):
            metadata["pack"] = args["pack"]

    try:
        subprocess.run(
            [sys.executable, str(TELEMETRY_SCRIPT), "record", "session_start",
             "--session-id", session_id,
             "--metadata", json.dumps(metadata)],
            capture_output=True,
            timeout=5
        )
    except Exception:
        pass  # Silent fail - telemetry is non-blocking


def suggest_patterns_for_theme(theme: str):
    """Suggest relevant patterns for the theme."""
    if not PATTERNS_SCRIPT.exists():
        return

    try:
        result = subprocess.run(
            [sys.executable, str(PATTERNS_SCRIPT), "suggest", "--theme", theme, "--limit", "3"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.stdout.strip():
            print()
            print("📋 Suggested patterns for this workstream:")
            print(result.stdout)
    except Exception:
        pass  # Silent fail - patterns are non-blocking


if __name__ == "__main__":
    main()
