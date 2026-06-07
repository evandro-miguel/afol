import sys
import tempfile
from pathlib import Path
from datetime import timezone, timedelta

import pytest

sys.path.insert(0, str(Path(".agents/scripts").resolve()))

from lib.agents_config import parse_offset, resolve_scaffold_source_roots, source_template_root


def test_parse_offset_accepts_utc_shorthand():
    assert parse_offset("Z") == timezone.utc


def test_parse_offset_accepts_valid_offset():
    assert parse_offset("+03:30") == timezone(timedelta(hours=3, minutes=30))
    assert parse_offset("-00:45") == timezone(timedelta(minutes=-45))


def test_parse_offset_rejects_invalid_shape():
    with pytest.raises(ValueError, match="Invalid timezone offset format"):
        parse_offset("+3:00")


def test_parse_offset_rejects_hour_out_of_range():
    with pytest.raises(ValueError, match="Invalid timezone offset format"):
        parse_offset("+99:00")


def test_source_template_root_uses_src_project_template():
    repo_root = Path("/tmp/example-repo")
    assert source_template_root(repo_root) == repo_root / "src" / "project-template"


def test_resolve_scaffold_source_roots_prefers_template_agents():
    with tempfile.TemporaryDirectory() as td:
        source_root = Path(td) / "source"
        (source_root / ".agents").mkdir(parents=True)
        (source_root / "src/project-template/.agents").mkdir(parents=True)

        resolved_root, agents_dir = resolve_scaffold_source_roots(source_root)
        assert resolved_root == source_root.resolve()
        assert agents_dir == (source_root / "src/project-template/.agents").resolve()


def test_resolve_scaffold_source_roots_falls_back_to_repo_agents():
    with tempfile.TemporaryDirectory() as td:
        source_root = Path(td) / "source"
        (source_root / ".agents").mkdir(parents=True)

        resolved_root, agents_dir = resolve_scaffold_source_roots(source_root)
        assert resolved_root == source_root.resolve()
        assert agents_dir == (source_root / ".agents").resolve()
