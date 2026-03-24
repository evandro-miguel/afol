#!/usr/bin/env python3
"""Sync project skills from a universal skills pool with runtime-aware profiles."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from lib.agents_config import load_agents_config, resolve_repo_path


ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)

DEFAULTS = {
    "enabled": False,
    "upstream_repo_url": "",
    "upstream_branch": "main",
    "source_dir": "../universal-skills",
    "pool_dir": ".agents/cache/universal-skills",
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
    "default_skills": ["writing-skills", "markdownlint-skill"],
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
    result = subprocess.run(cmd, cwd=cwd or ROOT_DIR, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(cmd)}")


def parse_csv(value: str | None) -> List[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_runtime(value: str | None) -> str:
    if not value:
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


def _normalize_install(entry: Any) -> Dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None

    app = normalize_runtime(str(entry.get("app", SPECIAL_APP_ALL)))
    skills = _normalize_string_list(entry.get("skills"), [])
    profile = entry.get("profile")
    profile_name = profile.strip() if isinstance(profile, str) else ""
    if not skills and not profile_name:
        return None

    normalized: Dict[str, Any] = {"app": app}
    if skills:
        normalized["skills"] = dedupe(skills)
    if profile_name:
        normalized["profile"] = profile_name
    return normalized


def _default_manifest() -> Dict[str, Any]:
    default_skills = dedupe(_normalize_string_list(cfg("default_skills")))
    default_profile = str(cfg("default_profile")).strip()

    installs = []
    if default_profile:
        installs.append({"app": SPECIAL_APP_ALL, "profile": default_profile})
    else:
        installs.append({"app": SPECIAL_APP_ALL, "skills": default_skills})

    return {
        "version": MANIFEST_VERSION,
        "repo": str(cfg("upstream_repo_url")).strip(),
        "ref": str(cfg("upstream_branch")).strip(),
        "mode": str(cfg("mode")).strip() or "copy",
        "installs": installs,
    }


def _profile_skills_from_source(profile: str, manifest: Dict[str, Any]) -> List[str]:
    profiles = manifest.get("profiles")
    if isinstance(profiles, dict):
        profile_data = profiles.get(profile)
        if profile_data is not None:
            return dedupe(_normalize_string_list(profile_data))

    profile_path = upstream_profiles_root() / f"{profile}.json"
    if not profile_path.exists():
        return []

    try:
        raw_profile = json.loads(profile_path.read_text())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Malformed profile file {profile_path}: {exc}") from exc

    if not isinstance(raw_profile, dict):
        return []

    return dedupe(_normalize_string_list(raw_profile.get("skills")))


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
        return dedupe(_normalize_string_list(skills))

    if isinstance(profile, str):
        profile_name = profile.strip()
        if not profile_name:
            return []
        resolved = _profile_skills_from_source(profile_name, manifest)
        if resolved:
            return resolved
        raise RuntimeError(f"Profile '{profile_name}' not found for app '{app_hint}'")

    return []


def _normalize_manifest(data: Any) -> Dict[str, Any]:  # noqa: C901
    if not isinstance(data, dict):
        raise RuntimeError("Skills manifest must be a JSON object")

    version = data.get("version")
    has_legacy_fields = isinstance(data.get("selected_skills"), list) or version in (None, 1)

    if has_legacy_fields:
        legacy_skills = dedupe(
            _normalize_string_list(data.get("selected_skills"))
        )
        raw_installs = data.get("installs", [])
        legacy_installs: List[Dict[str, Any]] = []

        if isinstance(raw_installs, str):
            raw_list = parse_csv(raw_installs)
        elif isinstance(raw_installs, list):
            raw_list = raw_installs
        else:
            raw_list = []

        for entry in raw_list:
            if isinstance(entry, str):
                normalized = _normalize_install({"app": SPECIAL_APP_ALL, "skills": [entry]})
            else:
                normalized = _normalize_install(entry)
            if normalized:
                legacy_installs.append(normalized)

        if legacy_skills:
            legacy_installs.append({"app": SPECIAL_APP_ALL, "skills": legacy_skills})

        if not legacy_installs:
            baseline = _default_manifest()
            baseline["repo"] = str(data.get("repo", baseline["repo"]))
            baseline["ref"] = str(data.get("ref", data.get("upstream_branch", baseline["ref"])))
            return baseline

        return {
            "version": MANIFEST_VERSION,
            "repo": str(data.get("repo", cfg("upstream_repo_url"))),
            "ref": str(data.get("ref", data.get("upstream_branch", cfg("upstream_branch")))),
            "mode": str(data.get("mode", cfg("mode"))).strip() or "copy",
            "installs": legacy_installs,
        }

    if version not in (MANIFEST_VERSION,):
        raise RuntimeError(f"Unsupported skills manifest version: {version}")

    raw_installs = data.get("installs")
    normalized_installs: List[Dict[str, Any]] = []
    if isinstance(raw_installs, list):
        for entry in raw_installs:
            normalized = _normalize_install(entry)
            if normalized:
                normalized_installs.append(normalized)

    if not normalized_installs:
        normalized_installs = _default_manifest()["installs"]

    manifest = {
        "version": MANIFEST_VERSION,
        "repo": str(data.get("repo", cfg("upstream_repo_url"))).strip(),
        "ref": str(data.get("ref", cfg("upstream_branch"))).strip(),
        "mode": str(data.get("mode", cfg("mode"))).strip() or "copy",
        "installs": normalized_installs,
    }

    if not manifest["repo"]:
        manifest["repo"] = str(cfg("upstream_repo_url")).strip()
    if not manifest["ref"]:
        manifest["ref"] = str(cfg("upstream_branch")).strip()

    profiles = data.get("profiles")
    if isinstance(profiles, dict):
        manifest["profiles"] = {
            str(name): dedupe(_normalize_string_list(skills))
            for name, skills in profiles.items()
        }

    return manifest


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
    skills_dir = path / str(cfg("upstream_skills_dir"))
    return path.exists() and skills_dir.exists() and skills_dir.is_dir()


def source_repo_candidates() -> List[Path]:
    candidates: List[Path] = []
    seen: set[Path] = set()
    for key in ("source_dir", "pool_dir"):
        raw = str(cfg(key)).strip()
        if not raw:
            continue
        candidate = resolve_repo_path(ROOT_DIR, raw)
        if candidate in seen:
            continue
        seen.add(candidate)
        candidates.append(candidate)
    return candidates


def preferred_source_repo_path() -> Path:
    candidates = source_repo_candidates()
    if candidates:
        return candidates[0]
    return cfg_path("pool_dir")


def active_source_repo_path() -> Path | None:
    for candidate in source_repo_candidates():
        if _is_valid_source_repo(candidate):
            return candidate
    return None


def source_repo_path() -> Path:
    active = active_source_repo_path()
    if active is not None:
        return active
    return preferred_source_repo_path()


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


def available_skills() -> List[str]:
    root = upstream_skills_root()
    if not root.exists():
        return []
    return sorted(
        [d.name for d in root.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    )


def _skill_doc_path(name: str) -> Path:
    return upstream_skills_root() / name / "SKILL.md"


def _skill_search_blob(name: str) -> str:
    doc_path = _skill_doc_path(name)
    if not doc_path.exists():
        return name.lower()
    try:
        body = doc_path.read_text(encoding="utf-8").lower()
    except OSError:
        return name.lower()
    return f"{name.lower()}\n{body}"


def _matching_skills(query: str, *, skills: Iterable[str]) -> List[str]:
    wanted = query.strip().lower()
    if not wanted:
        return list(skills)
    matches: List[str] = []
    for name in skills:
        if wanted in _skill_search_blob(name):
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
    explicit = dedupe(_normalize_string_list(cli_skills))
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
    pool = active_source_repo_path() or preferred_source_repo_path()
    manifest = manifest or {}
    url = str(manifest.get("repo") or cfg("upstream_repo_url")).strip()
    ref = str(manifest.get("ref") or cfg("upstream_branch")).strip()

    if not url:
        raise RuntimeError("skills_sync.upstream_repo_url is required")

    if _is_valid_source_repo(pool) or (pool / ".git").exists():
        return

    pool.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--branch", ref, url, str(pool)], cwd=ROOT_DIR)


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
    ensure_repo_cloned(manifest)
    pool = source_repo_path()
    ref = str(manifest.get("ref") or cfg("upstream_branch")).strip()
    run(["git", "fetch", "origin"], cwd=pool)
    run(["git", "checkout", ref], cwd=pool)
    run(["git", "pull", "--ff-only", "origin", ref], cwd=pool)
    print(f"OK: updated source checkout at {pool} (ref={ref})")


def _compare(skills: Iterable[str], mode: str) -> Tuple[List[str], List[str], List[str]]:
    src_root = upstream_skills_root()
    dst_root = project_skills_root()
    missing_source: List[str] = []
    missing_project: List[str] = []
    drift: List[str] = []

    for name in sorted(set(skills)):
        src = src_root / name
        dst = dst_root / name
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

    if getattr(args, "selected", False):
        skills = _selected_skills_for_args(args)
    elif getattr(args, "installed", False):
        skills = installed_skills()
    else:
        skills = available_skills()

    installed = set(installed_skills())
    runtime = resolve_project_target(args) if hasattr(args, "runtime") else SPECIAL_APP_ALL

    print("SKILLS")
    print(f"- source: {source_repo_path()}")
    print(f"- runtime: {runtime}")
    print(f"- count: {len(skills)}")
    for name in skills:
        state = "installed" if name in installed else "available"
        print(f"  - {name} [{state}]")


def cmd_search(args: argparse.Namespace):
    if not ensure_enabled():
        return

    limit = max(1, int(getattr(args, "limit", 20)))
    if getattr(args, "selected", False):
        base_skills = _selected_skills_for_args(args)
    else:
        base_skills = available_skills()

    matches = _matching_skills(args.query, skills=base_skills)[:limit]
    installed = set(installed_skills())

    print("SKILL SEARCH")
    print(f"- source: {source_repo_path()}")
    print(f"- query: {args.query}")
    print(f"- matches: {len(matches)}")
    for name in matches:
        state = "installed" if name in installed else "available"
        print(f"  - {name} [{state}]")
    if not matches:
        print("  - none")


def apply_skill(name: str):
    src = upstream_skills_root() / name
    dst = project_skills_root() / name

    if not (src / "SKILL.md").exists():
        raise RuntimeError(f"Source skill missing SKILL.md: {src}")

    mode = cfg("mode")
    dst.parent.mkdir(parents=True, exist_ok=True)

    if dst.exists() or dst.is_symlink():
        if dst.is_symlink() or dst.is_file():
            dst.unlink()
        else:
            shutil.rmtree(dst)

    if mode == "link":
        dst.symlink_to(src, target_is_directory=True)
    elif mode == "copy":
        shutil.copytree(src, dst)
    else:
        raise RuntimeError(f"Invalid skills_sync.mode: {mode} (expected copy|link)")


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

    explicit = {"app": runtime, "skills": dedupe(skills)}
    if profile:
        explicit["profile"] = str(profile)

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

    merged = dedupe([*existing, skill])
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
            f"skills pool not initialized: {source_repo_path()}"
        )

    for name in skills:
        apply_skill(name)
        print(f"APPLIED: {name}")

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
    if getattr(args, "pull", False):
        cmd_pull(args)
    else:
        ensure_repo_cloned(manifest)

    skill = args.skill.strip()
    if not skill:
        raise RuntimeError("Skill name is required")

    source_doc = _skill_doc_path(skill)
    if not source_doc.exists():
        raise RuntimeError(f"Skill '{skill}' not found in source: {source_repo_path()}")

    destination = project_skills_root() / skill / "SKILL.md"
    if destination.exists():
        source_digest = skill_digest(source_doc.parent)
        dest_digest = skill_digest(destination.parent)
        if source_digest == dest_digest:
            print(f"OK: skill already installed and aligned: {skill}")
        else:
            apply_skill(skill)
            print(f"UPDATED: {skill}")
    else:
        apply_skill(skill)
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


def cmd_check(args: argparse.Namespace):
    if not ensure_enabled():
        return

    manifest = load_manifest()
    required = bool(cfg("required"))
    if not upstream_skills_root().exists():
        msg = f"skills pool not initialized: {source_repo_path()}"
        if required:
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    problems = validate_project_structure()
    for p in problems:
        print(f"ERROR: {p}")

    skills = resolve_skills_for_request(
        manifest,
        cli_skills=parse_csv(args.skills),
        runtime=resolve_project_target(args),
        profile=getattr(args, "profile", None),
    )
    if not skills:
        msg = "No selected skills in manifest or --skills"
        if required:
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    missing_source, missing_project, drift = _compare(skills, manifest.get("mode", cfg("mode")))
    if missing_source:
        print(f"ERROR: missing in source: {', '.join(missing_source)}")
    if missing_project:
        print(f"ERROR: missing in project: {', '.join(missing_project)}")
    if drift:
        print(f"ERROR: drift detected: {', '.join(drift)}")

    has_errors = bool(problems or missing_source or missing_project or drift)
    if has_errors:
        if not required:
            print("WARN: skills sync is not fully aligned, but it is optional in this repo")
            return
        raise RuntimeError("skills-check failed")

    print("PASS: skills structure and sync are valid")


def cmd_status(args: argparse.Namespace):
    manifest = load_manifest()
    active_source = active_source_repo_path()
    print("SKILLS SYNC STATUS")
    print(f"- enabled: {cfg('enabled')}")
    print(f"- required: {cfg('required')}")
    print(f"- version: {manifest.get('version', MANIFEST_VERSION)}")
    print(f"- repo: {manifest.get('repo', cfg('upstream_repo_url'))}")
    print(f"- ref: {manifest.get('ref', cfg('upstream_branch'))}")
    print(f"- mode: {manifest.get('mode', cfg('mode'))}")
    print(f"- source_dir: {preferred_source_repo_path()}")
    print(f"- active_source: {active_source or 'missing'}")
    print(f"- fallback_pool_dir: {cfg_path('pool_dir')}")
    print(f"- project_dir: {project_skills_root()}")
    print(f"- manifest: {cfg_path('manifest_file')}")
    print(f"- installs: {len(manifest.get('installs', []))}")
    print(f"- available in source: {len(available_skills())}")


def cmd_sync(args: argparse.Namespace):
    if not ensure_enabled():
        return
    cmd_pull(args)
    cmd_apply(args)
    cmd_check(args)


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
    ]:
        sp = sub.add_parser(name)
        if name in {"list", "search", "plan", "apply", "ensure", "check", "sync"}:
            sp.add_argument("--skills", help="CSV list of skill names")
            sp.add_argument("--runtime", dest="runtime", help="Target runtime/app")
            sp.add_argument("--app", dest="runtime", help="Alias for --runtime")
            sp.add_argument("--profile", help="Profile name used for selected installs")
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
