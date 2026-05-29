#!/usr/bin/env python3
"""Safely update scaffold-owned .agents files from a verified source payload."""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import json
import os
import re
import shlex
import shutil
import stat
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

from lib.agents_config import load_agents_config, resolve_scaffold_source_roots


ROOT_DIR, _CONFIG = load_agents_config(Path(__file__).resolve().parent)
TARGET_AGENTS_DIR = ROOT_DIR / ".agents"
STAGING_ROOT = TARGET_AGENTS_DIR / "tmp" / "scaffold-update" / "staging"
BACKUP_ROOT = TARGET_AGENTS_DIR / "tmp" / "scaffold-update" / "backups"

# Scope intentionally narrow to scaffold-owned .agents surfaces.
ALLOWLIST_EXACT = {
    Path("agents"),
    Path("agents-mcp"),
    Path("lock.json"),
    Path("manifest.json"),
    Path("agents.config"),
    Path("skills-sync.manifest.json"),
    Path("tools.json"),
}
ALLOWLIST_PREFIXES = (
    Path("scripts"),
    Path("rules"),
    Path("skills"),
    Path("runtime"),
    Path("data/telemetry/schemas"),
)
IGNORED_PAYLOAD_NAMES = {
    "tmp",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    ".structure-cache.json",
    "events.jsonl",
    "settings.local.json",
    "source",
}
OWNERSHIP_CATEGORIES = ("managed", "project-owned", "generated", "ignored", "conflict")
BASELINE_HASH_KEYS = ("managed_hashes", "managedHashes", "managed_files", "managedFiles")


@dataclass(frozen=True)
class OwnershipEntry:
    category: str
    patterns: set[Path]


@dataclass(frozen=True)
class OwnershipCatalog:
    entries: tuple[OwnershipEntry, ...]

    @classmethod
    def from_manifest(cls, payload: dict[str, object], *, source_label: str) -> "OwnershipCatalog":
        raw = payload.get("ownership")
        if raw is None:
            return cls(entries=tuple())
        if not isinstance(raw, dict):
            raise RuntimeError(f"Invalid manifest ownership section in {source_label}: expected object")

        entries: list[OwnershipEntry] = []
        for category in OWNERSHIP_CATEGORIES:
            patterns = _normalize_path_set(raw.get(category))
            if patterns:
                entries.append(OwnershipEntry(category=category, patterns=patterns))
        return cls(entries=tuple(entries))

    def category_for(self, rel_path: Path) -> str:
        rel = rel_path.as_posix()
        for entry in self.entries:
            for pattern in entry.patterns:
                normalized = pattern.as_posix()
                if rel == normalized or rel.startswith(f"{normalized}/"):
                    return entry.category
        return "managed"


@dataclass(frozen=True)
class FileChange:
    rel_path: Path
    source_file: Path
    target_file: Path
    action: str
    ownership: str
    reason: str = ""


@dataclass(frozen=True)
class ChannelMetadata:
    channel: str
    release_tag: str
    commit: str
    source_sha256: str
    scaffold_payload_sha256: str
    release_manifest_sha256: str
    skill_bom_sha256: str
    metadata_file: Path


def _timestamp_slug() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _normalize_path_set(raw: object) -> set[Path]:
    if not isinstance(raw, list):
        return set()
    entries: set[Path] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        normalized = item.strip().strip("/").replace("\\", "/")
        if not normalized:
            continue
        entries.add(Path(normalized))
    return entries


def _normalize_hash_map(raw: object) -> dict[Path, str]:
    if not isinstance(raw, dict):
        return {}
    entries: dict[Path, str] = {}
    for raw_path, raw_hash in raw.items():
        if not isinstance(raw_path, str) or not isinstance(raw_hash, str):
            continue
        normalized_path = raw_path.strip().strip("/").replace("\\", "/")
        if not normalized_path:
            continue
        rel_path = Path(normalized_path)
        if rel_path.is_absolute() or ".." in rel_path.parts:
            continue
        normalized_hash = raw_hash.strip().lower()
        if not re.fullmatch(r"[a-f0-9]{64}", normalized_hash):
            continue
        entries[rel_path] = normalized_hash
    return entries


def _load_json_object(path: Path, *, label: str) -> dict[str, object]:
    if not path.exists():
        raise RuntimeError(f"Missing {label}: {path}")
    if path.is_dir():
        raise RuntimeError(f"Invalid {label}: expected file, found directory {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse {label}: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"Invalid {label}: expected object in {path}")
    return payload


def _load_lock_file(path: Path, *, label: str) -> dict[str, object]:
    payload = _load_json_object(path, label=label)
    schema_version = payload.get("schema_version")
    if not isinstance(schema_version, int):
        raise RuntimeError(f"Invalid lock schema in {label}: schema_version must be int")
    revision = payload.get("revision")
    if not isinstance(revision, str) or not revision.strip():
        raise RuntimeError(f"Invalid lock schema in {label}: revision must be non-empty string")
    return payload


def _load_manifest_file(path: Path, *, label: str, required: bool = False) -> OwnershipCatalog:
    if not path.exists():
        if required:
            raise RuntimeError(f"Missing {label}: {path}")
        return OwnershipCatalog(entries=())

    payload = _load_json_object(path, label=label)
    return OwnershipCatalog.from_manifest(payload, source_label=label)


def _is_within(base: Path, candidate: Path) -> bool:
    try:
        candidate.resolve(strict=False).relative_to(base.resolve(strict=False))
    except ValueError:
        return False
    return True


def _assert_within(base: Path, candidate: Path, label: str):
    if not _is_within(base, candidate):
        raise RuntimeError(f"{label} must stay within {base}: {candidate}")


def _is_allowed(rel_path: Path) -> bool:
    if rel_path in ALLOWLIST_EXACT:
        return True
    return any(prefix == rel_path or prefix in rel_path.parents for prefix in ALLOWLIST_PREFIXES)


def _classify_ownership(rel_path: Path, catalog: OwnershipCatalog | None) -> str:
    if catalog is None:
        return "managed"
    if rel_path == Path("."):
        return "managed"
    return catalog.category_for(rel_path)


def _extract_baseline_hashes(payload: dict[str, object]) -> dict[Path, str]:
    baseline: dict[Path, str] = {}
    for key in BASELINE_HASH_KEYS:
        baseline.update(_normalize_hash_map(payload.get(key)))
    return baseline


def _load_local_baseline_hashes() -> dict[Path, str]:
    baseline: dict[Path, str] = {}
    for rel_path, label in (
        (Path("lock.json"), "target .agents/lock.json"),
        (Path("manifest.json"), "target .agents/manifest.json"),
    ):
        path = TARGET_AGENTS_DIR / rel_path
        if not path.exists():
            continue
        try:
            payload = _load_json_object(path, label=label)
        except RuntimeError:
            # Conservative fallback: missing/unreadable baseline means no safe overwrite.
            continue
        baseline.update(_extract_baseline_hashes(payload))
    return baseline


def _classify_managed_action(
    rel_path: Path,
    source_file: Path,
    target_file: Path,
    local_baseline_hashes: dict[Path, str],
) -> tuple[str, str]:
    if not target_file.exists():
        return "create", "managed file missing in target"

    source_hash = _sha256_file(source_file)
    target_hash = _sha256_file(target_file)
    if source_hash == target_hash:
        return "unchanged", "source and target identical"
    if rel_path in {Path("lock.json"), Path("manifest.json")}:
        return "update", "managed metadata file update"

    expected_hash = local_baseline_hashes.get(rel_path)
    if expected_hash is None:
        return "local-edit", "missing local baseline hash for managed file"
    if target_hash != expected_hash:
        return "local-edit", "target hash diverged from local managed baseline"
    return "update", "managed file matches local baseline and can be updated"


def _classify_conflict_action(source_file: Path, target_file: Path) -> tuple[str, str]:
    if not target_file.exists():
        return "create", "conflict-owned file missing in target"
    if _sha256_file(source_file) == _sha256_file(target_file):
        return "unchanged", "conflict-owned file unchanged"
    return "conflict", "conflict-owned file diverged and requires manual resolution"


def _classify_action(
    rel_path: Path,
    ownership: str,
    source_file: Path,
    target_file: Path,
    local_baseline_hashes: dict[Path, str],
) -> tuple[str, str]:
    if ownership == "managed":
        return _classify_managed_action(rel_path, source_file, target_file, local_baseline_hashes)

    if ownership == "project-owned":
        return "preserve-project-owned", "manifest ownership=project-owned"

    if ownership == "generated":
        return "skip-generated", "manifest ownership=generated"

    if ownership == "ignored":
        return "skip-ignored", "manifest ownership=ignored"

    if ownership == "conflict":
        return _classify_conflict_action(source_file, target_file)

    return "preserve-project-owned", "unknown ownership category treated as project-owned"


def _validate_rel_path(rel_path: Path):
    raw = rel_path.as_posix()
    if not raw or raw == ".":
        raise RuntimeError("Invalid payload path: empty relative path")
    if rel_path.is_absolute() or raw.startswith("/"):
        raise RuntimeError(f"Invalid payload path '{raw}': absolute paths are not allowed")
    if ".." in rel_path.parts:
        raise RuntimeError(f"Invalid payload path '{raw}': path traversal is not allowed")
    if not _is_allowed(rel_path):
        raise RuntimeError(f"Payload path is outside scaffold allowlist: {raw}")


def _reject_symlink_or_hardlink(path: Path, *, label: str):
    if path.is_symlink():
        raise RuntimeError(f"Invalid {label}: symlink is not allowed: {path}")
    if not path.exists():
        return
    st = path.stat(follow_symlinks=False)
    if stat.S_ISREG(st.st_mode) and st.st_nlink > 1:
        raise RuntimeError(f"Invalid {label}: hardlink is not allowed: {path}")


def _collect_payload_files(source_agents_dir: Path) -> List[Path]:
    if source_agents_dir.is_symlink():
        raise RuntimeError(f"Invalid source: symlink is not allowed: {source_agents_dir}")
    if not source_agents_dir.exists() or not source_agents_dir.is_dir():
        raise RuntimeError(f"Source .agents directory not found: {source_agents_dir}")

    files: list[Path] = []
    for current, dir_names, file_names in os.walk(source_agents_dir, followlinks=False):
        current_path = Path(current)

        dir_names[:] = [name for name in dir_names if name not in IGNORED_PAYLOAD_NAMES]

        for dir_name in list(dir_names):
            dir_path = current_path / dir_name
            if dir_path.is_symlink():
                raise RuntimeError(f"Invalid source payload: symlink is not allowed: {dir_path}")

        for file_name in sorted(file_names):
            if file_name in IGNORED_PAYLOAD_NAMES:
                continue
            file_path = current_path / file_name
            _reject_symlink_or_hardlink(file_path, label="source payload")
            rel_path = file_path.relative_to(source_agents_dir)
            _validate_rel_path(rel_path)
            files.append(rel_path)

    if not files:
        raise RuntimeError(f"Source payload has no allowlisted files: {source_agents_dir}")
    return sorted(files)


def _reject_target_symlink_ancestors(target_file: Path):
    current = target_file.parent
    while current != TARGET_AGENTS_DIR.parent:
        if current.exists() and current.is_symlink():
            raise RuntimeError(f"Target path uses symlinked ancestor and is unsafe: {current}")
        if current == TARGET_AGENTS_DIR:
            break
        current = current.parent


def _validate_target_entry(target_file: Path):
    _reject_target_symlink_ancestors(target_file)
    if not target_file.exists() and not target_file.is_symlink():
        return
    _reject_symlink_or_hardlink(target_file, label="target payload")


def _plan_changes(
    source_agents_dir: Path,
    rel_paths: Iterable[Path],
    ownership_catalog: OwnershipCatalog,
    local_baseline_hashes: dict[Path, str],
) -> List[FileChange]:
    plan: list[FileChange] = []
    for rel_path in rel_paths:
        source_file = source_agents_dir / rel_path
        target_file = TARGET_AGENTS_DIR / rel_path
        _assert_within(TARGET_AGENTS_DIR, target_file, "Target update path")
        _validate_target_entry(target_file)
        ownership = _classify_ownership(rel_path, ownership_catalog)
        action, reason = _classify_action(
            rel_path,
            ownership,
            source_file,
            target_file,
            local_baseline_hashes,
        )

        plan.append(
            FileChange(
                rel_path=rel_path,
                source_file=source_file,
                target_file=target_file,
                action=action,
                ownership=ownership,
                reason=reason,
            )
        )
    return plan


def _print_plan(plan: List[FileChange]):
    creates = [item for item in plan if item.action == "create"]
    updates = [item for item in plan if item.action == "update"]
    unchanged = [item for item in plan if item.action == "unchanged"]
    preserved_project = [item for item in plan if item.action == "preserve-project-owned"]
    preserved_generated = [item for item in plan if item.action == "skip-generated"]
    preserved_ignored = [item for item in plan if item.action == "skip-ignored"]
    local_edits = [item for item in plan if item.action == "local-edit"]
    conflicts = [item for item in plan if item.action == "conflict"]
    blocking = conflicts + local_edits

    print("SCAFFOLD UPDATE PLAN")
    print(f"- target: {TARGET_AGENTS_DIR}")
    print(f"- create: {len(creates)}")
    print(f"- update: {len(updates)}")
    print(f"- unchanged: {len(unchanged)}")
    print(f"- preserved-project-owned: {len(preserved_project)}")
    print(f"- preserved-generated: {len(preserved_generated)}")
    print(f"- preserved-ignored: {len(preserved_ignored)}")
    print(f"- conflict: {len(blocking)}")
    print(f"- local-edit: {len(local_edits)}")

    for item in creates + updates:
        print(f"  - {item.action}: .agents/{item.rel_path.as_posix()}")

    for item in preserved_project:
        print(f"  - preserve-project-owned: .agents/{item.rel_path.as_posix()}")

    for item in preserved_generated:
        print(f"  - preserve-generated: .agents/{item.rel_path.as_posix()}")

    for item in preserved_ignored:
        print(f"  - preserve-ignored: .agents/{item.rel_path.as_posix()}")

    for item in conflicts:
        print(f"  - conflict: .agents/{item.rel_path.as_posix()}")
    for item in local_edits:
        print(f"  - local-edit: .agents/{item.rel_path.as_posix()} ({item.reason})")


def _build_plan_summary(plan: List[FileChange], *, mode: str) -> dict[str, object]:
    counts: dict[str, int] = {}
    for item in plan:
        counts[item.action] = counts.get(item.action, 0) + 1

    blocking = [item for item in plan if item.action in {"conflict", "local-edit"}]
    return {
        "mode": mode,
        "status": "conflict" if blocking else "ok",
        "counts": counts,
        "blocking_actions": ["conflict", "local-edit"],
        "conflicts": [
            {
                "path": item.rel_path.as_posix(),
                "action": item.action,
                "ownership": item.ownership,
                "reason": item.reason,
            }
            for item in blocking
        ],
    }


def _emit_plan_summary(plan: List[FileChange], *, mode: str) -> dict[str, object]:
    payload = _build_plan_summary(plan, mode=mode)
    print(f"PLAN_JSON: {json.dumps(payload, sort_keys=True)}")
    return payload


def _as_text_lines(path: Path) -> list[str] | None:
    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return text.splitlines(keepends=True)


def _print_diff(plan: List[FileChange]):
    changes = [item for item in plan if item.action in {"create", "update"}]
    if not changes:
        print("No scaffold changes detected.")
        return

    for item in changes:
        before_lines = []
        if item.target_file.exists():
            before_lines = _as_text_lines(item.target_file)
        after_lines = _as_text_lines(item.source_file)

        label = item.rel_path.as_posix()
        if before_lines is None or after_lines is None:
            print(f"BINARY DIFF: .agents/{label}")
            continue

        diff = difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=f"a/.agents/{label}",
            tofile=f"b/.agents/{label}",
        )
        print("".join(diff).rstrip() or f"UNCHANGED: .agents/{label}")


def _stage_changes(plan: List[FileChange], staging_run: Path) -> Path:
    staged_agents = staging_run / ".agents"
    for item in plan:
        if item.action not in {"create", "update"}:
            continue
        staged_file = staged_agents / item.rel_path
        staged_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item.source_file, staged_file)
    return staged_agents


def _create_backup(plan: List[FileChange], backup_dir: Path):
    for item in plan:
        if item.action != "update":
            continue
        backup_file = backup_dir / item.rel_path
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item.target_file, backup_file)


def _promote(staged_agents: Path, plan: List[FileChange]) -> list[FileChange]:
    touched: list[FileChange] = []
    for item in plan:
        if item.action not in {"create", "update"}:
            continue
        src = staged_agents / item.rel_path
        dst = item.target_file
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.parent / f".{dst.name}.scaffold-update-{uuid.uuid4().hex[:8]}.tmp"
        shutil.copy2(src, tmp)
        os.replace(tmp, dst)
        touched.append(item)
    return touched


def _validate_result(touched: List[FileChange], staged_agents: Path, validate_command: str | None):
    for item in touched:
        target_file = item.target_file
        _validate_target_entry(target_file)
        if target_file.read_bytes() != (staged_agents / item.rel_path).read_bytes():
            raise RuntimeError(f"Validation failed: content mismatch after promotion: {target_file}")

    if not validate_command:
        return

    proc = subprocess.run(shlex.split(validate_command), cwd=ROOT_DIR, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"Validation command failed with exit code {proc.returncode}: {validate_command}")


def _rollback(touched: List[FileChange], backup_dir: Path):
    for item in reversed(touched):
        if item.action == "create":
            if item.target_file.exists() or item.target_file.is_symlink():
                if item.target_file.is_dir():
                    shutil.rmtree(item.target_file)
                else:
                    item.target_file.unlink()
            continue

        if item.action == "update":
            backup_file = backup_dir / item.rel_path
            if not backup_file.exists():
                raise RuntimeError(f"Rollback backup missing for {item.rel_path.as_posix()}")
            dst = item.target_file
            dst.parent.mkdir(parents=True, exist_ok=True)
            tmp = dst.parent / f".{dst.name}.rollback-{uuid.uuid4().hex[:8]}.tmp"
            shutil.copy2(backup_file, tmp)
            os.replace(tmp, dst)


def _payload_sha256(source_agents_dir: Path, rel_paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for rel_path in sorted(rel_paths):
        file_path = source_agents_dir / rel_path
        digest.update(rel_path.as_posix().encode("utf-8"))
        digest.update(b"\0")
        with file_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\n")
    return digest.hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_existing_file(path: Path, label: str) -> Path:
    if path.is_symlink():
        raise RuntimeError(f"Invalid {label}: symlink is not allowed: {path}")
    if not path.exists() or not path.is_file():
        raise RuntimeError(f"Missing {label}: {path}")
    _reject_symlink_or_hardlink(path, label=label)
    return path


def _verify_release_artifacts(source_repo_root: Path, metadata: ChannelMetadata):
    release_tag = metadata.release_tag
    manifest_file = _require_existing_file(
        source_repo_root / "releases" / "manifests" / f"{release_tag}.json",
        "release manifest",
    )
    bom_file = _require_existing_file(
        source_repo_root / "releases" / "boms" / f"{release_tag}.skill-bom.json",
        "skill BOM",
    )
    checksum_file = _require_existing_file(
        source_repo_root / "releases" / "checksums" / f"{release_tag}.sha256",
        "source checksum",
    )

    if _sha256_file(manifest_file) != metadata.release_manifest_sha256:
        raise RuntimeError(f"Release manifest hash mismatch: {manifest_file}")
    if _sha256_file(bom_file) != metadata.skill_bom_sha256:
        raise RuntimeError(f"Skill BOM hash mismatch: {bom_file}")

    checksum_body = checksum_file.read_text(encoding="utf-8")
    if metadata.source_sha256 not in checksum_body:
        raise RuntimeError(f"Source checksum file does not contain expected hash: {checksum_file}")


def _verify_git_commit_when_available(source_repo_root: Path, metadata: ChannelMetadata):
    if not (source_repo_root / ".git").exists():
        return
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=source_repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Could not verify source git commit for {source_repo_root}: {proc.stderr.strip()}")
    actual = proc.stdout.strip().lower()
    if actual != metadata.commit:
        raise RuntimeError(f"Source git commit mismatch: expected {metadata.commit}, got {actual}")

    tag_proc = subprocess.run(
        ["git", "tag", "-v", metadata.release_tag],
        cwd=source_repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if tag_proc.returncode != 0:
        details = (tag_proc.stderr or tag_proc.stdout).strip()
        raise RuntimeError(f"Could not verify signed release tag {metadata.release_tag}: {details}")


def _require_match(value: str, pattern: str, label: str, metadata_file: Path) -> str:
    if not re.fullmatch(pattern, value, flags=re.IGNORECASE):
        raise RuntimeError(f"Invalid {label} in {metadata_file}: {value}")
    return value.lower()


def _validate_channel_policy(policy: object, channel: str, channel_file: Path):
    if not isinstance(policy, dict):
        raise RuntimeError(f"Release channel '{channel}' missing policy in {channel_file}")
    if policy.get("requireSignedTag") is not True:
        raise RuntimeError(f"Release channel '{channel}' must require signed tags")
    if policy.get("requireSourceChecksum") is not True:
        raise RuntimeError(f"Release channel '{channel}' must require source checksum")
    if policy.get("requireReleaseManifest") is not True:
        raise RuntimeError(f"Release channel '{channel}' must require release manifest")
    if policy.get("requireSkillBom") is not True:
        raise RuntimeError(f"Release channel '{channel}' must require skill BOM")
    if policy.get("allowFloatingRef") is not False:
        raise RuntimeError(f"Release channel '{channel}' must disable floating refs")


def _load_channel_metadata(source_repo_root: Path, channel: str) -> ChannelMetadata:
    if channel != "stable":
        raise RuntimeError(f"Unsupported channel '{channel}'. Only 'stable' is accepted.")

    channel_file = source_repo_root / "releases" / "channels" / f"{channel}.json"
    if not channel_file.exists():
        raise RuntimeError(
            "Verified channel metadata is required for scaffold-update. "
            f"Expected: {channel_file}"
        )

    try:
        payload = json.loads(channel_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse release channel file {channel_file}: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"Release channel file must be an object: {channel_file}")
    if payload.get("channel") != channel:
        raise RuntimeError(f"Release channel mismatch in {channel_file}")

    _validate_channel_policy(payload.get("policy"), channel, channel_file)

    release_tag = str(payload.get("releaseTag", "")).strip()
    _require_match(release_tag, r"v?\d+\.\d+\.\d+", "releaseTag", channel_file)

    commit = _require_match(str(payload.get("commit", "")).strip(), r"[a-f0-9]{40}", "commit", channel_file)
    source_sha256 = _require_match(
        str(payload.get("sourceSha256", "")).strip(),
        r"[a-f0-9]{64}",
        "sourceSha256",
        channel_file,
    )
    scaffold_payload_sha256 = str(payload.get("scaffoldPayloadSha256", "")).strip().lower()
    if scaffold_payload_sha256:
        scaffold_payload_sha256 = _require_match(
            scaffold_payload_sha256,
            r"[a-f0-9]{64}",
            "scaffoldPayloadSha256",
            channel_file,
        )
    else:
        scaffold_payload_sha256 = source_sha256
    release_manifest_sha256 = _require_match(
        str(payload.get("releaseManifestSha256", "")).strip(),
        r"[a-f0-9]{64}",
        "releaseManifestSha256",
        channel_file,
    )
    skill_bom_sha256 = _require_match(
        str(payload.get("skillBomSha256", "")).strip(),
        r"[a-f0-9]{64}",
        "skillBomSha256",
        channel_file,
    )

    return ChannelMetadata(
        channel=channel,
        release_tag=release_tag,
        commit=commit,
        source_sha256=source_sha256,
        scaffold_payload_sha256=scaffold_payload_sha256,
        release_manifest_sha256=release_manifest_sha256,
        skill_bom_sha256=skill_bom_sha256,
        metadata_file=channel_file,
    )


def _write_manifest(
    backup_dir: Path,
    metadata: ChannelMetadata,
    source_root: Path,
    plan: List[FileChange],
    touched: List[FileChange],
    plan_summary: dict[str, object],
    payload_sha256: str,
    source_lock: dict[str, object],
    source_manifest: Path,
):
    payload = {
        "timestamp": _timestamp_slug(),
        "channel": metadata.channel,
        "releaseTag": metadata.release_tag,
        "commit": metadata.commit,
        "sourceLockRevision": source_lock.get("revision"),
        "sourceManifest": str(source_manifest),
        "sourceSha256": metadata.source_sha256,
        "scaffoldPayloadSha256": metadata.scaffold_payload_sha256,
        "releaseManifestSha256": metadata.release_manifest_sha256,
        "skillBomSha256": metadata.skill_bom_sha256,
        "verifiedPayloadSha256": payload_sha256,
        "metadataFile": str(metadata.metadata_file),
        "source": str(source_root),
        "status": plan_summary.get("status"),
        "planSummary": plan_summary,
        "planned_files": [
            {
                "path": item.rel_path.as_posix(),
                "action": item.action,
                "ownership": item.ownership,
                "reason": item.reason,
            }
            for item in plan
        ],
        "touched_files": [
            {"path": item.rel_path.as_posix(), "action": item.action}
            for item in touched
        ],
    }
    manifest_path = backup_dir / "update-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Secure scaffold update for .agents")
    parser.add_argument("--channel", default="stable", help="Release channel to apply (stable)")
    parser.add_argument("--source", required=True, help="Source repo root or direct .agents directory")
    parser.add_argument("--plan-only", action="store_true", help="Show update plan and exit")
    parser.add_argument("--diff-only", action="store_true", help="Show diff and exit")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default is preview-only)")
    parser.add_argument(
        "--validate-command",
        help="Optional command to run after promotion; non-zero exit triggers rollback",
    )
    parser.add_argument(
        "--skip-validate",
        action="store_true",
        help="Skip optional external validation command; built-in content checks still run",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.plan_only and args.diff_only:
        raise RuntimeError("Use only one of --plan-only or --diff-only")
    if args.apply and args.diff_only:
        raise RuntimeError("Use either --apply or --diff-only, not both")

    source_repo_root, source_agents_dir = resolve_scaffold_source_roots(Path(args.source))
    metadata = _load_channel_metadata(source_repo_root, str(args.channel).strip())
    _verify_release_artifacts(source_repo_root, metadata)
    _verify_git_commit_when_available(source_repo_root, metadata)

    rel_paths = _collect_payload_files(source_agents_dir)
    payload_sha256 = _payload_sha256(source_agents_dir, rel_paths)
    if payload_sha256.lower() != metadata.scaffold_payload_sha256.lower():
        raise RuntimeError(
            "Payload checksum does not match stable channel metadata "
            f"({metadata.metadata_file}): expected {metadata.scaffold_payload_sha256}, got {payload_sha256}"
        )

    source_lock = _load_lock_file(source_agents_dir / "lock.json", label="source .agents/lock.json")
    source_manifest = _load_manifest_file(
        source_agents_dir / "manifest.json",
        label="source .agents/manifest.json",
        required=True,
    )
    local_baseline_hashes = _load_local_baseline_hashes()

    plan = _plan_changes(source_agents_dir, rel_paths, source_manifest, local_baseline_hashes)
    _print_plan(plan)
    mode = "apply" if args.apply else "diff" if args.diff_only else "plan" if args.plan_only else "preview"
    plan_summary = _emit_plan_summary(plan, mode=mode)

    if args.diff_only:
        _print_diff(plan)
        return 0

    if args.plan_only or not args.apply:
        if not args.plan_only:
            print("Preview mode only. Re-run with --apply to mutate files.")
        return 0

    blocking = [item for item in plan if item.action in {"conflict", "local-edit"}]
    if blocking:
        print("ERROR: conflicts detected in update plan; apply aborted.")
        return 1

    changes = [item for item in plan if item.action in {"create", "update"}]
    if not changes:
        print("No scaffold changes to apply.")
        return 0

    stamp = _timestamp_slug()
    staging_run = STAGING_ROOT / f"{stamp}-{uuid.uuid4().hex[:8]}"
    backup_dir = BACKUP_ROOT / stamp
    staging_run.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)

    staged_agents = _stage_changes(changes, staging_run)
    _create_backup(changes, backup_dir)

    touched: list[FileChange] = []
    try:
        touched = _promote(staged_agents, changes)
        _validate_result(touched, staged_agents, None if args.skip_validate else args.validate_command)
    except Exception as exc:
        rollback_error: Exception | None = None
        try:
            _rollback(touched, backup_dir)
        except Exception as rb_exc:  # pragma: no cover - defensive
            rollback_error = rb_exc
        shutil.rmtree(staging_run, ignore_errors=True)
        if rollback_error is not None:
            print(
                f"ERROR: promotion failed; rollback also failed: {rollback_error}. Original error: {exc}",
                file=sys.stderr,
            )
        else:
            print(f"ERROR: promotion failed and rollback completed: {exc}", file=sys.stderr)
        return 1

    _write_manifest(
        backup_dir,
        metadata,
        source_repo_root,
        plan,
        touched,
        plan_summary,
        payload_sha256,
        source_lock,
        source_agents_dir,
    )
    shutil.rmtree(staging_run, ignore_errors=True)

    print("OK: scaffold update applied")
    print(f"- channel: {metadata.channel}")
    print(f"- source: {source_agents_dir}")
    print(f"- payload sha256: {payload_sha256}")
    print(f"- backup: {backup_dir}")
    print(f"- changed files: {len(changes)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
