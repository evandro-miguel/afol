from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def load_module(module_name: str, file_name: str):
    scripts_dir = Path(__file__).resolve().parents[1]
    script_path = scripts_dir / file_name
    lib_dir = script_path.parent / "lib"
    for candidate in (script_path.parent, lib_dir):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def test_event_schema_append_and_invalid_jsonl_handling(tmp_path, monkeypatch):
    local_state = load_module("agents_local_state_test_schema", "agents-local-state.py")

    monkeypatch.setattr(local_state, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(local_state, "AGENTS_DIR", tmp_path / ".agents")
    monkeypatch.setattr(local_state, "WB_DIR", tmp_path / ".agents" / "wb")
    monkeypatch.setattr(local_state, "RULES_DIR", tmp_path / ".agents" / "rules")
    monkeypatch.setattr(local_state, "SKILLS_DIR", tmp_path / ".agents" / "skills")
    monkeypatch.setattr(local_state, "SPECS_DIR", tmp_path / "docs" / "arc" / "SPECS")
    monkeypatch.setattr(local_state, "DATA_DIR", tmp_path / ".agents" / "data")
    monkeypatch.setattr(local_state, "EVENTS_DIR", tmp_path / ".agents" / "data" / "events")
    monkeypatch.setattr(local_state, "EVENTS_FILE", tmp_path / ".agents" / "data" / "events" / "events.jsonl")
    monkeypatch.setattr(local_state, "INDEX_DIR", tmp_path / ".agents" / "data" / "index")
    monkeypatch.setattr(local_state, "INDEX_MANIFEST", tmp_path / ".agents" / "data" / "index" / "manifest.json")

    event = local_state.append_event(
        {
            "version": 1,
            "timestamp": "2026-05-28T13:00:00Z",
            "type": "index_rebuild",
            "source": "test",
            "payload": {"category": "workbench"},
            "metadata": {"k": "v"},
        }
    )
    assert event["id"]
    assert event["timestamp"].endswith("Z")

    with local_state.EVENTS_FILE.open("a", encoding="utf-8") as handle:
        handle.write("{bad json\n")
        handle.write('{"version":1,"type":"missing_timestamp","source":"test"}\n')

    loaded = local_state.load_events(local_state.EVENTS_FILE)
    assert len(loaded["events"]) == 1
    assert loaded["invalid_lines"] == 2
    assert loaded["invalid_samples"]


def _write_task_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        "doc_type: task\n"
        "id: test_task\n"
        "status: active\n"
        "---\n\n"
        "# Tasks\n\n"
        "- [x] T-01 done\n"
        "- [/] T-02 in progress\n",
        encoding="utf-8",
    )


def _write_rule(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        "id: RULE-001\n"
        "title: Rule One\n"
        "status: active\n"
        "---\n\n"
        "# Rule\n",
        encoding="utf-8",
    )


def _write_skill(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        "name: test-skill\n"
        "description: skill description\n"
        "status: active\n"
        "---\n\n"
        "# Skill\n",
        encoding="utf-8",
    )


def _write_spec(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        "id: 260528_0001_test_spec_01\n"
        "theme: testing\n"
        "status: draft\n"
        "roadmap_feature: F-07\n"
        "---\n\n"
        "# Spec\n",
        encoding="utf-8",
    )


def test_rebuild_query_freshness_and_replay(tmp_path, monkeypatch):
    local_state = load_module("agents_local_state_test_rebuild", "agents-local-state.py")

    monkeypatch.setattr(local_state, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(local_state, "AGENTS_DIR", tmp_path / ".agents")
    monkeypatch.setattr(local_state, "WB_DIR", tmp_path / ".agents" / "wb")
    monkeypatch.setattr(local_state, "RULES_DIR", tmp_path / ".agents" / "rules")
    monkeypatch.setattr(local_state, "SKILLS_DIR", tmp_path / ".agents" / "skills")
    monkeypatch.setattr(local_state, "SPECS_DIR", tmp_path / "docs" / "arc" / "SPECS")
    monkeypatch.setattr(local_state, "DATA_DIR", tmp_path / ".agents" / "data")
    monkeypatch.setattr(local_state, "EVENTS_DIR", tmp_path / ".agents" / "data" / "events")
    monkeypatch.setattr(local_state, "EVENTS_FILE", tmp_path / ".agents" / "data" / "events" / "events.jsonl")
    monkeypatch.setattr(local_state, "INDEX_DIR", tmp_path / ".agents" / "data" / "index")
    monkeypatch.setattr(local_state, "INDEX_MANIFEST", tmp_path / ".agents" / "data" / "index" / "manifest.json")

    _write_task_file(tmp_path / ".agents" / "wb" / "260528_1200_f07" / "260528_1200_f07_task_01.md")
    _write_rule(tmp_path / ".agents" / "rules" / "RULE-001.md")
    _write_skill(tmp_path / ".agents" / "skills" / "test-skill" / "SKILL.md")
    _write_spec(tmp_path / "docs" / "arc" / "SPECS" / "260528_0001_test_spec_01.md")

    manifest = local_state.rebuild(["workbench", "rules", "skills", "specs", "files"])
    assert sorted(manifest["categories"]) == ["files", "rules", "skills", "specs", "workbench"]
    assert (tmp_path / ".agents" / "data" / "index" / "workbench.json").exists()

    rules_query = local_state.query_index("rules", term="rule", status="active", limit=5)
    assert rules_query["total"] == 1
    assert rules_query["results"][0]["id"] == "RULE-001"

    fresh = local_state.compute_freshness("workbench")
    assert fresh["fresh"] is True

    local_state.record_event("file_change", "test", payload={"path": "x"})
    stale_by_event = local_state.compute_freshness("workbench")
    assert stale_by_event["stale"] is True
    assert "new_events_not_indexed" in stale_by_event["reasons"]

    local_state.rebuild(["workbench"])
    task_file = tmp_path / ".agents" / "wb" / "260528_1200_f07" / "260528_1200_f07_task_01.md"
    task_file.write_text(task_file.read_text(encoding="utf-8") + "\n- [ ] T-03 pending\n", encoding="utf-8")
    stale_by_source = local_state.compute_freshness("workbench")
    assert stale_by_source["stale"] is True
    assert "source_changed" in stale_by_source["reasons"]

    local_state.rebuild(["rules"])
    local_state.record_event("query", "test")
    local_state.record_event("query", "test")
    replay = local_state.replay_since_index("rules", limit=10)
    assert replay["total"] == 2
    assert replay["events"][0]["type"] == "query"


def test_event_log_truncation_rewrite_and_tamper_stale_index(tmp_path, monkeypatch):
    local_state = load_module("agents_local_state_test_event_log_tamper", "agents-local-state.py")

    monkeypatch.setattr(local_state, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(local_state, "AGENTS_DIR", tmp_path / ".agents")
    monkeypatch.setattr(local_state, "WB_DIR", tmp_path / ".agents" / "wb")
    monkeypatch.setattr(local_state, "RULES_DIR", tmp_path / ".agents" / "rules")
    monkeypatch.setattr(local_state, "SKILLS_DIR", tmp_path / ".agents" / "skills")
    monkeypatch.setattr(local_state, "SPECS_DIR", tmp_path / "docs" / "arc" / "SPECS")
    monkeypatch.setattr(local_state, "DATA_DIR", tmp_path / ".agents" / "data")
    monkeypatch.setattr(local_state, "EVENTS_DIR", tmp_path / ".agents" / "data" / "events")
    monkeypatch.setattr(local_state, "EVENTS_FILE", tmp_path / ".agents" / "data" / "events" / "events.jsonl")
    monkeypatch.setattr(local_state, "INDEX_DIR", tmp_path / ".agents" / "data" / "index")
    monkeypatch.setattr(local_state, "INDEX_MANIFEST", tmp_path / ".agents" / "data" / "index" / "manifest.json")

    _write_task_file(tmp_path / ".agents" / "wb" / "260528_1200_f07" / "260528_1200_f07_task_01.md")

    local_state.record_event("seed", "test")
    local_state.rebuild(["workbench"])

    fresh = local_state.compute_freshness("workbench")
    assert fresh["fresh"] is True

    event_log = tmp_path / ".agents" / "data" / "events" / "events.jsonl"
    event_log.write_text("", encoding="utf-8")
    truncated = local_state.compute_freshness("workbench")
    assert truncated["stale"] is True
    assert "event_log_truncated" in truncated["reasons"]

    event_log.write_text(
        "{\"version\":1,\"timestamp\":\"2026-05-28T13:00:00Z\",\"type\":\"tamper\",\"source\":\"test\",\"payload\":{},\"metadata\":{},\"id\":\"abc\"}\n",
        encoding="utf-8",
    )
    rewritten = local_state.compute_freshness("workbench")
    assert rewritten["stale"] is True
    assert "event_log_changed" in rewritten["reasons"]


def test_cli_main_smoke(tmp_path, monkeypatch, capsys):
    local_state = load_module("agents_local_state_test_cli", "agents-local-state.py")

    monkeypatch.setattr(local_state, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(local_state, "AGENTS_DIR", tmp_path / ".agents")
    monkeypatch.setattr(local_state, "WB_DIR", tmp_path / ".agents" / "wb")
    monkeypatch.setattr(local_state, "RULES_DIR", tmp_path / ".agents" / "rules")
    monkeypatch.setattr(local_state, "SKILLS_DIR", tmp_path / ".agents" / "skills")
    monkeypatch.setattr(local_state, "SPECS_DIR", tmp_path / "docs" / "arc" / "SPECS")
    monkeypatch.setattr(local_state, "DATA_DIR", tmp_path / ".agents" / "data")
    monkeypatch.setattr(local_state, "EVENTS_DIR", tmp_path / ".agents" / "data" / "events")
    monkeypatch.setattr(local_state, "EVENTS_FILE", tmp_path / ".agents" / "data" / "events" / "events.jsonl")
    monkeypatch.setattr(local_state, "INDEX_DIR", tmp_path / ".agents" / "data" / "index")
    monkeypatch.setattr(local_state, "INDEX_MANIFEST", tmp_path / ".agents" / "data" / "index" / "manifest.json")

    _write_rule(tmp_path / ".agents" / "rules" / "RULE-001.md")

    monkeypatch.setattr(sys, "argv", ["agents-local-state.py", "record", "index_rebuild", "--source", "test"])
    assert local_state.main() == 0

    monkeypatch.setattr(sys, "argv", ["agents-local-state.py", "rebuild", "--categories", "rules"])
    assert local_state.main() == 0

    monkeypatch.setattr(sys, "argv", ["agents-local-state.py", "query", "rules", "--term", "RULE-001"])
    assert local_state.main() == 0
    assert "category=rules" in capsys.readouterr().out
