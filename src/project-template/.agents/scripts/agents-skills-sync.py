#!/usr/bin/env python3
"""Sync project skills from a universal skills pool with runtime-aware profiles."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from lib.agents_config import load_agents_config, resolve_repo_path
from lib.process_utils import run_command


ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)

DEFAULTS = {
    "enabled": False,
    "upstream_repo_url": "",
    "upstream_branch": "main",
    "source_dir": ".agents/source/universal-skills",
    "external_source_dir": "",
    "proposal_branch_prefix": "skills-sync",
    "project_dir": "skills",
    "mode": "copy",
    "required": False,
    "manifest_file": ".agents/skills-sync.manifest.json",
    "upstream_skills_dir": "skills",
    "default_profile": "core",
    "runtime_targets": [
        "all",
        "opencode",
        "codex",
        "claude-code",
        "gemini",
        "qwen",
        "antigravity",
    ],
    "default_skills": ["agentic-folder-sys", "agentic-scaffold-mcp"],
}

MANIFEST_VERSION = 2
SPECIAL_APP_ALL = "all"

FORBIDDEN_SKILLS_DIRS = {"_pool", ".pool", "_cache", ".cache"}

RUNTIME_ALIASES = {
    "antigravity": "antigravity",
    "claude": "claude-code",
    "claude_code": "claude-code",
    "claude-code": "claude-code",
    "codex": "codex",
    "gemini": "gemini",
    "opencode": "opencode",
    "qwen": "qwen",
    "qwen_code": "qwen",
}


def skills_sync_config() -> Dict[str, Any]:
    return CONFIG.get("skills_sync", {}) if isinstance(CONFIG, dict) else {}


def cfg(key: str):
    fallback = DEFAULTS[key]
    return skills_sync_config().get(key, fallback)


def cfg_path(key: str) -> Path:
    return resolve_repo_path(ROOT_DIR, str(cfg(key)))


def run(cmd: List[str], cwd: Path | None = None):
    result = run_command(cmd, cwd=cwd or ROOT_DIR, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}")


def parse_csv(value: str | None) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_runtime(value: str | None) -> str:
    if not value or not value.strip():
        return SPECIAL_APP_ALL
    return RUNTIME_ALIASES.get(value.strip().lower(), value.strip().lower())


def is_supported_runtime(runtime: str) -> bool:
    if runtime == SPECIAL_APP_ALL:
        return True
    return normalize_runtime(runtime) in [normalize_runtime(item) for item in cfg("runtime_targets")]


def dedupe(items: Iterable[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _normalize_safe_component(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise RuntimeError(f"Invalid {label}: expected a non-empty string")

    text = value.strip()
    if not text:
        raise RuntimeError(f"Invalid {label}: expected a non-empty string")
    if "\0" in text:
        raise RuntimeError(f"Invalid {label} '{text}': NUL bytes are not allowed")
    if Path(text).is_absolute():
        raise RuntimeError(f"Invalid {label} '{text}': absolute paths are not allowed")
    if "/" in text or "\\" in text or text in {".", ".."}:
        raise RuntimeError(f"Invalid {label} '{text}': path separators are not allowed")
    return text


def normalize_skill_name(value: Any) -> str:
    return _normalize_safe_component(value, "skill name")


def normalize_profile_name(value: Any) -> str:
    return _normalize_safe_component(value, "profile name")


def _path_within(base: Path, candidate: Path) -> bool:
    try:
        candidate.resolve(strict=False).relative_to(base.resolve(strict=False))
    except ValueError:
        return False
    return True


def _assert_path_within(base: Path, candidate: Path, label: str):
    if not _path_within(base, candidate):
        raise RuntimeError(
            f"{label} must stay within {base.resolve(strict=False)}: {candidate.resolve(strict=False)}"
        )


def _normalize_string_list(value: Any, fallback: List[str] | None = None) -> List[str]:
    if value is None:
        return list(fallback or [])
    if isinstance(value, str):
        return parse_csv(value)
    if not isinstance(value, Iterable):
        return [str(value)]

    result: List[str] = []
    for item in value:
        text = item.strip() if isinstance(item, str) else str(item).strip()
        if text:
            result.append(text)
    return result


def _normalize_skill_list(value: Any, fallback: List[str] | None = None) -> List[str]:
    return dedupe([normalize_skill_name(item) for item in _normalize_string_list(value, fallback)])


def _normalize_profile_list(value: Any, fallback: List[str] | None = None) -> List[str]:
    return dedupe([normalize_profile_name(item) for item in _normalize_string_list(value, fallback)])


def _normalize_install(entry: Any) -> Dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None

    app = normalize_runtime(str(entry.get("app", SPECIAL_APP_ALL)))
    skills = _normalize_skill_list(entry.get("skills"), [])
    profile = entry.get("profile")
    profile_name = normalize_profile_name(profile) if isinstance(profile, str) and profile.strip() else ""
    if not skills and not profile_name:
        return None

    normalized: Dict[str, Any] = {"app": app}
    if skills:
        normalized["skills"] = skills
    if profile_name:
        normalized["profile"] = profile_name
    return normalized


def _default_manifest() -> Dict[str, Any]:
    default_skills = _normalize_skill_list(cfg("default_skills"))
    default_profile = normalize_profile_name(str(cfg("default_profile"))) if str(cfg("default_profile")).strip() else ""

    installs = []
    if default_profile:
        installs.append({"app": SPECIAL_APP_ALL, "profile": default_profile})
    if default_skills:
        installs.append({"app": SPECIAL_APP_ALL, "skills": default_skills})

    return {
        "version": MANIFEST_VERSION,
        "repo": str(cfg("upstream_repo_url")).strip(),
        "ref": str(cfg("upstream_branch")).strip(),
        "source_dir": str(cfg("source_dir")).strip(),
        "mode": str(cfg("mode")).strip() or "copy",
        "installs": installs,
    }


def _profile_skills_from_source(profile: str, manifest: Dict[str, Any]) -> List[str]:
    profile = normalize_profile_name(profile)
    profiles = manifest.get("profiles")
    if isinstance(profiles, dict):
        profile_data = profiles.get(profile)
        if profile_data is not None:
            return _normalize_skill_list(profile_data)

    profile_path = upstream_profiles_root() / f"{profile}.json"
    if not profile_path.exists():
        return []

    try:
        raw_profile = json.loads(profile_path.read_text())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Malformed profile file {profile_path}: {exc}") from exc

    if not isinstance(raw_profile, dict):
        return []

    return _normalize_skill_list(raw_profile.get("skills"))


def _resolve_install_skills(
    install: Dict[str, Any],
    manifest: Dict[str, Any],
    profile_override: str | None,
    app_hint: str,
) -> List[str]:
    profile = install.get("profile")
    skills = install.get("skills")
    if profile_override:
        profile = profile_override

    if isinstance(skills, list) and skills:
        return _normalize_skill_list(skills)

    if isinstance(profile, str):
        profile_name = normalize_profile_name(profile)
        resolved = _profile_skills_from_source(profile_name, manifest)
        if resolved:
            return resolved
        raise RuntimeError(f"Profile '{profile_name}' not found for app '{app_hint}'")

    return []


def _legacy_install_entries(raw_installs: Any) -> List[Any]:
    if isinstance(raw_installs, str):
        return parse_csv(raw_installs)
    if isinstance(raw_installs, list):
        return raw_installs
    return []


def _normalize_legacy_installs(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    legacy_skills = _normalize_skill_list(data.get("selected_skills"))
    legacy_installs: List[Dict[str, Any]] = []

    for entry in _legacy_install_entries(data.get("installs", [])):
        if isinstance(entry, str):
            normalized = _normalize_install({"app": SPECIAL_APP_ALL, "skills": [entry]})
        else:
            normalized = _normalize_install(entry)
        if normalized:
            legacy_installs.append(normalized)

    if legacy_skills:
        legacy_installs.append({"app": SPECIAL_APP_ALL, "skills": legacy_skills})
    return legacy_installs


def _normalized_source_dir(data: Dict[str, Any]) -> str:
    return str(data.get("source_dir", cfg("source_dir"))).strip() or str(cfg("source_dir")).strip()


def _normalized_mode(data: Dict[str, Any]) -> str:
    return str(data.get("mode", cfg("mode"))).strip() or "copy"


def _normalize_legacy_manifest(data: Dict[str, Any]) -> Dict[str, Any]:
    legacy_installs = _normalize_legacy_installs(data)
    if not legacy_installs:
        baseline = _default_manifest()
        baseline["repo"] = str(data.get("repo", baseline["repo"]))
        baseline["ref"] = str(data.get("ref", data.get("upstream_branch", baseline["ref"])))
        return baseline

    return {
        "version": MANIFEST_VERSION,
        "repo": str(data.get("repo", cfg("upstream_repo_url"))),
        "ref": str(data.get("ref", data.get("upstream_branch", cfg("upstream_branch")))),
        "source_dir": _normalized_source_dir(data),
        "mode": _normalized_mode(data),
        "installs": legacy_installs,
    }


def _normalize_v2_installs(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_installs = data.get("installs")
    normalized_installs: List[Dict[str, Any]] = []
    if isinstance(raw_installs, list):
        for entry in raw_installs:
            normalized = _normalize_install(entry)
            if normalized:
                normalized_installs.append(normalized)
    if normalized_installs:
        return normalized_installs
    return _default_manifest()["installs"]


def _normalize_v2_manifest(data: Dict[str, Any]) -> Dict[str, Any]:
    manifest = {
        "version": MANIFEST_VERSION,
        "repo": str(data.get("repo", cfg("upstream_repo_url"))).strip(),
        "ref": str(data.get("ref", cfg("upstream_branch"))).strip(),
        "source_dir": _normalized_source_dir(data),
        "mode": _normalized_mode(data),
        "installs": _normalize_v2_installs(data),
    }
    source_data = data.get("source")
    if isinstance(source_data, dict):
        manifest["source"] = dict(source_data)

    if not manifest["repo"]:
        manifest["repo"] = str(cfg("upstream_repo_url")).strip()
    if not manifest["ref"]:
        manifest["ref"] = str(cfg("upstream_branch")).strip()
    if not manifest["source_dir"]:
        manifest["source_dir"] = str(cfg("source_dir")).strip()

    profiles = data.get("profiles")
    if isinstance(profiles, dict):
        manifest["profiles"] = {
            normalize_profile_name(str(name)): _normalize_skill_list(skills)
            for name, skills in profiles.items()
        }

    return manifest


def _normalize_manifest(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise RuntimeError("Skills manifest must be a JSON object")

    version = data.get("version")
    has_legacy_fields = isinstance(data.get("selected_skills"), list) or version in (None, 1)
    if has_legacy_fields:
        return _normalize_legacy_manifest(data)

    if version not in (MANIFEST_VERSION,):
        raise RuntimeError(f"Unsupported skills manifest version: {version}")
    return _normalize_v2_manifest(data)


def _manifest_source_path(source_repo: Path) -> str:
    resolved = source_repo.resolve()
    try:
        return str(resolved.relative_to(ROOT_DIR.resolve()))
    except ValueError:
        return str(resolved)


def _git_head_ref(repo: Path) -> str | None:
    result = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo, text=True)
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    if not value or value == "HEAD":
        return None
    return value


def _git_head_commit(repo: Path) -> str | None:
    result = run_command(["git", "rev-parse", "HEAD"], cwd=repo, text=True)
    if result.returncode != 0:
        return None
    value = result.stdout.strip()
    return value or None


def _source_metadata(source_repo: Path, *, ref: str | None = None) -> Dict[str, str]:
    source_ref = (ref or cfg("upstream_branch")).strip()
    metadata: Dict[str, str] = {
        "path": _manifest_source_path(source_repo),
        "source_type": "git" if (source_repo / ".git").exists() else "local",
    }
    if source_ref:
        metadata["ref"] = source_ref
    if (source_repo / ".git").exists():
        branch = _git_head_ref(source_repo)
        commit = _git_head_commit(source_repo)
        if branch:
            metadata["branch"] = branch
        if commit:
            metadata["commit"] = commit
    return metadata


def _update_source_metadata(
    manifest: Dict[str, Any],
    source_repo: Path,
    *,
    ref: str | None = None,
):
    source_entry = manifest.get("source")
    if source_entry is not None and not isinstance(source_entry, dict):
        source_entry = {}
    if not isinstance(source_entry, dict):
        source_entry = {}
    source_entry.update(_source_metadata(source_repo, ref=ref))
    manifest["source"] = source_entry


def _normalize_manifest_header(manifest: Dict[str, Any]):
    manifest["version"] = MANIFEST_VERSION
    manifest["repo"] = str(manifest.get("repo", cfg("upstream_repo_url")).strip())
    manifest["ref"] = str(manifest.get("ref", cfg("upstream_branch")).strip())
    manifest["mode"] = str(manifest.get("mode", cfg("mode"))).strip() or "copy"


def ensure_enabled() -> bool:
    if not bool(cfg("enabled")):
        print("SKIPPED: skills_sync.enabled=false")
        return False
    return True


def load_manifest() -> Dict[str, Any]:
    manifest_path = cfg_path("manifest_file")
    if not manifest_path.exists():
        manifest = _default_manifest()
        save_manifest(manifest)
        return manifest

    try:
        data = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse manifest {manifest_path}: {exc}") from exc

    manifest = _normalize_manifest(data)
    if manifest != data:
        save_manifest(manifest)
    return manifest


def save_manifest(manifest: Dict[str, Any]):
    manifest_path = cfg_path("manifest_file")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def skills_root_for_repo(repo: Path) -> Path:
    return repo / str(cfg("upstream_skills_dir"))


def profiles_root_for_repo(repo: Path) -> Path:
    return repo / "profiles"


def upstream_skills_root() -> Path:
    return source_repo_path() / str(cfg("upstream_skills_dir"))


def upstream_profiles_root() -> Path:
    return source_repo_path() / "profiles"


def project_skills_root() -> Path:
    return cfg_path("project_dir")


def resolve_project_target(args: argparse.Namespace) -> str:
    runtime = normalize_runtime(getattr(args, "runtime", None))
    if not is_supported_runtime(runtime):
        raise RuntimeError(f"Unsupported runtime/app: {runtime}")
    return runtime


def _is_valid_source_repo(path: Path) -> bool:
    skills_dir = skills_root_for_repo(path)
    profiles_dir = profiles_root_for_repo(path)
    has_profile_files = profiles_dir.is_dir() and any(profiles_dir.glob("*.json"))
    if not (
        path.exists()
        and skills_dir.exists()
        and skills_dir.is_dir()
        and (path / "index.json").exists()
        and has_profile_files
    ):
        return False

    available = set(_repo_skill_names(path))
    if not available:
        return False

    for profile_file in profiles_dir.glob("*.json"):
        try:
            raw_profile = json.loads(profile_file.read_text())
        except json.JSONDecodeError:
            return False
        if not isinstance(raw_profile, dict):
            return False
        try:
            referenced = _normalize_skill_list(raw_profile.get("skills"))
        except RuntimeError:
            return False
        if any(name not in available for name in referenced):
            return False

    return True


def _remove_path(path: Path, root: Path | None = None):
    if root is not None:
        _assert_path_within(root, path, "Removal path")
    if path.is_symlink() or path.is_file():
        path.unlink()
        return
    if path.exists():
        shutil.rmtree(path)


def _copy_tree(src: Path, dst: Path, *, src_root: Path | None = None, dst_root: Path | None = None):
    if src_root is not None:
        _assert_path_within(src_root, src, "Source path")
    if dst_root is not None:
        _assert_path_within(dst_root, dst, "Destination path")
    if dst.exists() or dst.is_symlink():
        _remove_path(dst, root=dst_root)
    shutil.copytree(src, dst)


def _copy_skill_dir(src_root: Path, dst_root: Path, name: str):
    name = normalize_skill_name(name)
    source_skills_root = skills_root_for_repo(src_root)
    src = skills_root_for_repo(src_root) / name
    _assert_path_within(source_skills_root, src, "Source skill path")
    _assert_path_within(dst_root, dst_root / name, "Destination skill path")
    if not (src / "SKILL.md").exists():
        raise RuntimeError(f"Source skill missing SKILL.md: {src}")

    dst_root.mkdir(parents=True, exist_ok=True)
    _copy_tree(src, dst_root / name, src_root=source_skills_root, dst_root=dst_root)


def _ensure_source_repo_layout(repo: Path):
    skills_root_for_repo(repo).mkdir(parents=True, exist_ok=True)
    profiles_root_for_repo(repo).mkdir(parents=True, exist_ok=True)
    index_path = repo / "index.json"
    if not index_path.exists():
        index_path.write_text("{}\n", encoding="utf-8")


def _repo_skill_names(repo: Path) -> List[str]:
    root = skills_root_for_repo(repo)
    if not root.exists():
        return []
    return sorted(
        [d.name for d in root.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    )


def _read_profile_skills(repo: Path, profile_name: str) -> List[str]:
    profile_name = normalize_profile_name(profile_name)
    profile_path = profiles_root_for_repo(repo) / f"{profile_name}.json"
    if not profile_path.exists():
        return []
    try:
        raw_profile = json.loads(profile_path.read_text())
    except json.JSONDecodeError:
        return []
    if not isinstance(raw_profile, dict):
        return []
    return _normalize_skill_list(raw_profile.get("skills"))


def _configured_profile_names(manifest: Dict[str, Any] | None = None) -> List[str]:
    manifest = manifest or {}
    profile_names: List[str] = []
    installs = manifest.get("installs")
    if isinstance(installs, list):
        for entry in installs:
            if not isinstance(entry, dict):
                continue
            profile = entry.get("profile")
            if isinstance(profile, str) and profile.strip():
                profile_names.append(normalize_profile_name(profile))

    if profile_names:
        return dedupe(profile_names)

    default_profile = normalize_profile_name(str(cfg("default_profile"))) if str(cfg("default_profile")).strip() else ""
    return [default_profile] if default_profile else []


def _write_local_profile(profile_path: Path, profile_name: str, skills: Sequence[str]):
    profile_path.write_text(
        json.dumps({"name": profile_name, "skills": list(skills)}, indent=2) + "\n",
        encoding="utf-8",
    )


def _write_local_index(index_path: Path, skills: Sequence[str], profiles: Sequence[str]):
    payload = {
        "generated_by": "agents-skills-sync local source",
        "profiles": list(profiles),
        "skills": [
            {
                "name": name,
                "path": f"{cfg('upstream_skills_dir')}/{name}",
            }
            for name in skills
        ],
    }
    index_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _sync_local_source_metadata(local_source: Path, source_repo: Path, manifest: Dict[str, Any] | None = None):
    manifest = manifest or {}
    local_skills = _repo_skill_names(local_source)
    profile_names = _configured_profile_names(manifest)
    profiles_root = profiles_root_for_repo(local_source)
    profiles_root.mkdir(parents=True, exist_ok=True)

    keep_profiles = set(profile_names)
    for profile_file in profiles_root.glob("*.json"):
        if profile_file.stem not in keep_profiles:
            profile_file.unlink()

    for profile_name in profile_names:
        source_profile_skills = _read_profile_skills(source_repo, profile_name)
        if source_profile_skills:
            filtered = [name for name in source_profile_skills if name in local_skills]
        else:
            filtered = list(local_skills)
        _write_local_profile(profiles_root / f"{profile_name}.json", profile_name, filtered)

    _write_local_index(local_source / "index.json", local_skills, profile_names)


def preferred_local_source_repo_path() -> Path:
    return cfg_path("source_dir")


def existing_git_sync_repo_path() -> Path | None:
    external = external_source_repo_path()
    if external and _is_valid_source_repo(external) and (external / ".git").exists():
        return external
    return None


def git_sync_repo_path() -> Path:
    repo = existing_git_sync_repo_path()
    if repo is None:
        raise RuntimeError(
            "Git-backed universal-skills source is not configured. "
            "Set AGENTS_UNIVERSAL_SKILLS_SOURCE or skills_sync.external_source_dir "
            "to an external checkout when a Git refresh is required."
        )
    return repo


def ensure_git_sync_repo(manifest: Dict[str, Any] | None = None) -> Path | None:
    return existing_git_sync_repo_path()


def refresh_git_sync_repo(manifest: Dict[str, Any]) -> Path | None:
    repo = ensure_git_sync_repo(manifest)
    if repo is None:
        return None

    ref = str(manifest.get("ref") or cfg("upstream_branch")).strip()
    if not (repo / ".git").exists():
        return None

    run(["git", "fetch", "origin"], cwd=repo)
    run(["git", "checkout", ref], cwd=repo)
    run(["git", "pull", "--ff-only", "origin", ref], cwd=repo)
    _update_source_metadata(manifest, repo, ref=ref)
    return repo


def mirror_skills_to_local_source(source_repo: Path, skills: Sequence[str], manifest: Dict[str, Any] | None = None):
    local_source = preferred_local_source_repo_path()
    if local_source.resolve() == source_repo.resolve():
        return

    _ensure_source_repo_layout(local_source)

    for name in skills:
        _copy_skill_dir(source_repo, skills_root_for_repo(local_source), name)

    _sync_local_source_metadata(local_source, source_repo, manifest)


def stage_skill_for_proposal(name: str, target_repo: Path) -> bool:
    name = normalize_skill_name(name)
    src = project_skills_root() / name
    _assert_path_within(project_skills_root(), src, "Project skill path")
    if not (src / "SKILL.md").exists():
        raise RuntimeError(f"Project skill missing SKILL.md: {src}")

    _ensure_source_repo_layout(target_repo)
    skills_root = skills_root_for_repo(target_repo)
    dst = skills_root / name
    _assert_path_within(skills_root, dst, "Proposal skill path")
    if (dst / "SKILL.md").exists() and skill_digest(src) == skill_digest(dst):
        return False

    skills_root.mkdir(parents=True, exist_ok=True)
    _copy_tree(src, dst, src_root=project_skills_root(), dst_root=skills_root)
    return True


def source_repo_candidates() -> List[Path]:
    candidates: List[Path] = []
    seen: set[Path] = set()
    for candidate in [external_source_repo_path(), cfg_path("source_dir")]:
        if candidate is None:
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        if _is_forbidden_repo_local_git_source(candidate):
            raise RuntimeError(
                f"Repo-local universal-skills source must not be a git checkout: {candidate}. "
                "Use a plain seed under .agents/source/universal-skills, or set "
                "AGENTS_UNIVERSAL_SKILLS_SOURCE to an external checkout."
            )
        candidates.append(candidate)
    return candidates


def external_source_repo_path() -> Path | None:
    raw = os.environ.get("AGENTS_UNIVERSAL_SKILLS_SOURCE", "").strip()
    if not raw:
        raw = str(cfg("external_source_dir")).strip()
    if not raw:
        return None
    return resolve_repo_path(ROOT_DIR, raw)


def _is_repo_local_path(path: Path) -> bool:
    try:
        path.resolve().relative_to(ROOT_DIR.resolve())
    except ValueError:
        return False
    return True


def _is_forbidden_repo_local_git_source(path: Path) -> bool:
    return _is_repo_local_path(path) and (path / ".git").exists()


def preferred_source_repo_path() -> Path:
    external = external_source_repo_path()
    if external is not None and _is_valid_source_repo(external):
        return external
    return cfg_path("source_dir")


def active_source_repo_path() -> Path | None:
    for candidate in source_repo_candidates():
        if _is_valid_source_repo(candidate):
            return candidate
    return None


def source_repo_path() -> Path:
    active = active_source_repo_path()
    if active is not None:
        return active
    return cfg_path("source_dir")


def catalog_source_repo_path() -> Path:
    return existing_git_sync_repo_path() or source_repo_path()


def validate_project_structure() -> List[str]:
    issues: List[str] = []
    root = project_skills_root()
    if not root.exists():
        return issues
    for item in root.iterdir():
        if not item.is_dir():
            continue
        if item.name in FORBIDDEN_SKILLS_DIRS:
            issues.append(
                f"Forbidden directory in skills/: {item.name} (mirror/cache dirs are not allowed inside skills/)"
            )
    return issues


def installed_skills() -> List[str]:
    root = project_skills_root()
    if not root.exists():
        return []
    return sorted(
        [d.name for d in root.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    )


def skill_digest(skill_dir: Path) -> str:
    files = sorted([p for p in skill_dir.rglob("*") if p.is_file()])
    h = hashlib.sha256()
    for file in files:
        rel = file.relative_to(skill_dir).as_posix().encode()
        h.update(rel + b"\0" + file.read_bytes() + b"\n")
    return h.hexdigest()


def available_skills(source_repo: Path | None = None) -> List[str]:
    root = skills_root_for_repo(source_repo or source_repo_path())
    if not root.exists():
        return []
    return sorted(
        [d.name for d in root.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    )


def _skill_doc_path(name: str, source_repo: Path | None = None) -> Path:
    name = normalize_skill_name(name)
    root = skills_root_for_repo(source_repo or source_repo_path())
    path = root / name / "SKILL.md"
    _assert_path_within(root, path.parent, "Source skill path")
    return path


def _skill_search_blob(name: str, source_repo: Path | None = None) -> str:
    doc_path = _skill_doc_path(name, source_repo=source_repo)
    if not doc_path.exists():
        return name.lower()
    try:
        body = doc_path.read_text(encoding="utf-8").lower()
    except OSError:
        return name.lower()
    return f"{name.lower()}\n{body}"


def _matching_skills(query: str, *, skills: Iterable[str], source_repo: Path | None = None) -> List[str]:
    wanted = query.strip().lower()
    if not wanted:
        return list(skills)
    matches: List[str] = []
    for name in skills:
        if wanted in _skill_search_blob(name, source_repo=source_repo):
            matches.append(name)
    return matches


def _resolve_targets(manifest: Dict[str, Any], runtime: str) -> List[Dict[str, Any]]:
    installs = manifest.get("installs", [])
    if not isinstance(installs, list):
        return []

    if runtime == SPECIAL_APP_ALL:
        return installs

    exact = [
        install
        for install in installs
        if isinstance(install, dict)
        and normalize_runtime(str(install.get("app", SPECIAL_APP_ALL))) == runtime
    ]
    if exact:
        return exact

    wildcard = [
        install
        for install in installs
        if isinstance(install, dict)
        and normalize_runtime(str(install.get("app", SPECIAL_APP_ALL))) == SPECIAL_APP_ALL
    ]
    if wildcard:
        return wildcard

    raise RuntimeError(f"No install scope for runtime '{runtime}' in manifest")


def resolve_skills_for_request(
    manifest: Dict[str, Any],
    *,
    cli_skills: List[str],
    runtime: str,
    profile: str | None,
) -> List[str]:
    explicit = _normalize_skill_list(cli_skills)
    profile = normalize_profile_name(profile) if isinstance(profile, str) and profile.strip() else None
    if explicit:
        return explicit

    selected_installs = _resolve_targets(manifest, runtime)
    resolved: List[str] = []
    for install in selected_installs:
        resolved.extend(
            _resolve_install_skills(
                install,
                manifest,
                profile_override=profile,
                app_hint=normalize_runtime(install.get("app", SPECIAL_APP_ALL)),
            )
        )

    if not resolved:
        raise RuntimeError("No skills resolved from manifest for this request")
    return dedupe(resolved)


def _selected_skills_for_args(args: argparse.Namespace) -> List[str]:
    manifest = load_manifest()
    return resolve_skills_for_request(
        manifest,
        cli_skills=parse_csv(getattr(args, "skills", None)),
        runtime=resolve_project_target(args),
        profile=getattr(args, "profile", None),
    )


def ensure_repo_cloned(manifest: Dict[str, Any] | None = None):
    source = active_source_repo_path()
    if source is not None:
        return

    raise RuntimeError(
        f"skills source not initialized: {cfg_path('source_dir')}. "
        "Seed .agents/source/universal-skills or set AGENTS_UNIVERSAL_SKILLS_SOURCE "
        "to an external universal-skills checkout."
    )


def cmd_init(args: argparse.Namespace):
    if not ensure_enabled():
        return
    manifest = load_manifest()
    ensure_repo_cloned(manifest)
    project_skills_root().mkdir(parents=True, exist_ok=True)
    save_manifest(manifest)
    print("OK: initialized skills sync")
    print(f"- source: {source_repo_path()}")
    print(f"- project: {project_skills_root()}")


def cmd_pull(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    repo = refresh_git_sync_repo(manifest)
    if repo is None:
        repo = source_repo_path()
        _update_source_metadata(
            manifest,
            repo,
            ref=str(manifest.get("ref", cfg("upstream_branch")).strip() or cfg("upstream_branch")),
        )
        save_manifest(manifest)
        print(f"OK: source refresh skipped for repo-local skills source at {source_repo_path()}")
        return

    save_manifest(manifest)
    ref = str(manifest.get("ref") or cfg("upstream_branch")).strip()
    print(f"OK: updated git skills source at {repo} (ref={ref})")
    if repo != source_repo_path():
        print(f"- local source remains at {source_repo_path()}")
        print("- use `skills-sync sync` (or `skills-sync update`) to install refreshed skills into .agents/skills")


def _compare(skills: Iterable[str], mode: str) -> Tuple[List[str], List[str], List[str]]:
    src_root = upstream_skills_root()
    dst_root = project_skills_root()
    missing_source: List[str] = []
    missing_project: List[str] = []
    drift: List[str] = []

    for name in sorted(set(_normalize_skill_list(list(skills)))):
        src = src_root / name
        dst = dst_root / name
        _assert_path_within(src_root, src, "Source skill path")
        _assert_path_within(dst_root, dst, "Destination skill path")
        if not (src / "SKILL.md").exists():
            missing_source.append(name)
            continue
        if not (dst / "SKILL.md").exists():
            missing_project.append(name)
            continue
        if mode == "link" and dst.is_symlink():
            continue
        if skill_digest(src) != skill_digest(dst):
            drift.append(name)

    return missing_source, missing_project, drift


def cmd_plan(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    skills = resolve_skills_for_request(
        manifest,
        cli_skills=parse_csv(args.skills),
        runtime=resolve_project_target(args),
        profile=getattr(args, "profile", None),
    )
    if not skills:
        print("No selected skills. Provide --skills or configure manifest.")
        return

    missing_source, missing_project, drift = _compare(skills, manifest.get("mode", cfg("mode")))
    print("PLAN")
    print(f"- selected: {len(skills)}")
    print(f"- runtime: {resolve_project_target(args)}")
    print(f"- missing in source: {missing_source or 'none'}")
    print(f"- missing in project: {missing_project or 'none'}")
    print(f"- drift: {drift or 'none'}")


def cmd_list(args: argparse.Namespace):
    if not ensure_enabled():
        return

    source_repo = source_repo_path()
    if getattr(args, "selected", False):
        skills = _selected_skills_for_args(args)
    elif getattr(args, "installed", False):
        skills = installed_skills()
    else:
        source_repo = catalog_source_repo_path()
        skills = available_skills(source_repo=source_repo)

    installed = set(installed_skills())
    runtime = resolve_project_target(args) if hasattr(args, "runtime") else SPECIAL_APP_ALL

    print("SKILLS")
    print(f"- source: {source_repo}")
    print(f"- runtime: {runtime}")
    print(f"- count: {len(skills)}")
    for name in skills:
        state = "installed" if name in installed else "available"
        print(f"  - {name} [{state}]")


def cmd_search(args: argparse.Namespace):
    if not ensure_enabled():
        return

    limit = max(1, int(getattr(args, "limit", 20)))
    source_repo = source_repo_path()
    if getattr(args, "selected", False):
        base_skills = _selected_skills_for_args(args)
    else:
        source_repo = catalog_source_repo_path()
        base_skills = available_skills(source_repo=source_repo)

    matches = _matching_skills(args.query, skills=base_skills, source_repo=source_repo)[:limit]
    installed = set(installed_skills())

    print("SKILL SEARCH")
    print(f"- source: {source_repo}")
    print(f"- query: {args.query}")
    print(f"- matches: {len(matches)}")
    for name in matches:
        state = "installed" if name in installed else "available"
        print(f"  - {name} [{state}]")
    if not matches:
        print("  - none")


def apply_skill(name: str, source_repo: Path | None = None):
    name = normalize_skill_name(name)
    source_root = source_repo or source_repo_path()
    src_root = skills_root_for_repo(source_root)
    dst_root = project_skills_root()
    src = src_root / name
    dst = dst_root / name
    _assert_path_within(src_root, src, "Source skill path")
    _assert_path_within(dst_root, dst, "Destination skill path")

    if not (src / "SKILL.md").exists():
        raise RuntimeError(f"Source skill missing SKILL.md: {src}")

    mode = cfg("mode")
    dst.parent.mkdir(parents=True, exist_ok=True)

    if dst.exists() or dst.is_symlink():
        _remove_path(dst, root=dst_root)

    if mode == "link":
        dst.symlink_to(src, target_is_directory=True)
    elif mode == "copy":
        shutil.copytree(src, dst)
    else:
        raise RuntimeError(f"Invalid skills_sync.mode: {mode} (expected copy|link)")


def apply_skills_from_repo(skills: Sequence[str], source_repo: Path | None = None):
    normalized_skills = _normalize_skill_list(list(skills))
    for name in normalized_skills:
        apply_skill(name, source_repo=source_repo)
        print(f"APPLIED: {name}")


def _persist_explicit_skill_selection(
    manifest: Dict[str, Any],
    *,
    runtime: str,
    skills: List[str],
    profile: str | None = None,
):
    installs = manifest.setdefault("installs", [])
    if not isinstance(installs, list):
        installs = []
        manifest["installs"] = installs

    explicit = {"app": runtime, "skills": _normalize_skill_list(skills)}
    if profile:
        explicit["profile"] = normalize_profile_name(profile)

    for install in installs:
        if isinstance(install, dict) and normalize_runtime(str(install.get("app", SPECIAL_APP_ALL))) == runtime:
            install.clear()
            install.update(explicit)
            return

    installs.append(explicit)


def _persist_ensured_skill(
    manifest: Dict[str, Any],
    *,
    runtime: str,
    skill: str,
    profile: str | None,
):
    try:
        existing = resolve_skills_for_request(
            manifest,
            cli_skills=[],
            runtime=runtime,
            profile=profile,
        )
    except RuntimeError:
        existing = []

    merged = _normalize_skill_list([*existing, skill])
    _persist_explicit_skill_selection(
        manifest,
        runtime=runtime,
        skills=merged,
        profile=profile,
    )


def cmd_apply(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    cli_skills = parse_csv(args.skills)
    runtime = resolve_project_target(args)
    skills = resolve_skills_for_request(
        manifest,
        cli_skills=cli_skills,
        runtime=runtime,
        profile=getattr(args, "profile", None),
    )
    if not skills:
        raise RuntimeError("No selected skills. Provide --skills or update manifest.")

    problems = validate_project_structure()
    if problems:
        raise RuntimeError("; ".join(problems))

    if not upstream_skills_root().exists():
        raise RuntimeError(
            f"skills source not initialized: {source_repo_path()}"
        )

    apply_skills_from_repo(skills)

    if cli_skills:
        _persist_explicit_skill_selection(
            manifest,
            runtime=runtime,
            skills=skills,
            profile=getattr(args, "profile", None),
        )

    manifest["version"] = MANIFEST_VERSION
    manifest["repo"] = str(manifest.get("repo", cfg("upstream_repo_url")).strip())
    manifest["ref"] = str(manifest.get("ref", cfg("upstream_branch")).strip())
    manifest["mode"] = str(manifest.get("mode", cfg("mode"))).strip() or "copy"
    save_manifest(manifest)
    print("OK: apply completed")


def cmd_ensure(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    refreshed_repo: Path | None = None
    if getattr(args, "pull", False):
        refreshed_repo = refresh_git_sync_repo(manifest)
    else:
        ensure_repo_cloned(manifest)

    skill = normalize_skill_name(args.skill)

    source_repo = refreshed_repo or source_repo_path()
    if refreshed_repo is not None:
        mirror_skills_to_local_source(refreshed_repo, [skill], manifest)

    source_doc = _skill_doc_path(skill, source_repo=source_repo)
    catalog_repo = existing_git_sync_repo_path()
    if not source_doc.exists() and catalog_repo is not None and catalog_repo != source_repo:
        source_repo = catalog_repo
        source_doc = _skill_doc_path(skill, source_repo=source_repo)

    if not source_doc.exists():
        hint = ""
        repo = str(manifest.get("repo") or cfg("upstream_repo_url")).strip()
        if repo and refreshed_repo is None:
            hint = " Use --pull or run `skills-sync pull` first to fetch the git-backed source."
        raise RuntimeError(f"Skill '{skill}' not found in source: {source_repo}.{hint}")

    destination = project_skills_root() / skill / "SKILL.md"
    if destination.exists():
        source_digest = skill_digest(source_doc.parent)
        dest_digest = skill_digest(destination.parent)
        if source_digest == dest_digest:
            print(f"OK: skill already installed and aligned: {skill}")
        else:
            apply_skill(skill, source_repo=source_repo)
            print(f"UPDATED: {skill}")
    else:
        apply_skill(skill, source_repo=source_repo)
        print(f"APPLIED: {skill}")

    if getattr(args, "persist", False):
        runtime = resolve_project_target(args)
        _persist_ensured_skill(
            manifest,
            runtime=runtime,
            skill=skill,
            profile=getattr(args, "profile", None),
        )
        save_manifest(manifest)
        print(f"PERSISTED: {skill} -> manifest runtime={runtime}")


def _print_project_structure_problems(problems: List[str]) -> None:
    for p in problems:
        print(f"ERROR: {p}")


def _explicit_manifest_skills(manifest: Dict[str, Any], runtime: str) -> set[str]:
    selected_installs = _resolve_targets(manifest, runtime)
    return {
        normalize_skill_name(skill)
        for install in selected_installs
        if isinstance(install, dict)
        for skill in _normalize_skill_list(install.get("skills"), [])
    }


def _check_drift_state(manifest: Dict[str, Any], skills: List[str], runtime: str) -> Dict[str, List[str]]:
    explicit_skills = _explicit_manifest_skills(manifest, runtime)
    missing_source, missing_project, drift = _compare(skills, manifest.get("mode", cfg("mode")))
    return {
        "stale_manifest_entries": sorted(name for name in missing_source if name in explicit_skills),
        "real_source_drift": sorted(name for name in missing_source if name not in explicit_skills),
        "missing_project": missing_project,
        "drift": drift,
        "local_extras": sorted(set(installed_skills()) - set(skills)),
    }


def _print_check_drift(state: Dict[str, List[str]]) -> None:
    if state["stale_manifest_entries"]:
        print(f"WARN: stale-manifest-entry: {', '.join(state['stale_manifest_entries'])}")
    if state["local_extras"]:
        print(f"WARN: local-extra: {', '.join(state['local_extras'])}")
    if state["real_source_drift"]:
        print(f"ERROR: source-drift (selected set): {', '.join(state['real_source_drift'])}")
    if state["missing_project"]:
        print(f"ERROR: missing in project: {', '.join(state['missing_project'])}")
    if state["drift"]:
        print(f"ERROR: source-drift (selected set): {', '.join(state['drift'])}")


def _has_check_errors(problems: List[str], state: Dict[str, List[str]]) -> bool:
    return bool(problems or state["real_source_drift"] or state["missing_project"] or state["drift"])


def cmd_check(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    required = bool(cfg("required"))
    if not upstream_skills_root().exists():
        msg = f"skills source not initialized: {source_repo_path()}"
        if required:
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    problems = validate_project_structure()
    _print_project_structure_problems(problems)

    runtime = resolve_project_target(args)
    skills = resolve_skills_for_request(
        manifest,
        cli_skills=parse_csv(args.skills),
        runtime=runtime,
        profile=getattr(args, "profile", None),
    )
    if not skills:
        msg = "No selected skills in manifest or --skills"
        if required:
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    drift_state = _check_drift_state(manifest, skills, runtime)
    _print_check_drift(drift_state)
    if _has_check_errors(problems, drift_state):
        if not required:
            print("WARN: skills sync is not fully aligned, but it is optional in this repo")
            return
        raise RuntimeError("skills-check failed")

    print("PASS: skills structure and sync are valid")


def cmd_status(args: argparse.Namespace):
    manifest = load_manifest()
    active_source = active_source_repo_path()
    git_source = existing_git_sync_repo_path()
    catalog_source = catalog_source_repo_path()
    print("SKILLS SYNC STATUS")
    print(f"- enabled: {cfg('enabled')}")
    print(f"- required: {cfg('required')}")
    print(f"- version: {manifest.get('version', MANIFEST_VERSION)}")
    print(f"- repo: {manifest.get('repo', cfg('upstream_repo_url'))}")
    print(f"- ref: {manifest.get('ref', cfg('upstream_branch'))}")
    print(f"- source_metadata: {manifest.get('source', {})}")
    print(f"- mode: {manifest.get('mode', cfg('mode'))}")
    print(f"- source_dir: {preferred_source_repo_path()}")
    print(f"- external_source_dir: {external_source_repo_path() or 'none'}")
    print(f"- active_source: {active_source or 'missing'}")
    print(f"- git_sync_source: {git_source or 'none'}")
    print(f"- catalog_source: {catalog_source}")
    print(f"- proposal_branch_prefix: {cfg('proposal_branch_prefix')}")
    print(f"- project_dir: {project_skills_root()}")
    print(f"- manifest: {cfg_path('manifest_file')}")
    print(f"- installs: {len(manifest.get('installs', []))}")
    print(f"- available in active source: {len(available_skills(source_repo=active_source)) if active_source else 0}")
    print(f"- available in catalog source: {len(available_skills(source_repo=catalog_source))}")


def cmd_sync(args: argparse.Namespace):
    if not ensure_enabled():
        return
    manifest = load_manifest()
    cli_skills = parse_csv(getattr(args, "skills", None))
    runtime = resolve_project_target(args)
    profile = getattr(args, "profile", None)
    skills = resolve_skills_for_request(
        manifest,
        cli_skills=cli_skills,
        runtime=runtime,
        profile=profile,
    )
    if not skills:
        raise RuntimeError("No selected skills. Provide --skills or update manifest.")

    refreshed_repo = refresh_git_sync_repo(manifest) if getattr(args, "pull", False) else None
    source_repo = refreshed_repo or source_repo_path()
    if refreshed_repo is not None:
        mirror_skills_to_local_source(refreshed_repo, skills, manifest)
    _update_source_metadata(
        manifest,
        source_repo,
        ref=str(manifest.get("ref", cfg("upstream_branch")).strip() or None),
    )

    problems = validate_project_structure()
    if problems:
        raise RuntimeError("; ".join(problems))

    if not skills_root_for_repo(source_repo).exists():
        raise RuntimeError(f"skills source not initialized: {source_repo}")

    apply_skills_from_repo(skills, source_repo=source_repo)

    if cli_skills:
        _persist_explicit_skill_selection(
            manifest,
            runtime=runtime,
            skills=skills,
            profile=profile,
        )

    _normalize_manifest_header(manifest)
    save_manifest(manifest)
    cmd_check(args)


def _push_skill_names(args: argparse.Namespace) -> List[str]:
    candidates = [*parse_csv(getattr(args, "skills", None))]
    single = getattr(args, "skill", None)
    if isinstance(single, str) and single.strip():
        candidates.append(single.strip())
    explicit = _normalize_skill_list(candidates)
    if not explicit:
        raise RuntimeError("Provide a skill name or --skills for the upstream proposal")
    return explicit


def _default_push_message(skills: Sequence[str]) -> str:
    if len(skills) == 1:
        return f"skills-sync: propose {skills[0]}"
    return f"skills-sync: propose {len(skills)} skills"


def _append_codex_trailer(message: str) -> str:
    trailer = "Co-authored-by: Codex <noreply@openai.com>"
    normalized = message.strip()
    if trailer in normalized.splitlines():
        return normalized
    return f"{normalized}\n\n{trailer}"


def _slugify_branch_part(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._/-]+", "-", value.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-/")
    return slug or "skills"


def _default_proposal_branch(skills: Sequence[str]) -> str:
    prefix = _slugify_branch_part(str(cfg("proposal_branch_prefix")).strip() or "skills-sync")
    label = _slugify_branch_part(skills[0]) if len(skills) == 1 else f"{len(skills)}-skills"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"{prefix}/{stamp}-{label}"


def _validate_proposal_branch(branch: str, base: str):
    normalized_branch = branch.strip().removeprefix("refs/heads/").removeprefix("origin/")
    normalized_base = base.strip().removeprefix("refs/heads/").removeprefix("origin/")
    protected = {normalized_base, "main", "master"}
    if not normalized_branch or normalized_branch in protected:
        raise RuntimeError(
            f"Refusing to push universal-skills proposal directly to protected branch '{branch}'. "
            "Use a feature branch and open a PR."
        )
    if branch.startswith("-") or ".." in branch or branch.endswith(".lock") or " " in branch:
        raise RuntimeError(f"Unsafe git branch name for skills proposal: {branch}")


def _default_pr_body(skills: Sequence[str]) -> str:
    return (
        "Proposes updates from the project-local skills surface.\n\n"
        "Skills:\n"
        + "\n".join(f"- {name}" for name in skills)
    )


def _git_ref_exists(repo: Path, ref: str) -> bool:
    result = run_command(["git", "show-ref", "--verify", "--quiet", ref], cwd=repo)
    return result.returncode == 0


def _checkout_proposal_branch(repo: Path, branch: str, base: str):
    local_ref = f"refs/heads/{branch}"
    remote_ref = f"refs/remotes/origin/{branch}"
    if _git_ref_exists(repo, local_ref):
        run(["git", "checkout", branch], cwd=repo)
        return
    if _git_ref_exists(repo, remote_ref):
        run(["git", "checkout", "-b", branch, f"origin/{branch}"], cwd=repo)
        return
    run(["git", "checkout", "-b", branch, f"origin/{base}"], cwd=repo)


def cmd_push(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    git_repo = ensure_git_sync_repo(manifest)
    if git_repo is None or not (git_repo / ".git").exists():
        raise RuntimeError("Git-backed external skills source is required to propose upstream skill changes")

    skills = _push_skill_names(args)
    base = str(getattr(args, "base", None) or manifest.get("ref") or cfg("upstream_branch")).strip()
    if not base:
        raise RuntimeError("Manifest ref/upstream_branch is required for an upstream skill proposal")
    branch = str(getattr(args, "branch", None) or _default_proposal_branch(skills)).strip()
    _validate_proposal_branch(branch, base)

    run(["git", "fetch", "origin"], cwd=git_repo)
    _checkout_proposal_branch(git_repo, branch, base)

    changed: List[str] = []
    unchanged: List[str] = []
    local_source = preferred_local_source_repo_path()

    for name in skills:
        if stage_skill_for_proposal(name, git_repo):
            changed.append(name)
            print(f"PROPOSED: {name} -> {git_repo}")
        else:
            unchanged.append(name)
            print(f"UNCHANGED: {name}")

    if local_source.resolve() != git_repo.resolve():
        mirror_skills_to_local_source(git_repo, skills, manifest)

    if unchanged and not changed:
        print("OK: no source changes detected")
        return

    pathspecs = [f"{cfg('upstream_skills_dir')}/{name}" for name in changed]
    should_commit = bool(getattr(args, "commit", False) or getattr(args, "push", False) or getattr(args, "pr", False))
    should_push = bool(getattr(args, "push", False) or getattr(args, "pr", False))
    if should_commit:
        commit_message = _append_codex_trailer(getattr(args, "message", None) or _default_push_message(changed))
        run(["git", "add", "--", *pathspecs], cwd=git_repo)
        run(
            [
                "git",
                "commit",
                "-m",
                commit_message,
                "--only",
                "--",
                *pathspecs,
            ],
            cwd=git_repo,
        )
        print(f"COMMITTED: {', '.join(changed)}")

    if should_push:
        run(["git", "push", "-u", "origin", f"HEAD:{branch}"], cwd=git_repo)
        print(f"PUSHED: {', '.join(changed)} -> origin/{branch}")

    if getattr(args, "pr", False):
        title = getattr(args, "title", None) or _default_push_message(changed)
        body = getattr(args, "body", None) or _default_pr_body(changed)
        run(["gh", "pr", "create", "--base", base, "--head", branch, "--title", title, "--body", body], cwd=git_repo)
        print(f"PR REQUESTED: {branch} -> {base}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sync project skills from universal-skills")
    sub = parser.add_subparsers(dest="command", required=True)

    for name, fn in [
        ("init", cmd_init),
        ("pull", cmd_pull),
        ("status", cmd_status),
        ("list", cmd_list),
        ("search", cmd_search),
        ("plan", cmd_plan),
        ("apply", cmd_apply),
        ("ensure", cmd_ensure),
        ("check", cmd_check),
        ("sync", cmd_sync),
        ("update", cmd_sync),
        ("push", cmd_push),
    ]:
        sp = sub.add_parser(name)
        if name in {"list", "search", "plan", "apply", "ensure", "check", "sync", "update", "push"}:
            sp.add_argument("--skills", help="CSV list of skill names")
            sp.add_argument("--runtime", dest="runtime", help="Target runtime/app")
            sp.add_argument("--app", dest="runtime", help="Alias for --runtime")
            sp.add_argument("--profile", help="Profile name used for selected installs")
        if name in {"sync", "update"}:
            sp.add_argument(
                "--pull",
                action="store_true",
                help="Refresh the external source before syncing",
            )
        if name == "list":
            sp.add_argument("--installed", action="store_true", help="Show only currently installed project skills")
            sp.add_argument("--selected", action="store_true", help="Show only skills resolved from the manifest for this runtime/profile")
        if name == "search":
            sp.add_argument("query", help="Keyword to search in source skills")
            sp.add_argument("--limit", type=int, default=20, help="Maximum matches to print")
            sp.add_argument("--selected", action="store_true", help="Search only manifest-selected skills for the runtime/profile")
        if name == "ensure":
            sp.add_argument("skill", help="Skill name to ensure in the project")
            sp.add_argument("--persist", action="store_true", help="Persist the ensured skill into the manifest for the selected runtime")
            sp.add_argument("--pull", action="store_true", help="Refresh the source checkout before ensuring the skill")
        if name == "push":
            sp.add_argument("skill", nargs="?", help="Single skill name to propose back to the external git source")
            sp.add_argument("--base", help="Base branch for the upstream PR proposal")
            sp.add_argument("--branch", help="Proposal branch name to create/update")
            sp.add_argument("--commit", action="store_true", help="Create a git commit for the proposed skill changes")
            sp.add_argument("--push", action="store_true", help="Push the proposal branch to origin/<branch>")
            sp.add_argument("--pr", action="store_true", help="Push the proposal branch and open a GitHub PR")
            sp.add_argument("--message", help="Commit message to use with --commit/--push")
            sp.add_argument("--title", help="PR title to use with --pr")
            sp.add_argument("--body", help="PR body to use with --pr")
        sp.set_defaults(func=fn)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
