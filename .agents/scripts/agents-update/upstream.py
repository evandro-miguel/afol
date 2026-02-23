#!/usr/bin/env python3
"""
Upstream repository management for agentic system updates.
Handles git operations to fetch updates from upstream.
"""

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Tuple
import json
import os


@dataclass
class UpstreamInfo:
    """Information about upstream repository."""

    url: str
    commit: str
    tag: str
    version: str
    branch: str


class UpstreamError(Exception):
    """Error fetching or processing upstream."""

    pass


class UpstreamManager:
    """
    Manages interactions with upstream repository.
    Uses current git repository's main branch by default.
    """

    def __init__(
        self,
        agents_dir: Path,
        remote_url: Optional[str] = None,
        cache_dir: Optional[Path] = None,
    ):
        self.agents_dir = agents_dir
        self.remote_url = remote_url
        self.cache_dir = cache_dir or agents_dir / ".cache" / "upstream"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Find git root (repo root)
        self.repo_root = self._find_repo_root()

    def _find_repo_root(self) -> Optional[Path]:
        """Find the git repository root."""
        # Start from agents_dir and go up
        current = self.agents_dir.resolve()

        while current != current.parent:
            if (current / ".git").exists():
                return current
            current = current.parent

        # Also check CWD
        cwd = Path.cwd()
        if (cwd / ".git").exists():
            return cwd

        return None

    def _run_git(
        self, args: List[str], cwd: Optional[Path] = None, check: bool = True
    ) -> Tuple[int, str, str]:
        """Run git command and return result."""
        cmd = ["git"] + args

        # Use repo root as default cwd
        if cwd is None and self.repo_root:
            cwd = self.repo_root

        try:
            result = subprocess.run(
                cmd, cwd=cwd, capture_output=True, text=True, check=False
            )

            if check and result.returncode != 0:
                raise UpstreamError(
                    f"Git command failed: {' '.join(cmd)}\nstderr: {result.stderr}"
                )

            return result.returncode, result.stdout, result.stderr

        except FileNotFoundError:
            raise UpstreamError(
                "Git not found. Please install git and ensure it's in PATH."
            )

    def check_upstream(self) -> UpstreamInfo:
        """
        Check upstream for latest version from current repo's main branch.

        Returns:
            UpstreamInfo with version and commit info
        """
        if not self.repo_root:
            raise UpstreamError("Not in a git repository. Cannot determine upstream.")

        # Get current branch and latest commit
        _, branch, _ = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"])
        branch = branch.strip()

        # Get latest commit on main/master
        main_branch = self._get_main_branch()

        _, commit, _ = self._run_git(
            ["rev-parse", "--short", f"origin/{main_branch}"], check=False
        )
        if not commit.strip():
            # Try local branch
            _, commit, _ = self._run_git(["rev-parse", "--short", main_branch])
        commit = commit.strip()

        # Get remote URL
        _, remote_url, _ = self._run_git(["remote", "get-url", "origin"], check=False)
        remote_url = remote_url.strip() or str(self.repo_root)

        # Check for tags
        version = self._get_version_from_tags()

        if version:
            tag = f"v{version}"
        else:
            tag = main_branch
            version = f"0.0.0-{commit[:8]}"

        return UpstreamInfo(
            url=remote_url,
            commit=commit[:8],
            tag=tag,
            version=version,
            branch=main_branch,
        )

    def _get_main_branch(self) -> str:
        """Determine the main branch name (main or master)."""
        # Check if main exists
        _, _, _ = self._run_git(["fetch", "origin"], check=False)

        _, branches, _ = self._run_git(["branch", "-r"], check=False)
        branches = branches.strip()

        if "origin/main" in branches:
            return "main"
        elif "origin/master" in branches:
            return "master"
        elif "main" in branches:
            return "main"
        elif "master" in branches:
            return "master"

        # Default to main
        return "main"

    def _get_version_from_tags(self) -> Optional[str]:
        """Try to get version from latest tag."""
        _, stdout, _ = self._run_git(["describe", "--tags", "--abbrev=0"], check=False)

        if stdout.strip():
            tag = stdout.strip()
            if tag.startswith("v"):
                return tag[1:]
            return tag

        return None

    def fetch_upstream(self, ref: Optional[str] = None, force: bool = False) -> Path:
        """
        Get upstream from current repository.
        Since we're in the repo, just return the repo root.

        Args:
            ref: Git ref to checkout (tag, branch, commit)
            force: Force re-fetch even if exists

        Returns:
            Path to repository root
        """
        if not self.repo_root:
            raise UpstreamError("Not in a git repository")

        # Ensure we're on latest
        main_branch = self._get_main_branch()
        self._run_git(["fetch", "origin", main_branch], check=False)

        return self.repo_root

    def get_manifest(self, ref: Optional[str] = None) -> Optional[dict]:
        """
        Get manifest from upstream (current repo).

        Args:
            ref: Git ref to use (ignored for local repo)

        Returns:
            Manifest dict or None if not found
        """
        if not self.repo_root:
            return None

        manifest_path = self.repo_root / ".agents" / "manifest.json"

        if not manifest_path.exists():
            # Generate from structure
            return self._generate_manifest_from_repo(self.repo_root)

        with open(manifest_path, "r") as f:
            return json.load(f)

    def _generate_manifest_from_repo(self, repo_path: Path) -> dict:
        """Generate manifest from repository structure."""
        agents_path = repo_path / ".agents"

        if not agents_path.exists():
            raise UpstreamError(f"No .agents directory found in {repo_path}")

        # Get version from tag or default
        _, stdout, _ = self._run_git(
            ["describe", "--tags", "--always"], cwd=repo_path, check=False
        )
        version = stdout.strip().lstrip("v") or "0.0.0"

        # Get commit
        _, stdout, _ = self._run_git(["rev-parse", "--short", "HEAD"], cwd=repo_path)
        commit = stdout.strip()

        # Generate manifest using manifest.py
        from manifest import generate_manifest

        manifest = generate_manifest(
            agents_path,
            version=version,
            upstream_commit=commit,
            upstream_url=str(repo_path),
            upstream_tag=f"v{version}",
        )

        return manifest.to_dict()

    def validate_connection(self) -> bool:
        """Check if upstream is accessible (always true for local repo)."""
        return self.repo_root is not None


def get_installed_manifest(agents_dir: Path) -> Optional[dict]:
    """Get currently installed manifest."""
    manifest_path = agents_dir / "manifest.json"

    if not manifest_path.exists():
        return None

    with open(manifest_path, "r") as f:
        return json.load(f)


def get_installed_version(agents_dir: Path) -> str:
    """Get currently installed version."""
    manifest = get_installed_manifest(agents_dir)

    if manifest:
        return manifest.get("version", "0.0.0")

    # Fallback: check if .agents exists
    if (agents_dir / "scripts").exists():
        return "0.0.0-unknown"

    return "0.0.0-not-installed"


if __name__ == "__main__":
    import tempfile

    # Test upstream manager
    with tempfile.TemporaryDirectory() as tmpdir:
        agents_dir = Path(tmpdir) / ".agents"
        agents_dir.mkdir(parents=True, exist_ok=True)

        # Create a fake git repo
        import subprocess

        subprocess.run(["git", "init"], cwd=tmpdir, capture_output=True)

        upstream = UpstreamManager(agents_dir)

        print(f"Repo root: {upstream.repo_root}")

        if upstream.repo_root:
            try:
                info = upstream.check_upstream()
                print(f"\nUpstream info:")
                print(f"  Branch: {info.branch}")
                print(f"  Version: {info.version}")
                print(f"  Commit: {info.commit}")
            except UpstreamError as e:
                print(f"\nCould not check upstream: {e}")
