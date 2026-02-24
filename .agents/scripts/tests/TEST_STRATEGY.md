# Agents Update - Test Strategy

## Overview

This document defines the complete test strategy for the agents update system, covering unit, integration, and E2E tests.

## Test Stack

- **Framework**: pytest
- **Mocks**: pytest-mock, unittest.mock
- **Fixtures**: Custom pytest fixtures
- **Coverage**: pytest-cov
- **Git Mocks**: pytest-git, custom fixtures

---

## 1. Test Project Structure

```
.agents/scripts/
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Global fixtures
│   │
│   ├── unit/
│   │   ├── __init__.py
│   │   ├── test_version_check.py
│   │   ├── test_diff_parser.py
│   │   ├── test_backup_manager.py
│   │   ├── test_rollback_engine.py
│   │   └── test_git_operations.py
│   │
│   ├── integration/
│   │   ├── __init__.py
│   │   ├── test_update_flow.py
│   │   ├── test_check_update.py
│   │   ├── test_plan_diff.py
│   │   ├── test_apply_update.py
│   │   └── test_rollback_flow.py
│   │
│   └── e2e/
│       ├── __init__.py
│       ├── conftest.py
│       ├── fixtures/
│       │   ├── fresh_repo/
│       │   ├── existing_backup/
│       │   ├── uncommitted_changes/
│       │   └── interrupted_update/
│       ├── test_full_update_cycle.py
│       ├── test_edge_cases.py
│       └── test_rollback_scenarios.py
│
├── test_data/
│   ├── mock_repos/
│   ├── git_logs/
│   └── expected_diffs/
```

---

## 2. Fixtures Globais (conftest.py)

```python
# .agents/scripts/tests/conftest.py

import pytest
import tempfile
import shutil
from pathlib import Path
from unittest.mock import MagicMock
import subprocess
import json
import os


# ─────────────────────────────────────────────────────────
#  Temp Directory Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture
def temp_home(tmp_path):
    """Creates temporary directory for tests."""
    return tmp_path


@pytest.fixture
def mock_agents_home(temp_home, monkeypatch):
    """Mock directory .agents for tests."""
    agents_home = temp_home / ".agents"
    agents_home.mkdir()
    monkeypatch.setenv("AGENTS_HOME", str(agents_home))
    return agents_home


# ─────────────────────────────────────────────────────────
#  Git Mock Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture
def mock_git_repo(temp_home):
    """Creates um repository git mock for tests."""
    repo_path = temp_home / "test_repo"
    repo_path.mkdir()
    
    # Inicializa git
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=repo_path, capture_output=True
    )
    
    return repo_path


class MockGitCommand:
    """Simulates comandos git for tests."""
    
    def __init__(self, repo_path: Path):
        self.repo = repo_path
        self.commits = []
        self.branches = ["main"]
        self.current_branch = "main"
        self.tags = []
        self.remote_available = True
        self.files = {}
        self.stashed_changes = False
        self.interrupted_operation = False
        
    def log(self, format="%H%n%s%n%b", max_count=None):
        commits = self.commits[-max_count:] if max_count else self.commits
        return "\n".join(commits)
    
    def diff(self, ref1, ref2="", stat=False):
        """Returns diff simulado entre refs."""
        if stat:
            return "file1.py | 10 +++---\nfile2.py | 5 +++\n2 files changed, 15 insertions(+)"
        return "diff --git a/file1.py b/file1.py\n@@ -1,5 +1,10 @@\n+new line added\n-old line removed"
    
    def status(self):
        if self.stashed_changes:
            return "M file.txt\n?? untracked.txt"
        if self.files.get("staged"):
            return "M  staged_file.py\n?? new_file.py"
        return "nothing to commit, working tree clean"
    
    def fetch(self, remote="origin"):
        if not self.remote_available:
            raise Exception("fatal: unable to connect to remote")
        return MockResult(0, "", "")
    
    def pull(self, remote="origin", branch="main"):
        if not self.remote_available:
            raise Exception("fatal: unable to connect to remote")
        self.commits.append("new_hash\nUpdate from upstream")
        return MockResult(0, "Already up to date.", "")
    
    def checkout(self, branch):
        self.current_branch = branch
        return MockResult(0, "", "")
    
    def stash(self):
        self.stashed_changes = True
        return MockResult(0, "Saved working directory", "")
    
    def stash_pop(self):
        self.stashed_changes = False
        return MockResult(0, "Dropped refs/stash", "")
    
    def tag(self, name):
        self.tags.append(name)
        return MockResult(0, "", "")
    
    def reset(self, mode, target):
        return MockResult(0, "", "")
    
    def branch(self, name, create=True):
        if create:
            self.branches.append(name)
        return MockResult(0, "", "")


class MockResult:
    """Simulates resultado de subprocess.run."""
    
    def __init__(self, returncode, stdout, stderr):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def mock_git(mocker):
    """Fixture main for mock operations git."""
    git_mock = MagicMock()
    
    def git_side_effect(*args, **kwargs):
        cmd = args[0] if args else []
        return MockResult(0, "", "")
    
    git_mock.side_effect = git_side_effect
    
    mocker.patch("subprocess.run", return_value=MockResult(0, "", ""))
    
    return git_mock


# ─────────────────────────────────────────────────────────
#  Upstream Mock Fixtures
# ─────────────────────────────────────────────────────────

class MockUpstreamServer:
    """Simulates servidor upstream for tests."""
    
    def __init__(self):
        self.available = True
        self.latest_version = "v1.2.0"
        self.release_notes = "## v1.2.0\n- New feature added\n- Bug fixes"
        self.download_urls = {
            "v1.2.0": "https://upstream.example.com/releases/v1.2.0.tar.gz",
            "v1.1.0": "https://upstream.example.com/releases/v1.1.0.tar.gz",
        }
        self.request_log = []
        self.should_fail_on_request = False
        
    def get_latest_version(self):
        if not self.available:
            raise ConnectionError("Remote unavailable")
        return self.latest_version
    
    def get_release_info(self, version):
        return {
            "version": version,
            "notes": self.release_notes,
            "download_url": self.download_urls.get(version),
        }
    
    def simulate_request_failure(self):
        self.should_fail_on_request = True


@pytest.fixture
def mock_upstream(mocker):
    """Mock do servidor upstream."""
    server = MockUpstreamServer()
    
    # Mock requests HTTP
    mocker.patch("requests.get")
    mocker.patch("requests.post")
    
    return server


# ─────────────────────────────────────────────────────────
#  Backup Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture
def backup_dir(temp_home):
    """Creates directory de backup for tests."""
    backup = temp_home / "backups"
    backup.mkdir()
    return backup


@pytest.fixture
def existing_backup(backup_dir):
    """Creates backup existente for tests."""
    backup_path = backup_dir / "backup_20260223_120000"
    backup_path.mkdir()
    
    # Creates structure de backup simulada
    (backup_path / ".agents").mkdir()
    (backup_path / ".agents" / "agents").write_text("# old version")
    (backup_path / "metadata.json").write_text(json.dumps({
        "timestamp": "2026-02-23T12:00:00Z",
        "version": "v1.1.0",
        "commit": "abc123",
    }))
    
    return backup_path


# ─────────────────────────────────────────────────────────
#  Configuration Fixtures
# ─────────────────────────────────────────────────────────

@pytest.fixture
def mock_config(temp_home):
    """Creates mock configuration for tests."""
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


# ─────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────

def create_fake_git_history(repo_path: Path, commits: list[str]):
    """Creates fake git history for tests."""
    for i, msg in enumerate(commits):
        # Creates arquivo to commit
        file = repo_path / f"file_{i}.txt"
        file.write_text(f"Content {i}\n")
        
        # Stage e commit
        subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", msg],
            cwd=repo_path, capture_output=True
        )


@pytest.fixture
def sample_diff_content():
    """Returns sample diff content."""
    return """diff --git a/.agents/agents b/.agents/agents
index 1234567..89abcdef 100755
--- a/.agents/agents
+++ b/.agents/agents
@@ -1,5 +1,7 @@
 #!/usr/bin/env bash
 #
+# New comment de header
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
```

---

## 3. Unit Tests

### 3.1 Testes de Version Check

```python
# .agents/scripts/tests/unit/test_version_check.py

import pytest
from unittest.mock import MagicMock, patch
import withoutver


class TestVersionComparison:
    """Tests withoutantic version comparison."""
    
    # ─────────────────────────────────────────────
    #  Cases: Current version is older
    # ─────────────────────────────────────────────
    
    def test_update_available_major_version(self):
        """When upstream has higher major version, update available."""
        from agents_update.version import check_version
        
        current = "v1.0.0"
        upstream = "v2.0.0"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is True
        assert result["update_type"] == "major"
        assert result["new_version"] == "v2.0.0"
    
    def test_update_available_minor_version(self):
        """When upstream has higher minor version."""
        current = "v1.1.0"
        upstream = "v1.2.0"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is True
        assert result["update_type"] == "minor"
    
    def test_update_available_patch_version(self):
        """When upstream has higher patch version."""
        current = "v1.1.0"
        upstream = "v1.1.1"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is True
        assert result["update_type"] == "patch"
    
    # ─────────────────────────────────────────────
    #  Cases: No update available
    # ─────────────────────────────────────────────
    
    def test_no_update_same_version(self):
        """Same version has no update."""
        current = "v1.2.0"
        upstream = "v1.2.0"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is False
        assert result["update_type"] is None
    
    def test_no_update_upstream_behind(self):
        """When upstream is behind (rare but possible)."""
        current = "v1.2.0"
        upstream = "v1.1.0"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is False
    
    # ─────────────────────────────────────────────
    #  Cases: Edge Cases
    # ─────────────────────────────────────────────
    
    def test_version_with_prefix_v(self):
        """Versions with v prefix are handled correctly."""
        current = "v1.0.0"
        upstream = "v1.0.1"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is True
    
    def test_version_without_prefix_v(self):
        """Versions without prefix work."""
        current = "1.0.0"
        upstream = "1.0.1"
        
        result = check_version(current, upstream)
        
        assert result["has_update"] is True
    
    def test_invalid_version_format(self):
        """Invalid version raises clear exception."""
        current = "invalid"
        upstream = "v1.0.0"
        
        with pytest.raises(ValueError, match="Invalid version format"):
            check_version(current, upstream)
    
    def test_prerelease_version(self):
        """Prerelease versions are handled correctly."""
        current = "v1.0.0-beta"
        upstream = "v1.0.0"
        
        result = check_version(current, upstream)
        
        # Stable > prerelease
        assert result["has_update"] is True


class TestVersionParser:
    """Tests version parsing from different sources."""
    
    @pytest.mark.tometrize("input,expected", [
        ("v1.2.3", "1.2.3"),
        ("1.2.3", "1.2.3"),
        ("v1.2.3-beta.1", "1.2.3-beta.1"),
        ("version: 1.2.3", "1.2.3"),
    ])
    def test_parse_version_string(self, input, expected):
        """Different version formats are parsed."""
        from agents_update.version import parse_version
        
        result = parse_version(input)
        
        assert result == expected
```

### 3.2 Testes de Diff Parser

```python
# .agents/scripts/tests/unit/test_diff_parser.py

import pytest
from agents_update.diff_parser import (
    parse_diff,
    extract_file_changes,
    categorize_changes,
    calculate_impact_score,
)


class TestDiffParsing:
    """Testa parsing de diffs git."""
    
    @pytest.fixture
    def sample_diff(self):
        return """diff --git a/file1.py b/file1.py
--- a/file1.py
+++ b/file1.py
@@ -1,3 +1,4 @@
 line1
+new_line
 line2
 line3
diff --git a/scripts/test.py b/scripts/test.py
--- a/scripts/test.py
+++ b/scripts/test.py
@@ -5,3 +5,5 @@
+added1
+added2
"""
    
    def test_parse_diff_returns_file_list(self, sample_diff):
        """Diff parsing returns lista de files modificados."""
        result = parse_diff(sample_diff)
        
        assert len(result["files"]) == 2
        assert "file1.py" in result["files"]
        assert "scripts/test.py" in result["files"]
    
    def test_extract_file_changes(self, sample_diff):
        """Extract changes per file."""
        changes = extract_file_changes(sample_diff)
        
        assert changes["file1.py"]["additions"] == 1
        assert changes["file1.py"]["deletions"] == 0
        assert changes["scripts/test.py"]["additions"] == 2
    
    def test_categorize_changes_by_type(self, sample_diff):
        """Categorize files by change type."""
        categories = categorize_changes(sample_diff)
        
        assert "scripts" in categories["python"]
        assert "file1.py" in categories["python"]
    
    def test_calculate_impact_score(self, sample_diff):
        """Calculate impact score."""
        score = calculate_impact_score(sample_diff)
        
        assert score > 0
        assert isinstance(score, (int, float))


class TestDiffFiltering:
    """Tests filtering de changes."""
    
    def test_ignore_patterns(self):
        """Arquivos em ignore_patterns are filtered."""
        diff = """diff --git a/node_modules/package/index.js b/node_modules/package/index.js
--- a/node_modules/package/index.js
+++ b/node_modules/package/index.js
@@ -1 +1 @@
-old
+new
"""
        result = parse_diff(diff, ignore_patterns=["node_modules/**"])
        
        assert len(result["files"]) == 0
    
    def test_critical_files_detection(self):
        """Critical files are marked."""
        diff = """diff --git a/.agents/agents b/.agents/agents
+new line
diff --git a/README.md b/README.md
+new line
"""
        result = parse_diff(diff)
        
        assert ".agents/agents" in result["critical_files"]
```

### 3.3 Testes de Backup Manager

```python
# .agents/scripts/tests/unit/test_backup_manager.py

import pytest
import json
import shutil
from pathlib import Path
from datetime import datetime
from agents_update.backup import BackupManager


class TestBackupCreation:
    """Tests creation de backups."""
    
    @pytest.fixture
    def manager(self, temp_home):
        backup_dir = temp_home / "backups"
        return BackupManager(backup_dir)
    
    @pytest.fixture
    def agents_home(self, temp_home):
        agents = temp_home / ".agents"
        agents.mkdir()
        (agents / "agents").write_text("#!/bin/bash\necho 'test'")
        (agents / "scripts").mkdir()
        return agents
    
    def test_create_backup(self, manager, agents_home):
        """Backup is created correctly."""
        result = manager.create(agents_home)
        
        assert result["success"] is True
        assert "backup_id" in result
        assert result["files_backed_up"] > 0
    
    def test_backup_includes_metadata(self, manager, agents_home):
        """Backup inclui metadata."""
        result = manager.create(agents_home)
        
        backup_path = manager.backup_dir / result["backup_id"]
        metadata_file = backup_path / "metadata.json"
        
        assert metadata_file.exists()
        
        metadata = json.loads(metadata_file.read_text())
        assert "timestamp" in metadata
        assert "version" in metadata
        assert "files" in metadata
    
    def test_backup_id_format(self, manager, agents_home):
        """ID do backup tem formato correto."""
        result = manager.create(agents_home)
        
        # Formato: backup_YYYYMMDD_HHMMSS_hash
        assert result["backup_id"].startswith("backup_")
        assert len(result["backup_id"]) > 20
    
    def test_incremental_backup(self, manager, agents_home):
        """Backups incrementais worksm."""
        # Primeiro backup
        result1 = manager.create(agents_home)
        
        # Modifica arquivo
        (agents_home / "agents").write_text("#!/bin/bash\necho 'modified'")
        
        # Segundo backup
        result2 = manager.create(agents_home)
        
        assert result2["backup_id"] != result1["backup_id"]


class TestBackupListing:
    """Testa listagem de backups."""
    
    def test_list_backups(self, manager_with_backups):
        """Lista todos os backups."""
        backups = manager.list()
        
        assert len(backups) >= 2
        assert all("timestamp" in b for b in backups)
    
    def test_list_backups_sorted_by_date(self, manager_with_backups):
        """Backups are sorted por data."""
        backups = manager.list()
        
        timestamps = [b["timestamp"] for b in backups]
        assert timestamps == sorted(timestamps, reverse=True)
    
    def test_filter_by_version(self, manager_with_backups):
        """Version filter works."""
        backups = manager.list(version="v1.1.0")
        
        assert all(b["version"] == "v1.1.0" for b in backups)


class TestBackupDeletion:
    """Tests deletion de backups."""
    
    def test_delete_backup(self, manager_with_backups):
        """Specific backup deletion."""
        backups_before = manager.list()
        backup_id = backups_before[0]["id"]
        
        result = manager.delete(backup_id)
        
        assert result["success"] is True
        
        backups_after = manager.list()
        assert backup_id not in [b["id"] for b in backups_after]
    
    def test_delete_old_backups_retention(self, manager_with_backups):
        """Retention limit is applied."""
        # Assume retention de 30 dias
        result = manager.cleanup_old(retention_days=30)
        
        assert result["deleted_count"] >= 0
        assert result["remaining_count"] > 0


class TestBackupIntegrity:
    """Testa integridade do backup."""
    
    def test_verify_backup_integrity(self, valid_backup):
        """Valid backup passes verification."""
        result = manager.verify(valid_backup["id"])
        
        assert result["valid"] is True
        assert len(result["issues"]) == 0
    
    def test_detect_corrupted_backup(self, corrupted_backup):
        """Backup corrompido is detected."""
        result = manager.verify(corrupted_backup["id"])
        
        assert result["valid"] is False
        assert len(result["issues"]) > 0
```

---

## 4. Integration Tests

### 4.1 Fluxo Completo de Update

```python
# .agents/scripts/tests/integration/test_update_flow.py

import pytest
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
import subprocess


class TestUpdateCheck:
    """Testa o comando check de update."""
    
    def test_check_no_updates_available(self, mock_git_repo, mock_upstream):
        """Check reports when no updates."""
        from agents_update.cli import check
        
        # Setup: repository is at latest
        mock_upstream.latest_version = "v1.1.0"
        
        result = check(repo_path=mock_git_repo)
        
        assert result["has_update"] is False
        assert result["current_version"] == "v1.1.0"
    
    def test_check_update_available(self, mock_git_repo, mock_upstream):
        """Check reports when update available."""
        from agents_update.cli import check
        
        mock_upstream.latest_version = "v1.2.0"
        
        result = check(repo_path=mock_git_repo)
        
        assert result["has_update"] is True
        assert result["new_version"] == "v1.2.0"
    
    def test_check_upstream_unavailable(self, mock_git_repo, mock_upstream):
        """Check handles upstream unavailable."""
        from agents_update.cli import check
        import requests
        
        mock_upstream.available = False
        
        result = check(repo_path=mock_git_repo)
        
        assert result["error"] is not None
        assert "unavailable" in result["error"].lower()
    
    def test_check_with_cached_version(self, mock_git_repo, mock_upstream, temp_home):
        """Check uses cache quando available."""
        from agents_update.cli import check
        
        # Creates cache
        cache_file = temp_home / ".update_cache"
        cache_file.write_text(json.dumps({
            "last_check": "2026-02-23T10:00:00Z",
            "version": "v1.1.0"
        }))
        
        result = check(repo_path=mock_git_repo, use_cache=True)
        
        # Should not fazer request real
        assert result.get("cached") is True


class TestUpdatePlan:
    """Testa o comando plan de update."""
    
    def test_plan_shows_diff(self, mock_git_repo, mock_upstream):
        """Plan shows diff of changes."""
        from agents_update.cli import plan
        
        mock_upstream.latest_version = "v1.2.0"
        
        result = plan(repo_path=mock_git_repo)
        
        assert "diff" in result
        assert len(result["changed_files"]) > 0
    
    def test_plan_with_local_changes(self, mock_git_repo, mock_upstream):
        """Plan detects changes local uncommitted."""
        from agents_update.cli import plan
        
        # Creates arquivo modificado
        (mock_git_repo / "modified.txt").write_text("local change")
        
        result = plan(repo_path=mock_git_repo)
        
        assert result["has_local_changes"] is True
        assert len(result["local_files"]) > 0
    
    def test_plan_categorizes_changes(self, mock_git_repo, mock_upstream):
        """Plan categorizes changes by type."""
        from agents_update.cli import plan
        
        result = plan(repo_path=mock_git_repo)
        
        assert "breaking_changes" in result
        assert "new_features" in result
        assert "bug_fixes" in result


class TestUpdateApply:
    """Testa o comando apply de update."""
    
    @pytest.fixture
    def prepared_update(self, mock_git_repo, mock_upstream):
        """Preto ambiente to apply."""
        # Setup upstream com files
        mock_upstream.latest_version = "v1.2.0"
        return mock_git_repo
    
    def test_apply_creates_backup(self, prepared_update):
        """Apply cria backup antes de modificar."""
        from agents_update.cli import apply
        
        result = apply(repo_path=prepared_update)
        
        assert result["backup_id"] is not None
        assert result["success"] is True
    
    def test_apply_updates_files(self, prepared_update):
        """Apply atualiza files corretamente."""
        from agents_update.cli import apply
        
        result = apply(repo_path=prepared_update)
        
        # Verifies que files foram atualizados
        version_file = prepared_update / ".agents" / "VERSION"
        assert version_file.exists()
    
    def test_apply_with_local_changes_stashes(self, mock_git_repo):
        """Apply does stash de changes local."""
        from agents_update.cli import apply
        
        # Simulates changes local
        (mock_git_repo / "local.txt").write_text("my changes")
        
        result = apply(repo_path=mock_git_repo)
        
        # Should ter stash
        assert result.get("stashed") is True
    
    def test_apply_rollback_on_failure(self, mock_git_repo):
        """Apply faz rollback se algo failsr."""
        from agents_update.cli import apply
        
        # Simulates fails
        with patch("agents_update.git.apply_changes", side_effect=Exception("Git error")):
            result = apply(repo_path=mock_git_repo)
            
            assert result["success"] is False
            assert result["rolled_back"] is True
            assert result["backup_used"] is not None
    
    def test_apply_interrupted_recovery(self, mock_git_repo):
        """Recovery de update interrupted."""
        from agents_update.cli import apply
        
        # Simulates state de interruption
        lock_file = mock_git_repo / ".agents" / ".update.lock"
        lock_file.write_text(json.dumps({
            "pid": 12345,
            "started_at": "2026-02-23T12:00:00Z",
            "phase": "applying"
        }))
        
        result = apply(repo_path=mock_git_repo, resume=True)
        
        assert result["resumed"] is True


class TestRollback:
    """Testa comando de rollback."""
    
    def test_rollback_restores_backup(self, mock_git_repo, existing_backup):
        """Rollback restaura backup corretamente."""
        from agents_update.cli import rollback
        
        result = rollback(repo_path=mock_git_repo, backup_id=existing_backup.name)
        
        assert result["success"] is True
        assert result["restored_files"] > 0
    
    def test_rollback_to_specific_version(self, mock_git_repo, manager_with_backups):
        """Rollback to specific version."""
        from agents_update.cli import rollback
        
        # Gets backup specific
        backups = manager_with_backups.list()
        target_backup = backups[0]
        
        result = rollback(
            repo_path=mock_git_repo,
            backup_id=target_backup["id"]
        )
        
        assert result["version_restored"] == target_backup["version"]
    
    def test_rollback_requires_confirmation(self, mock_git_repo):
        """Rollback requires confirmation."""
        from agents_update.cli import rollback
        
        with pytest.raises(ValueError, match="confirmation required"):
            rollback(repo_path=mock_git_repo, backup_id="test", confirm=False)
    
    def test_rollback_fresh_install_no_backup(self, mock_git_repo):
        """Rollback on fresh install without backup."""
        from agents_update.cli import rollback
        
        result = rollback(repo_path=mock_git_repo)
        
        assert result["error"] is not None
        assert "no backup" in result["error"].lower()
```

---

## 5. Testes E2E

### 5.1 Fixtures E2E

```python
# .agents/scripts/tests/e2e/conftest.py

import pytest
import subprocess
import shutil
import tempfile
from pathlib import Path
import json


@pytest.fixture(scope="session")
def test_repos_root(tmp_path_factory):
    """Base directory to repositorys for test."""
    return tmp_path_factory.mktemp("e2e_repos")


@pytest.fixture
def fresh_repo(test_repos_root):
    """Empty repository to first update."""
    repo_path = test_repos_root / "fresh_repo"
    repo_path.mkdir()
    
    # Inicializa git
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=repo_path, capture_output=True
    )
    
    # Creates structure initial
    (repo_path / ".agents").mkdir()
    (repo_path / ".agents" / "VERSION").write_text("v1.0.0")
    (repo_path / ".agents" / "agents").write_text("#!/bin/bash\necho v1.0.0")
    (repo_path / ".agents" / "scripts").mkdir()
    
    # Commit initial
    subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial v1.0.0"],
        cwd=repo_path, capture_output=True
    )
    
    yield repo_path
    
    # Cleanup
    shutil.rmtree(repo_path, ignore_errors=True)


@pytest.fixture
def repo_with_backup(test_repos_root):
    """Repository with previous backup."""
    repo_path = test_repos_root / "repo_with_backup"
    repo_path.mkdir()
    
    # Setup git
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=repo_path, capture_output=True
    )
    
    # Creates structure com backup
    agents_dir = repo_path / ".agents"
    agents_dir.mkdir()
    
    # Backup antigo
    backup_dir = repo_path / ".backups" / "backup_20260220_100000"
    backup_dir.mkdir(parents=True)
    (backup_dir / ".agents").mkdir()
    (backup_dir / ".agents" / "VERSION").write_text("v1.0.0")
    (backup_dir / "metadata.json").write_text(json.dumps({
        "version": "v1.0.0",
        "timestamp": "2026-02-20T10:00:00Z"
    }))
    
    # Current version
    (agents_dir / "VERSION").write_text("v1.1.0")
    (agents_dir / "agents").write_text("#!/bin/bash\necho v1.1.0")
    
    subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Update to v1.1.0"],
        cwd=repo_path, capture_output=True
    )
    
    yield repo_path
    
    shutil.rmtree(repo_path, ignore_errors=True)


@pytest.fixture
def repo_with_uncommitted(test_repos_root):
    """Repository with uncommitted changes."""
    repo_path = test_repos_root / "repo_uncommitted"
    repo_path.mkdir()
    
    # Setup git basic
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=repo_path, capture_output=True
    )
    
    # Creates files commitados
    agents_dir = repo_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "VERSION").write_text("v1.1.0")
    
    subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Base commit"],
        cwd=repo_path, capture_output=True
    )
    
    # Adds changes uncommitted
    (repo_path / ".agents" / "local_patch.py").write_text("# My custom change")
    (repo_path / "notes.txt").write_text("My notes")
    
    yield repo_path
    
    shutil.rmtree(repo_path, ignore_errors=True)


@pytest.fixture
def interrupted_update_repo(test_repos_root):
    """Repository with incomplete update."""
    repo_path = test_repos_root / "interrupted_update"
    repo_path.mkdir()
    
    # Setup basic
    subprocess.run(["git", "init"], cwd=repo_path, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=repo_path, capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=repo_path, capture_output=True
    )
    
    # Creates state de interruption
    agents_dir = repo_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "VERSION").write_text("v1.1.0")
    
    # Lock file de update incomplete
    lock_file = agents_dir / ".update.lock"
    lock_file.write_text(json.dumps({
        "phase": "downloading",
        "started_at": "2026-02-23T12:00:00Z",
        "download_progress": 0.65
    }))
    
    # Arquivo parcialmente baixado
    (agents_dir / "agents-partial").write_text("# incomplete")
    
    yield repo_path
    
    shutil.rmtree(repo_path, ignore_errors=True)
```

### 5.2 Testes E2E Completos

```python
# .agents/scripts/tests/e2e/test_full_update_cycle.py

import pytest
import subprocess
import json
from pathlib import Path


class TestFirstUpdateScenario:
    """
    Scenario: Primeiro update em repo novo
    """
    
    def test_fresh_install_check_no_updates(self, fresh_repo, mock_upstream):
        """New repo with latest version reports no updates."""
        # Simulates upstream has the same version
        mock_upstream.latest_version = "v1.0.0"
        
        result = subprocess.run(
            [".agents/agents", "update", "check"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
        assert "up to date" in result.stdout.lower() or "no updates" in result.stdout.lower()
    
    def test_fresh_install_update_flow(self, fresh_repo, mock_upstream):
        """Update full em repo novo works."""
        mock_upstream.latest_version = "v1.2.0"
        
        # Check
        check_result = subprocess.run(
            [".agents/agents", "update", "check"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        assert "v1.2.0" in check_result.stdout
        
        # Plan
        plan_result = subprocess.run(
            [".agents/agents", "update", "plan"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        assert plan_result.returncode == 0
        
        # Apply (with --yes to skip confirmation)
        apply_result = subprocess.run(
            [".agents/agents", "update", "apply", "--yes"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        assert apply_result.returncode == 0
        assert "success" in apply_result.stdout.lower()
        
        # Verifies updated version
        version_file = fresh_repo / ".agents" / "VERSION"
        assert version_file.read_text() == "v1.2.0"
        
        # Verifies backup foi criado
        backup_dir = fresh_repo / ".backups"
        assert backup_dir.exists()
        backups = list(backup_dir.iterdir())
        assert len(backups) > 0


class TestUpdateWithExistingBackup:
    """
    Scenario: Update when already exists backup previous
    """
    
    def test_update_respects_backup_retention(self, repo_with_backup):
        """Update does not remove backups old unnecessary."""
        # Faz update
        result = subprocess.run(
            [".agents/agents", "update", "apply", "--yes"],
            cwd=repo_with_backup,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
        
        # Verifies que backup antigo permanece
        backup_dir = repo_with_backup / ".backups"
        old_backup = backup_dir / "backup_20260220_100000"
        assert old_backup.exists()
    
    def test_update_can_use_previous_backup(self, repo_with_backup):
        """Update pode fazer rollback to backup previous."""
        # Aplica update
        subprocess.run(
            [".agents/agents", "update", "apply", "--yes"],
            cwd=repo_with_backup,
            capture_output=True
        )
        
        # Rollback
        rollback_result = subprocess.run(
            [".agents/agents", "update", "rollback", "--yes"],
            cwd=repo_with_backup,
            capture_output=True,
            text=True
        )
        
        assert rollback_result.returncode == 0
        
        # Verifies previous version
        version_file = repo_with_backup / ".agents" / "VERSION"
        assert version_file.read_text() == "v1.0.0"


class TestUpdateWithLocalChanges:
    """
    Scenario: Update com modifications local uncommitted
    """
    
    def test_update_detects_uncommitted_changes(self, repo_with_uncommitted):
        """Update detects changes local."""
        result = subprocess.run(
            [".agents/agents", "update", "plan"],
            cwd=repo_with_uncommitted,
            capture_output=True,
            text=True
        )
        
        assert "uncommitted" in result.stdout.lower() or "local" in result.stdout.lower()
    
    def test_update_with_stash_and_unstash(self, repo_with_uncommitted):
        """Update does stash/unstash de changes local."""
        # Apply com stash automatic
        result = subprocess.run(
            [".agents/agents", "update", "apply", "--yes", "--stash"],
            cwd=repo_with_uncommitted,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
        # Verifies que changes local were saved
        # (implicit in flow)
    
    def test_update_fails_without_stash_flag(self, repo_with_uncommitted):
        """Update fails without --stash when has changes local."""
        result = subprocess.run(
            [".agents/agents", "update", "apply", "--yes"],
            cwd=repo_with_uncommitted,
            capture_output=True,
            text=True
        )
        
        # Should failsr ou avisar
        assert result.returncode != 0 or "warning" in result.stdout.lower()


class TestInterruptedUpdate:
    """
    Scenario: Update fails in middle (simulate interruption)
    """
    
    def test_resume_interrupted_update(self, interrupted_update_repo):
        """Update interrupted pode ser retomado."""
        # Tenta aplicar (deve detectsr state inconsistente)
        result = subprocess.run(
            [".agents/agents", "update", "apply", "--yes", "--resume"],
            cwd=interrupted_update_repo,
            capture_output=True,
            text=True
        )
        
        # Should conseguir recuperar
        assert result.returncode == 0 or "resumed" in result.stdout.lower()
    
    def test_force_repair_after_interruption(self, interrupted_update_repo):
        """Force repair after interruption."""
        result = subprocess.run(
            [".agents/agents", "update", "repair", "--force"],
            cwd=interrupted_update_repo,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
        
        # Verifies que lock foi removido
        lock_file = interrupted_update_repo / ".agents" / ".update.lock"
        assert not lock_file.exists()


class TestUpstreamUnavailable:
    """
    Scenario: Update quando upstream is unavailable
    """
    
    def test_check_handles_no_network(self, fresh_repo, mock_upstream):
        """Check handles indisponibilidade de rede."""
        mock_upstream.available = False
        
        result = subprocess.run(
            [".agents/agents", "update", "check"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        # Pode failsr ou usar cache
        assert result.returncode != 0 or "cache" in result.stdout.lower()
    
    def test_apply_works_with_cached(self, fresh_repo, mock_upstream):
        """Apply works com data em cache."""
        # Creates cache first
        cache_file = fresh_repo / ".agents" / ".update_cache"
        cache_file.write_text(json.dumps({
            "version": "v1.2.0",
            "checked_at": "2026-02-23T10:00:00Z"
        }))
        
        # Tenta apply offline
        result = subprocess.run(
            [".agents/agents", "update", "apply", "--offline", "--yes"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        # Pode worksr com cache ou failsr
        if result.returncode == 0:
            assert "offline" in result.stdout.lower()


class TestRollbackScenarios:
    """
    Scenario: Rollback after update
    """
    
    def test_rollback_after_successful_update(self, fresh_repo):
        """Rollback works after update successful."""
        # Setup: faz update first
        # (implicit - the repo already is em state initial)
        
        # Aplica update
        subprocess.run(
            [".agents/agents", "update", "apply", "--yes"],
            cwd=fresh_repo,
            capture_output=True
        )
        
        # Faz rollback
        result = subprocess.run(
            [".agents/agents", "update", "rollback", "--yes"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        assert result.returncode == 0
    
    def test_rollback_requires_confirmation(self, fresh_repo):
        """Rollback needs confirmation explicit."""
        result = subprocess.run(
            [".agents/agents", "update", "rollback"],
            cwd=fresh_repo,
            capture_output=True,
            text=True
        )
        
        # Should failsr ou ask confirmation
        assert result.returncode != 0 or "confirm" in result.stdout.lower()
    
    def test_rollback_to_specific_backup(self, repo_with_backup):
        """Rollback to backup specific."""
        backups = list((repo_with_backup / ".backups").iterdir())
        
        if backups:
            backup_name = backups[0].name
            
            result = subprocess.run(
                [".agents/agents", "update", "rollback", backup_name, "--yes"],
                cwd=repo_with_backup,
                capture_output=True,
                text=True
            )
            
            assert result.returncode == 0
```

---

## 6. Strategy of Mock to Git/Upstream

### 6.1 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Test Pyramid                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        ┌─────────┐                              │
│                       /   E2E    \                             │
│                      /   Real Git  \                           │
│                     /  + Real HTTP  \                          │
│                    └────────────────┘                          │
│                                                                  │
│               ┌─────────────────────┐                          │
│              /    Integration       \                         │
│             /    Mock Git + HTTP    \                         │
│            /    (pytest-mock)        \                        │
│           └───────────────────────────┘                       │
│                                                                  │
│        ┌───────────────────────────────────┐                   │
│       /           Unit Tests               \                  │
│      /    Pure Functions + Mock Total       \                 │
│     /    (unittest.mock)                    \                 │
│    └────────────────────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Mock Details

| Camada | O que Mockar | Como |
|--------|-------------|------|
| **Unit** | Pure functions, parsing, validation | `unittest.mock.MagicMock` |
| **Integration** | `subprocess.run` git, HTTP requests | `pytest-mock` fixtures |
| **E2E** | Nada (ou Docker container) | Repos reais + upstream mock server |

### 6.3 Git Mock Classes

```python
# .agents/scripts/tests/mocks/git.py

class GitMock:
    """
    Complete mock de operations git for tests.
    
    Uso:
        git = GitMock(repo_path)
        git.add_commit("message", files={"file.txt": "content"})
        git.create_branch("feature")
        git.checkout("feature")
        git.merge("main")
    """
    
    def __init__(self, repo_path: Path):
        self.path = repo_path
        self.commits = []
        self.branches = ["main"]
        self.current = "main"
        self.tags = {}
        self.remotes = ["origin"]
        self.stash = []
        self._commits_db = {}  # commit_hash -> commit_data
        
    def add_commit(self, message: str, files: dict = None) -> str:
        """Adds um commit simulado."""
        import hashlib
        import uuid
        
        commit_hash = hashlib.sha1(
            f"{message}{uuid.uuid4()}".encode()
        ).hexdigest()[:7]
        
        self.commits.append(commit_hash)
        
        commit_data = {
            "hash": commit_hash,
            "message": message,
            "files": files or {},
            "author": "Test <test@test.com>",
            "date": "2026-02-23T12:00:00Z"
        }
        
        self._commits_db[commit_hash] = commit_data
        return commit_hash
    
    def get_commit(self, ref: str) -> dict:
        """Returns data de um commit."""
        return self._commits_db.get(ref, {})
    
    def list_branches(self) -> list[str]:
        """Lista branches."""
        return self.branches
    
    def current_branch(self) -> str:
        """Returns branch atual."""
        return self.current
    
    def diff(self, ref1: str = None, ref2: str = None) -> str:
        """Returns diff simulado."""
        return "diff --git a/test.py b/test.py\n+new line\n-old line"
    
    def log(self, max_count: int = 10) -> list[dict]:
        """Returns history de commits."""
        commits = []
        for h in self.commits[-max_count:]:
            commits.append(self._commits_db.get(h, {}))
        return commits


class UpstreamMock:
    """
    Mock de servidor upstream for tests.
    """
    
    def __init__(self):
        self.releases = {
            "v1.0.0": {
                "date": "2026-01-01",
                "notes": "Initial release",
                "commits": ["abc123", "def456"]
            },
            "v1.1.0": {
                "date": "2026-02-01",
                "notes": "Bug fixes",
                "commits": ["ghi789"]
            },
            "v1.2.0": {
                "date": "2026-02-20",
                "notes": "New features",
                "commits": ["jkl012"]
            }
        }
        self.available = True
        self.request_count = 0
        self.fail_on_request = None
        
    def get_latest_version(self) -> str:
        if not self.available:
            raise ConnectionError("Upstream unavailable")
        return max(self.releases.keys(), key=lambda v: self._parse_version(v))
    
    def get_release_info(self, version: str) -> dict:
        return self.releases.get(version, {})
    
    def _parse_version(self, v: str) -> tuple:
        """Parse version for comparison."""
        import withoutver
        return withoutver.VersionInfo.parse(v.lstrip("v"))
```

---

## 7. Dados de Teste

### 7.1 Scenarios de Teste

| ID | Scenario | Input | Expected Output |
|----|---------|---------|----------------|
| **TC-001** | Check - without updates | v1.2.0 local, v1.2.0 upstream | `has_update: false` |
| **TC-002** | Check - update major | v1.0.0 local, v2.0.0 upstream | `has_update: true, type: major` |
| **TC-003** | Check - update minor | v1.1.0 local, v1.2.0 upstream | `has_update: true, type: minor` |
| **TC-004** | Check - update patch | v1.1.0 local, v1.1.1 upstream | `has_update: true, type: patch` |
| **TC-005** | Check - offline | Without rede | Erro claro ou cache |
| **TC-006** | Plan - diff empty | Without changes | `diff: ""` |
| **TC-007** | Plan - with changes | Arquivos modificados | `files: [list]` |
| **TC-008** | Plan - local changes | Uncommitted changes | `has_local_changes: true` |
| **TC-009** | Apply - sucesso | Tudo ok | `success: true` |
| **TC-010** | Apply - com backup | Primeira vez | Backup criado |
| **TC-011** | Apply - stash | Changes local | Stash criado |
| **TC-012** | Apply - fails git | Git error | Rollback automatic |
| **TC-013** | Rollback - sucesso | Backup existe | Restaurado |
| **TC-014** | Rollback - without backup | Without backups | Erro |
| **TC-015** | Rollback - confirm | Without --yes | Ask confirmation |

### 7.2 Test Data Files

```yaml
# .agents/scripts/tests/test_data/scenarios.yaml

scenarios:
  - id: fresh_repo_no_update
    description: New repo, same version
    setup:
      local_version: "v1.2.0"
      upstream_version: "v1.2.0"
    expected:
      has_update: false
      
  - id: update_available
    description: Update available
    setup:
      local_version: "v1.1.0"
      upstream_version: "v1.2.0"
    expected:
      has_update: true
      update_type: "minor"
      
  - id: local_changes_detected
    description: Changes local detectsdas
    setup:
      local_version: "v1.1.0"
      uncommitted:
        - ".agents/scripts/custom.py"
        - "notes.txt"
    expected:
      has_local_changes: true
      local_files_count: 2
      
  - id: interrupted_update
    description: Update interrupted
    setup:
      lock_file:
        phase: "downloading"
        progress: 0.65
    expected:
      can_resume: true
```

---

## 8. Executando os Testes

### 8.1 Comandos

```bash
# In directory .agents/scripts/

# Todos os testes
pytest tests/ -v

# Only unit
pytest tests/unit/ -v

# Only integration
pytest tests/integration/ -v

# Only E2E
pytest tests/e2e/ -v

# Com coverage
pytest tests/ --cov=agents_update --cov-report=html

# Com verbose e mostrar print
pytest tests/ -v -s

# Teste specific
pytest tests/unit/test_version_check.py::TestVersionComparison::test_update_available_major_version -v

# Marcar como skip (to debugging)
pytest tests/ -v --skip
```

### 8.2 CI/CD

```yaml
# .github/workflows/test.yml

name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
          
      - name: Install dependencies
        run: |
          pip install pytest pytest-cov pytest-mock pyyaml
          
      - name: Run unit tests
        run: pytest tests/unit/ -v --cov
        
      - name: Run integration tests
        run: pytest tests/integration/ -v
        
      - name: Run E2E tests
        run: pytest tests/e2e/ -v
```

---

## 9. Metrics e Coverage

### 9.1 Targets de Coverage

| Tipo de Teste | Target Minimum | Ideal |
|---------------|---------------|-------|
| Unit Tests | 80% | 90% |
| Integration | 70% | 85% |
| E2E | N/A | Critical paths 100% |

### 9.2 Badges

```markdown
[![Unit Tests](https://github.com/org/repo/actions/workflows/test.yml/badge.svg?event=push)](https://github.com/org/repo/actions/workflows/test.yml)
[![Coverage](https://codecov.io/gh/org/repo/branch/main/graph/badge.svg)](https://codecov.io/gh/org/repo)
```

---

## 10. Next Steps

1. **Setup initial**: Addsr dependencies for test ao `pyproject.toml`
2. **Creates structure**: Creates directories `tests/unit/`, `tests/integration/`, `tests/e2e/`
3. **Implement fixtures**: Createsr `conftest.py` com fixtures base
4. **Unit tests**: Implement version, diff, backup tests
5. **Testes integration**: Implement flow full check→plan→apply
6. **Testes E2E**: Createsr fixtures de repo real e testar scenarios
7. **CI/CD**: Configurar GitHub Actions
8. **Documentation**: Addsr ao README

---

## Appendix: Fixture Factory Helpers

```python
# helpers.py - Helper functions to create test data

def make_git_commit(repo_path: Path, message: str, content: dict) -> str:
    """Creates commit com files specifics."""
    for path, text in content.items():
        file_path = repo_path / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(text)
    
    subprocess.run(["git", "add", "."], cwd=repo_path, capture_output=True)
    result = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_path,
        capture_output=True,
        text=True
    )
    
    # Get commit hash
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_path,
        capture_output=True,
        text=True
    )
    
    return result.stdout.strip()


def make_backup(backup_dir: Path, version: str, files: dict) -> str:
    """Creates structure de backup."""
    from datetime import datetime
    import json
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_id = f"backup_{timestamp}"
    backup_path = backup_dir / backup_id
    
    agents_dir = backup_path / ".agents"
    agents_dir.mkdir(parents=True)
    
    for path, content in files.items():
        file_path = agents_dir / path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)
    
    metadata = {
        "version": version,
        "timestamp": f"2026-02-23T{timestamp}Z",
        "commit": "abc123def"
    }
    
    (backup_path / "metadata.json").write_text(json.dumps(metadata))
    
    return backup_id
```

---

*Documento criado em: 2026-02-23*
*Version: 1.0.0*
