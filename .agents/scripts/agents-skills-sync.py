#!/usr/bin/env python3
"""Sync project skills from universal-skills repository without altering skills internal layout."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from lib.agents_config import load_agents_config, resolve_repo_path

ROOT_DIR, CONFIG = load_agents_config(Path(__file__).resolve().parent)
SKILLS_CFG = CONFIG.get("skills_sync", {})

DEFAULTS = {
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
}

FORBIDDEN_SKILLS_DIRS = {"_pool", ".pool", "_cache", ".cache"}


def cfg(key: str):
    return SKILLS_CFG.get(key, DEFAULTS[key])


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


def ensure_enabled() -> bool:
    enabled = bool(cfg("enabled"))
    if not enabled:
        print("SKIPPED: skills_sync.enabled=false")
        return False
    return True


def load_manifest() -> Dict:
    manifest_path = cfg_path("manifest_file")
    default_selected = list(cfg("default_skills") or [])
    if not manifest_path.exists():
        return {
            "version": 1,
            "selected_skills": default_selected,
            "mode": cfg("mode"),
            "upstream_branch": cfg("upstream_branch"),
        }
    data = json.loads(manifest_path.read_text())
    if not data.get("selected_skills"):
        data["selected_skills"] = default_selected
    return data


def save_manifest(manifest: Dict):
    manifest_path = cfg_path("manifest_file")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")


def upstream_skills_root() -> Path:
    return cfg_path("pool_dir") / str(cfg("upstream_skills_dir"))


def project_skills_root() -> Path:
    return cfg_path("project_dir")


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


def skill_digest(skill_dir: Path) -> str:
    files = sorted([p for p in skill_dir.rglob("*") if p.is_file()])
    h = hashlib.sha256()
    for f in files:
        rel = f.relative_to(skill_dir).as_posix().encode()
        h.update(rel + b"\0" + f.read_bytes() + b"\n")
    return h.hexdigest()


def available_skills() -> List[str]:
    root = upstream_skills_root()
    if not root.exists():
        return []
    return sorted(
        [
            d.name
            for d in root.iterdir()
            if d.is_dir() and (d / "SKILL.md").exists()
        ]
    )


def selected_skills(cli_skills: List[str]) -> List[str]:
    if cli_skills:
        return sorted(set(cli_skills))
    manifest = load_manifest()
    return sorted(set(manifest.get("selected_skills", [])))


def ensure_repo_cloned():
    pool = cfg_path("pool_dir")
    url = str(cfg("upstream_repo_url")).strip()
    branch = str(cfg("upstream_branch")).strip()

    if not url:
        raise RuntimeError("skills_sync.upstream_repo_url is required")

    if (pool / ".git").exists():
        return

    pool.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--branch", branch, url, str(pool)], cwd=ROOT_DIR)


def cmd_init(args: argparse.Namespace):
    if not ensure_enabled():
        return
    ensure_repo_cloned()
    root = project_skills_root()
    root.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()
    save_manifest(manifest)
    print(f"OK: initialized skills sync\n- pool: {cfg_path('pool_dir')}\n- project: {root}")


def cmd_pull(args: argparse.Namespace):
    if not ensure_enabled():
        return
    ensure_repo_cloned()
    pool = cfg_path("pool_dir")
    branch = str(cfg("upstream_branch"))
    run(["git", "fetch", "origin"], cwd=pool)
    run(["git", "checkout", branch], cwd=pool)
    run(["git", "pull", "--ff-only", "origin", branch], cwd=pool)
    print(f"OK: updated pool at {pool}")


def _compare(skills: Iterable[str]) -> Tuple[List[str], List[str], List[str]]:
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

        if cfg("mode") == "link" and dst.is_symlink():
            continue

        if skill_digest(src) != skill_digest(dst):
            drift.append(name)

    return missing_source, missing_project, drift


def cmd_plan(args: argparse.Namespace):
    if not ensure_enabled():
        return
    skills = selected_skills(parse_csv(args.skills))
    if not skills:
        print("No selected skills. Provide --skills or configure manifest.")
        return

    missing_source, missing_project, drift = _compare(skills)

    print("PLAN")
    print(f"- selected: {len(skills)}")
    print(f"- missing in source: {missing_source or 'none'}")
    print(f"- missing in project: {missing_project or 'none'}")
    print(f"- drift: {drift or 'none'}")


def apply_skill(name: str):
    src = upstream_skills_root() / name
    dst = project_skills_root() / name

    if not (src / "SKILL.md").exists():
        raise RuntimeError(f"Source skill missing SKILL.md: {src}")

    mode = str(cfg("mode"))
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


def cmd_apply(args: argparse.Namespace):
    if not ensure_enabled():
        return
    skills = selected_skills(parse_csv(args.skills))
    if not skills:
        raise RuntimeError("No selected skills. Provide --skills or update manifest.")

    problems = validate_project_structure()
    if problems:
        raise RuntimeError("; ".join(problems))

    for name in skills:
        apply_skill(name)
        print(f"APPLIED: {name}")

    manifest = load_manifest()
    manifest["selected_skills"] = sorted(set(skills))
    manifest["mode"] = cfg("mode")
    save_manifest(manifest)
    print("OK: apply completed")


def cmd_check(args: argparse.Namespace):
    if not ensure_enabled():
        return

    required = bool(cfg("required"))
    if not upstream_skills_root().exists():
        msg = f"skills pool not initialized: {upstream_skills_root()}"
        if required:
            print(f"ERROR: {msg}")
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    problems = validate_project_structure()
    for p in problems:
        print(f"ERROR: {p}")

    skills = selected_skills(parse_csv(args.skills))
    if not skills:
        msg = "No selected skills in manifest or --skills"
        if required:
            print(f"ERROR: {msg}")
            raise RuntimeError(msg)
        print(f"WARN: {msg}")
        return

    missing_source, missing_project, drift = _compare(skills)

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
    print("SKILLS SYNC STATUS")
    print(f"- enabled: {cfg('enabled')}")
    print(f"- required: {cfg('required')}")
    print(f"- upstream: {cfg('upstream_repo_url')}")
    print(f"- branch: {cfg('upstream_branch')}")
    print(f"- pool_dir: {cfg_path('pool_dir')}")
    print(f"- project_dir: {project_skills_root()}")
    print(f"- mode: {cfg('mode')}")
    print(f"- manifest: {cfg_path('manifest_file')}")
    print(f"- selected: {manifest.get('selected_skills', [])}")
    print(f"- available in pool: {len(available_skills())}")


def cmd_sync(args: argparse.Namespace):
    if not ensure_enabled():
        return
    cmd_pull(args)
    cmd_apply(args)
    cmd_check(args)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Sync project skills from universal-skills")
    sub = p.add_subparsers(dest="command", required=True)

    for name, fn in [
        ("init", cmd_init),
        ("pull", cmd_pull),
        ("status", cmd_status),
        ("plan", cmd_plan),
        ("apply", cmd_apply),
        ("check", cmd_check),
        ("sync", cmd_sync),
    ]:
        sp = sub.add_parser(name)
        if name in {"plan", "apply", "check", "sync"}:
            sp.add_argument("--skills", help="CSV list of skill names")
        sp.set_defaults(func=fn)

    return p


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
