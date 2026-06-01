# -*- coding: utf-8 -*-
"""
Global fixtures for the `.agents/scripts` test suite.

This file provides shared helpers for unit and integration coverage and keeps
temporary writes outside the canonical repository checkout.
"""

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
_ORIGINAL_TEMPORARY_DIRECTORY = tempfile.TemporaryDirectory
_ORIGINAL_MKDTEMP = tempfile.mkdtemp


def _redirect_repo_local_temp_dir(raw_dir):
    """Avoid temp writes inside the repo during tests."""
    if raw_dir is None:
        return None

    try:
        candidate = Path(raw_dir).expanduser().resolve()
    except OSError:
        return raw_dir

    if candidate == REPO_ROOT or REPO_ROOT in candidate.parents:
        return None
    return raw_dir


def _repo_safe_temporary_directory(*args, **kwargs):
    if "dir" in kwargs:
        kwargs["dir"] = _redirect_repo_local_temp_dir(kwargs["dir"])
    return _ORIGINAL_TEMPORARY_DIRECTORY(*args, **kwargs)


def _repo_safe_mkdtemp(*args, **kwargs):
    if "dir" in kwargs:
        kwargs["dir"] = _redirect_repo_local_temp_dir(kwargs["dir"])
    return _ORIGINAL_MKDTEMP(*args, **kwargs)


tempfile.TemporaryDirectory = _repo_safe_temporary_directory
tempfile.mkdtemp = _repo_safe_mkdtemp


# ═══════════════════════════════════════════════════════════════
#  Temp Directory Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def temp_home(tmp_path: Path) -> Path:
    """Cria diretório temporário para testes."""
    return tmp_path


@pytest.fixture
def mock_agents_home(temp_home: Path, monkeypatch) -> Path:
    """Mock do diretório .agents para testes."""
    agents_home = temp_home / ".agents"
    agents_home.mkdir()
    monkeypatch.setenv("AGENTS_HOME", str(agents_home))
    return agents_home


# ═══════════════════════════════════════════════════════════════
#  Mock Result Helper
# ═══════════════════════════════════════════════════════════════


class MockSubprocessResult:
    """Simula resultado de subprocess.run."""

    def __init__(self, returncode: int, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


# ═══════════════════════════════════════════════════════════════
#  Git Mock Fixtures
# ═══════════════════════════════════════════════════════════════


class GitMock:
    """
    Mock de operações git para testes.

    Uso:
        git = GitMock(repo_path)
        git.add_commit("message", files={"file.txt": "content"})
    """

    def __init__(self, repo_path: Path):
        self.path = repo_path
        self.commits = []
        self.branches = ["main"]
        self.current = "main"
        self.tags = {}
        self.remotes = ["origin"]
        self.stashed = False
        self._commits_db = {}

    def add_commit(self, message: str, files: dict = None) -> str:
        """Adiciona um commit simulado."""
        import hashlib
        import uuid

        commit_hash = hashlib.sha1(f"{message}{uuid.uuid4()}".encode()).hexdigest()[:7]

        self.commits.append(commit_hash)

        commit_data = {
            "hash": commit_hash,
            "message": message,
            "files": files or {},
            "author": "Test <test@test.com>",
            "date": "2026-02-23T12:00:00Z",
        }

        self._commits_db[commit_hash] = commit_data
        return commit_hash

    def get_commit(self, ref: str) -> dict:
        """Retorna dados de um commit."""
        return self._commits_db.get(ref, {})

    def list_branches(self) -> list[str]:
        """Lista branches."""
        return self.branches

    def current_branch(self) -> str:
        """Retorna branch atual."""
        return self.current

    def diff(self, ref1: str = None, ref2: str = None) -> str:
        """Retorna diff simulado."""
        return "diff --git a/test.py b/test.py\n+new line\n-old line"

    def log(self, max_count: int = 10) -> list[dict]:
        """Retorna histórico de commits."""
        commits = []
        for h in self.commits[-max_count:]:
            commits.append(self._commits_db.get(h, {}))
        return commits

    def status(self) -> str:
        """Retorna status do repository."""
        if self.stashed:
            return "M modified.txt\n?? untracked.txt"
        return "nothing to commit, working tree clean"


@pytest.fixture
def mock_git_repo(temp_home: Path) -> Path:
    """Cria um repository git mock básico para testes."""
    repo_path = temp_home / "test_repo"
    repo_path.mkdir()

    # Inicializa git
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True, check=False)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path,
        capture_output=True,
        check=False,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=repo_path,
        capture_output=True,
        check=False,
    )

    return repo_path


# ═══════════════════════════════════════════════════════════════
#  Upstream Mock Fixtures
# ═══════════════════════════════════════════════════════════════


class UpstreamMock:
    """
    Mock de servidor upstream para testes.
    """

    def __init__(self):
        self.releases = {
            "v1.0.0": {
                "date": "2026-01-01",
                "notes": "Initial release",
                "commits": ["abc123", "def456"],
            },
            "v1.1.0": {
                "date": "2026-02-01",
                "notes": "Bug fixes",
                "commits": ["ghi789"],
            },
            "v1.2.0": {
                "date": "2026-02-20",
                "notes": "New features",
                "commits": ["jkl012"],
            },
        }
        self.available = True
        self.request_count = 0

    def get_latest_version(self) -> str:
        """Retorna a versão most recent."""
        if not self.available:
            raise ConnectionError("Upstream unavailable")

        # Parse versions e returns a most recent
        versions = []
        for v in self.releases.keys():
            # Simple version parsing
            parts = v.lstrip("v").split(".")
            try:
                versions.append((int(parts[0]), int(parts[1]), int(parts[2]), v))
            except (IndexError, ValueError):
                continue

        if not versions:
            return "v1.0.0"

        versions.sort(reverse=True)
        return versions[0][3]

    def get_release_info(self, version: str) -> dict:
        """Retorna informações de um release."""
        return self.releases.get(version, {})


@pytest.fixture
def mock_upstream() -> UpstreamMock:
    """Fixture principal para mockar servidor upstream."""
    return UpstreamMock()


# ═══════════════════════════════════════════════════════════════
#  Backup Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def backup_dir(temp_home: Path) -> Path:
    """Cria diretório de backup para testes."""
    backup = temp_home / "backups"
    backup.mkdir()
    return backup


@pytest.fixture
def existing_backup(backup_dir: Path) -> Path:
    """Cria backup existente para testes."""
    backup_path = backup_dir / "backup_20260223_120000"
    backup_path.mkdir()

    # Cria estrutura de backup simulada
    agents_dir = backup_path / ".agents"
    agents_dir.mkdir()
    agents_dir.joinpath("agents").write_text("# old version")
    agents_dir.joinpath("VERSION").write_text("v1.1.0")

    metadata = {
        "timestamp": "2026-02-23T12:00:00Z",
        "version": "v1.1.0",
        "commit": "abc123",
    }
    backup_path.joinpath("metadata.json").write_text(json.dumps(metadata))

    return backup_path


# ═══════════════════════════════════════════════════════════════
#  Manager Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def manager_with_backups(backup_dir: Path) -> Any:
    """Cria manager com múltiplos backups."""

    # Import here to avoid circular dependencies
    # This will be replaced with actual implementation
    class DummyManager:
        def __init__(self, backup_dir: Path):
            self.backup_dir = backup_dir
            self._backups = []
            self._create_fake_backups()

        def _create_fake_backups(self):
            """Cria backups fictícios."""
            versions = ["v1.1.0", "v1.0.0"]
            for i, version in enumerate(versions):
                backup_path = self.backup_dir / f"backup_2026022{i + 0}_{100000 + i * 10000}"
                backup_path.mkdir(parents=True, exist_ok=True)

                metadata = {
                    "version": version,
                    "timestamp": f"2026-02-2{i + 0}T{100000 + i * 10000}Z",
                    "commit": f"hash{i}",
                }
                backup_path.joinpath("metadata.json").write_text(json.dumps(metadata))

                self._backups.append(
                    {
                        "id": backup_path.name,
                        "version": version,
                        "timestamp": metadata["timestamp"],
                    }
                )

        def list(self) -> list[dict]:
            """Lista todos os backups."""
            return sorted(self._backups, key=lambda x: x["timestamp"], reverse=True)

        def delete(self, backup_id: str) -> dict:
            """Deleta backup."""
            return {"success": True, "deleted_id": backup_id}

        def verify(self, backup_id: str) -> dict:
            """Verifica integridade do backup."""
            return {"valid": True, "issues": []}

    return DummyManager(backup_dir)


# ═══════════════════════════════════════════════════════════════
#  Configuration Fixtures
# ═══════════════════════════════════════════════════════════════


@pytest.fixture
def mock_config(temp_home: Path) -> dict:
    """Cria configuração mock para testes."""
    config = {
        "version": "v1.1.0",
        "check_interval_hours": 24,
        "auto_backup": True,
        "backup_retention_days": 30,
        "upstream_url": "https://upstream.example.com/agents",
        "allowed_branches": ["main", "develop"],
    }

    config_file = temp_home / "config.json"
    config_file.write_text(json.dumps(config))

    return config


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════


def create_git_history(repo_path: Path, commits: list[str]):
    """Cria histórico git falso para testes."""
    for i, msg in enumerate(commits):
        file = repo_path / f"file_{i}.txt"
        file.write_text(f"Content {i}\n")

        subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True, check=False)
        subprocess.run(
            ["git", "commit", "-m", msg],
            cwd=repo_path,
            capture_output=True,
            check=False,
        )


@pytest.fixture
def sample_diff_content() -> str:
    """Retorna conteúdo de diff de exemplo."""
    return """diff --git a/.agents/agents b/.agents/agents
index 1234567..89abcdef 100755
--- a/.agents/agents
+++ b/.agents/agents
@@ -1,5 +1,7 @@
 #!/usr/bin/env bash
 #
+# New comment
 # Agents CLI Wrapper
+# Another comment
 #
 set -e

diff --git a/.agents/scripts/agents-doctor.py b/.agents/scripts/agents-doctor.py
--- a/.agents/scripts/agents-doctor.py
+++ b/.agents/scripts/agents-doctor.py
@@ -10,6 +10,8 @@
 import sys
+import logging

 def main():
     print("Doctor check")
"""
