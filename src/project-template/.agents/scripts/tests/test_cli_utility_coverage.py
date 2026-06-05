import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1]


def load_module(module_name: str, file_name: str):
    script_path = SCRIPTS_DIR / file_name
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


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")


def make_pattern(
    base: Path, subdir: str, name: str, pattern_id: str, status: str = "active"
) -> Path:
    path = base / subdir / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "---\n"
        f"id: {pattern_id}\n"
        "type: success\n"
        f"status: {status}\n"
        'effectiveness: "medium"\n'
        "tags: [testing, process]\n"
        'updated_at: "2026-01-01T00:00:00Z"\n'
        "---\n\n"
        "# Pattern\n\n"
        "## Context\n"
        "Use when tests need structure.\n\n"
        "## Pattern\n"
        "Create small focused checks.\n",
        encoding="utf-8",
    )
    return path


def tool_catalog() -> dict:
    return {
        "version": "1",
        "updated_at": "2026-01-01T00:00:00Z",
        "description": "Test tool catalog",
        "tools": [
            {
                "id": "doctor",
                "name": "Agents Doctor",
                "type": "validation",
                "tool": "agents-doctor.py",
                "wrapper_command": ".agents/agents doctor",
                "just_command": "just doctor",
                "execution_mode": "on-demand",
                "updated_at": "2026-01-01",
                "description": "Validate repository state",
                "when_to_use": ["Validate docs and sessions"],
                "commands": [{"name": "run", "description": "Run doctor", "usage": "doctor"}],
                "options": ["--fix"],
                "checks": ["frontmatter"],
                "task_markers": {"done": "[x]"},
            },
            {
                "id": "wb-update",
                "name": "Workbench Update",
                "type": "automation",
                "tool": "agents-wb-update.py",
                "wrapper_command": ".agents/agents wb-update",
                "just_command": "just wb-update",
                "execution_mode": "on-demand",
                "updated_at": "2026-01-01",
                "description": "Automate workbench maintenance",
                "when_to_use": ["Automate session updates"],
                "commands": [
                    {"name": "touch", "description": "Touch docs", "usage": "wb-update touch"}
                ],
            },
        ],
        "tool_categories": {
            "validation": {"tools": ["doctor"]},
            "automation": {"tools": ["wb-update"]},
        },
        "justfile_targets": {"doctor": "just doctor", "wb-update": "just wb-update"},
        "justfile_aliases": {"dr": "doctor", "wb": "wb-update"},
        "execution_modes": {"on-demand": {"tools": ["doctor", "wb-update"]}},
    }


def test_agents_index_scans_generates_and_runs_main(tmp_path, monkeypatch, capsys):
    agents_index = load_module("agents_index_coverage_test", "agents-index.py")
    specs = tmp_path / "docs" / "arc" / "SPECS"
    decisions = tmp_path / "docs" / "arc" / "DECISIONS"
    specs.mkdir(parents=True)
    decisions.mkdir(parents=True)
    (specs / "TEMPLATE_spec.md").write_text("---\nid: skip\n---\n", encoding="utf-8")
    (specs / "260101_0100_test_spec_01.md").write_text(
        "---\n"
        'id: "260101_0100_test_spec_01"\n'
        "theme: Testing\n"
        "status: active\n"
        "owners: [agent]\n"
        'created_at: "2026-01-01T01:00:00Z"\n'
        "links:\n"
        "  roadmap: F-01\n"
        "---\n\n# Spec\n",
        encoding="utf-8",
    )
    (decisions / "260101_0200_test_adr_01.md").write_text(
        "---\n"
        'id: "260101_0200_test_adr_01"\n'
        "topic: Decision\n"
        "status: final\n"
        "owners: [architect]\n"
        'created: "2026-01-01T02:00:00Z"\n'
        "---\n\n# ADR\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(agents_index, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(agents_index, "SPECS_DIR", specs)
    monkeypatch.setattr(agents_index, "DECISIONS_DIR", decisions)

    entries = agents_index.scan_docs(specs, "*.md")
    assert len(entries) == 1
    assert entries[0].to_markdown_row().startswith("| 260101_0100_test_spec_01 |")
    assert "F-01" in agents_index.generate_index(entries, "spec")

    monkeypatch.setattr(sys, "argv", ["agents-index.py"])
    agents_index.main()
    assert (specs / "INDEX.md").exists()
    assert (decisions / "INDEX.md").exists()

    monkeypatch.setattr(sys, "argv", ["agents-index.py", "--dry-run"])
    agents_index.main()
    assert "DRY RUN" in capsys.readouterr().out


def test_agents_patterns_load_filter_apply_rate_and_cli(tmp_path, monkeypatch, capsys):
    patterns = load_module("agents_patterns_coverage_test", "agents-patterns.py")
    pattern_root = tmp_path / "patterns"
    pattern_file = make_pattern(pattern_root, "success", "test_pattern.md", "PAT-001")
    make_pattern(pattern_root, "anti", "deprecated_pattern.md", "PAT-002", status="deprecated")
    (pattern_root / "success" / "TEMPLATE_skip.md").write_text(
        "---\nid: skip\n---\n", encoding="utf-8"
    )
    active = tmp_path / ".active_session"
    active.write_text("260101_0100_active\n", encoding="utf-8")
    calls: list[list[str]] = []

    monkeypatch.setattr(patterns, "PATTERNS_DIR", pattern_root)
    monkeypatch.setattr(patterns, "ACTIVE_SESSION_FILE", active)
    monkeypatch.setattr(patterns, "TELEMETRY_SCRIPT", tmp_path / "agents-telemetry.py")
    monkeypatch.setattr(
        patterns.subprocess,
        "run",
        lambda cmd, **kwargs: (
            calls.append(cmd) or SimpleNamespace(returncode=0, stdout="", stderr="")
        ),
    )
    monkeypatch.setattr(patterns, "get_iso_timestamp", lambda: "2026-02-02T00:00:00Z")

    assert patterns.get_active_session() == "260101_0100_active"
    assert patterns.parse_frontmatter(pattern_file.read_text(encoding="utf-8"))["tags"] == [
        "testing",
        "process",
    ]
    assert patterns.load_pattern(tmp_path / "missing.md") is None
    assert len(patterns.scan_patterns()) == 2
    assert [p["id"] for p in patterns.list_patterns(status="active")] == ["PAT-001"]
    assert patterns.suggest_patterns(theme="testing-flow", tags=["testing"])[0]["id"] == "PAT-001"
    assert patterns.show_pattern("PAT-001")["body"].startswith("# Pattern")
    assert patterns.apply_pattern("PAT-001") is True
    assert len(calls) == 2
    assert patterns.apply_pattern("missing", session_id="session") is False
    assert patterns.rate_pattern("PAT-001", "high") is True
    assert 'effectiveness: "high"' in pattern_file.read_text(encoding="utf-8")
    assert patterns.rate_pattern("PAT-001", "bad") is False

    patterns.print_pattern_table(patterns.scan_patterns())
    patterns.print_pattern_detail(patterns.show_pattern("PAT-001"))
    assert "PATTERN: PAT-001" in capsys.readouterr().out

    for argv in (
        ["agents-patterns.py", "list", "--status", "active"],
        ["agents-patterns.py", "suggest", "--theme", "testing", "--tags", "testing"],
        ["agents-patterns.py", "show", "PAT-001"],
        ["agents-patterns.py", "apply", "PAT-001", "--session", "session"],
        ["agents-patterns.py", "rate", "PAT-001", "--effectiveness", "low"],
        ["agents-patterns.py"],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        patterns.main()

    monkeypatch.setattr(sys, "argv", ["agents-patterns.py", "show", "missing"])
    with pytest.raises(SystemExit):
        patterns.main()


def test_structure_mapper_scans_cache_generates_and_cli(tmp_path, monkeypatch):
    struct = load_module("agents_structure_map_coverage_test", "agents-structure-map.py")
    project = tmp_path / "project"
    output = project / "docs" / "arc" / "structure"
    (project / "components").mkdir(parents=True)
    (project / "services").mkdir()
    (project / "types").mkdir()
    (project / "tests").mkdir()
    (project / "data").mkdir()
    (project / "node_modules").mkdir()
    (project / ".agents" / "tools" / "uv").mkdir(parents=True)
    (project / "components" / "HomePage.tsx").write_text(
        "export function HomePage() {}\n", encoding="utf-8"
    )
    (project / "services" / "UserService.py").write_text(
        "def run():\n    return True\n", encoding="utf-8"
    )
    (project / "types" / "UserTypes.ts").write_text("type User = {}\n", encoding="utf-8")
    (project / "tests" / "test_app.py").write_text(
        "def test_app():\n    assert True\n", encoding="utf-8"
    )
    (project / "data" / "config.json").write_text("{}\n", encoding="utf-8")
    (project / "node_modules" / "skip.py").write_text("skip\n", encoding="utf-8")
    (project / ".agents" / "tools" / "uv" / "skip.py").write_text("skip\n", encoding="utf-8")

    mapper = struct.StructureMapper(project, output)
    assert mapper.classify_file("tests/test_app.py", ".py") == "tests"
    assert mapper.generate_description(
        struct.FileInfo("", "services/UserService.py", 1, 1.0, ".py", "backend")
    ).startswith("Service")
    assert mapper.count_lines(project / "services" / "UserService.py") == 2
    assert mapper.get_file_size_kb(project / "services" / "UserService.py") > 0
    assert mapper.compute_file_hash(project / "services" / "UserService.py")
    sections = mapper.scan_files()
    assert set(sections) >= {"frontend", "backend", "types", "tests", "data"}
    assert ".agents/tools/uv/skip.py" not in mapper.cache["files"]
    mapper.run()
    assert (output / "README.md").exists()
    assert (output / struct.CACHE_FILE).exists()

    second = struct.StructureMapper(project, output)
    second.load_cache()
    assert second.cache["files"]
    (output / struct.CACHE_FILE).write_text("{bad json", encoding="utf-8")
    second.load_cache()
    assert second.cache == {}

    monkeypatch.setattr(sys, "argv", ["agents-structure-map.py"])
    with pytest.raises(SystemExit) as exc:
        struct.main()
    assert exc.value.code == 1

    cli_output = project / "docs" / "arc" / "structure-cli"
    monkeypatch.setattr(
        sys, "argv", ["agents-structure-map.py", str(project), "--output", str(cli_output)]
    )
    struct.main()
    assert (cli_output / "README.md").exists()


def test_structure_mapper_scan_uses_single_pass_metrics(tmp_path, monkeypatch):
    struct = load_module("agents_structure_map_single_pass_test", "agents-structure-map.py")
    project = tmp_path / "project"
    output = project / "docs" / "map" / "structure"
    (project / "services").mkdir(parents=True)
    (project / "services" / "UserService.py").write_text(
        "def run():\n    return True\n", encoding="utf-8"
    )

    mapper = struct.StructureMapper(project, output)

    monkeypatch.setattr(
        mapper,
        "count_lines",
        lambda _path: (_ for _ in ()).throw(
            AssertionError("legacy count_lines path should not run")
        ),
    )
    monkeypatch.setattr(
        mapper,
        "get_file_size_kb",
        lambda _path: (_ for _ in ()).throw(AssertionError("legacy size path should not run")),
    )
    monkeypatch.setattr(
        mapper,
        "compute_file_hash",
        lambda _path: (_ for _ in ()).throw(AssertionError("legacy hash path should not run")),
    )

    sections = mapper.scan_files()
    assert "backend" in sections
    assert sections["backend"].files[0].lines == 2


def test_tools_catalog_display_validation_and_cli(monkeypatch, capsys):
    tools = load_module("agents_tools_coverage_test", "agents-tools.py")
    catalog = tool_catalog()
    monkeypatch.setattr(tools, "load_tools", lambda: catalog)
    monkeypatch.setattr(
        tools.subprocess,
        "run",
        lambda cmd: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )

    assert tools.format_type_badge("validation").startswith("[")
    assert "automat" in tools.expand_query_terms("automate")
    assert tools.list_tools(catalog, "validation") is True
    assert tools.list_tools(catalog, "missing") is False
    assert tools.show_tool_info(catalog, "doctor") is True
    assert tools.show_tool_info(catalog, "missing") is False
    tools.search_tools(catalog, "automacao")
    tools.show_help()
    assert tools.validate_catalog(catalog) == 0
    assert tools.validate_catalog({"tools": []}) == 1
    assert "Catalog Validation" in capsys.readouterr().out

    for argv in (
        ["agents-tools.py"],
        ["agents-tools.py", "help"],
        ["agents-tools.py", "list", "--type", "validation"],
        ["agents-tools.py", "info", "doctor"],
        ["agents-tools.py", "search", "validate"],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        tools.main()

    for argv in (
        ["agents-tools.py", "validate"],
        ["agents-tools.py", "smoke"],
        ["agents-tools.py", "info"],
        ["agents-tools.py", "unknown"],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        with pytest.raises(SystemExit):
            tools.main()


def test_tools_smoke_runner_success_and_failure(monkeypatch, capsys):
    smoke = load_module("agents_tools_smoke_coverage_test", "agents-tools-smoke.py")
    wrapper = Path("/tmp/fake-agents")
    original_exists = Path.exists
    monkeypatch.setattr(smoke, "WRAPPER", wrapper)
    monkeypatch.setattr(
        Path, "exists", lambda self: False if self == wrapper else original_exists(self)
    )

    assert smoke.main() == 1
    assert "wrapper not found" in capsys.readouterr().out

    monkeypatch.setattr(
        Path, "exists", lambda self: True if self == wrapper else original_exists(self)
    )

    def fake_run(cmd, cwd, capture_output, text):
        if "missing-tool" in cmd:
            return SimpleNamespace(returncode=1, stdout="Tool not found", stderr="")
        if "not-a-type" in cmd:
            return SimpleNamespace(returncode=1, stdout="Unknown type", stderr="")
        return SimpleNamespace(
            returncode=0,
            stdout="AGENTS TOOLS - Available Tools wb-update doctor lint-docs TOOL: Agents Doctor CHECKS TOOL: Agents Runtime Flow Benchmark benchmark run SUBCOMMANDS normalize-time Catalog Validation Catalog is valid AGENTS TOOLS - Help validate",
            stderr="",
        )

    monkeypatch.setattr(smoke.subprocess, "run", fake_run)
    assert smoke.run_case((["fake", "tools", "list"], 0, ["AGENTS TOOLS"]))[0] is True
    assert smoke.run_case((["fake", "tools", "bad"], 0, ["missing-token"]))[0] is False
    assert smoke.main() == 0
    assert "tools smoke passed" in capsys.readouterr().out

    def fake_run_failure(cmd, cwd, capture_output, text):
        return SimpleNamespace(returncode=2, stdout="broken", stderr="boom")

    monkeypatch.setattr(smoke.subprocess, "run", fake_run_failure)
    assert smoke.main() == 1
    failure_output = capsys.readouterr().out
    assert "tools smoke failed" in failure_output
    assert "expected exit" in failure_output


def test_telemetry_storage_reports_heat_and_cli(tmp_path, monkeypatch, capsys):
    telemetry = load_module("agents_telemetry_coverage_test", "agents-telemetry.py")
    events_file = tmp_path / "events.jsonl"
    schema_file = tmp_path / "event.json"
    active = tmp_path / ".active_session"
    active.write_text("active-session\n", encoding="utf-8")
    monkeypatch.setattr(telemetry, "TELEMETRY_EVENTS_FILE", events_file)
    monkeypatch.setattr(telemetry, "TELEMETRY_SCHEMA_PATH", schema_file)
    monkeypatch.setattr(telemetry, "TELEMETRY_DATA_DIR", tmp_path)
    monkeypatch.setattr(telemetry, "ACTIVE_SESSION_FILE", active)
    monkeypatch.setattr(telemetry, "get_iso_timestamp", lambda: "2026-04-12T12:00:00Z")

    assert telemetry.load_schema() == {}
    schema_file.write_text('{"type":"object"}', encoding="utf-8")
    assert telemetry.load_schema()["type"] == "object"
    assert telemetry.validate_event(
        {"timestamp": "x", "event_type": "tool_exec", "session_id": "s"}
    )
    assert not telemetry.validate_event({"event_type": "tool_exec", "session_id": "s"})
    assert not telemetry.validate_event({"timestamp": "x", "event_type": "bad", "session_id": "s"})
    assert telemetry.get_active_session() == "active-session"

    event = telemetry.record_event(
        "tool_exec", metadata={"tool_name": "doctor", "outcome": "success"}
    )
    assert event["session_id"] == "active-session"
    loaded = telemetry.load_events(event_type="tool_exec", session_id="active-session")
    assert len(loaded) == 1

    now = datetime.now(timezone.utc)
    rows = [
        {
            "timestamp": (now - timedelta(minutes=30)).isoformat().replace("+00:00", "Z"),
            "event_type": "session_start",
            "session_id": "s1",
            "event_id": "1",
            "metadata": {},
            "context": {},
        },
        {
            "timestamp": (now - timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
            "event_type": "session_end",
            "session_id": "s1",
            "event_id": "2",
            "metadata": {"outcome": "success"},
            "context": {},
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event_type": "tool_exec",
            "session_id": "s1",
            "event_id": "3",
            "metadata": {"tool_name": "doctor", "outcome": "success"},
            "context": {},
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event_type": "pattern_applied",
            "session_id": "s1",
            "event_id": "4",
            "metadata": {"pattern_id": "PAT-001", "outcome": "failure"},
            "context": {},
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event_type": "element_view",
            "session_id": "s1",
            "event_id": "5",
            "metadata": {"element_id": "doc", "element_type": "document", "outcome": "success"},
            "context": {},
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event_type": "blocker",
            "session_id": "s1",
            "event_id": "6",
            "metadata": {"blocker_reason": "blocked", "outcome": "skipped"},
            "context": {},
        },
        {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "event_type": "error",
            "session_id": "s1",
            "event_id": "7",
            "metadata": {"outcome": "failure"},
            "context": {},
        },
    ]
    write_jsonl(events_file, rows)

    telemetry.query_events(output_format="text")
    telemetry.query_events(output_format="json")
    telemetry.query_events(output_format="csv")
    telemetry.export_events(str(tmp_path / "export.json"), "json")
    telemetry.export_events(str(tmp_path / "export.csv"), "csv")
    report = telemetry.generate_report("weekly")
    assert report["summary"]["total_events"] == 7
    telemetry.print_report(report)
    assert telemetry.validate_telemetry() is True
    heat = telemetry.calculate_heat_scores("weekly")
    assert heat["summary"]["total_elements"] == 3
    telemetry.print_heat_map(heat, output_format="json")
    telemetry.print_heat_map(heat, min_score=0)
    telemetry.print_heat_elements(heat["all"])
    telemetry.print_heat_elements([], output_format="text")
    telemetry.print_heat_elements(heat["all"], output_format="json")
    assert "TELEMETRY REPORT" in capsys.readouterr().out

    for argv in (
        ["agents-telemetry.py", "query", "--format", "json"],
        ["agents-telemetry.py", "export", "--format", "csv", "--output", str(tmp_path / "cli.csv")],
        ["agents-telemetry.py", "report", "--format", "json"],
        ["agents-telemetry.py", "heat", "--format", "json"],
        ["agents-telemetry.py", "hot", "--format", "json"],
        ["agents-telemetry.py", "cold", "--format", "json"],
        ["agents-telemetry.py"],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        telemetry.main()

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "agents-telemetry.py",
            "record",
            "tool_exec",
            "--metadata",
            '{"tool_name":"lint"}',
            "--outcome",
            "success",
        ],
    )
    telemetry.main()
    monkeypatch.setattr(sys, "argv", ["agents-telemetry.py", "validate"])
    with pytest.raises(SystemExit):
        telemetry.main()


def test_check_links_extracts_resolves_reports_and_cli(tmp_path, monkeypatch, capsys):
    links = load_module("check_links_coverage_test", "check-links.py")
    docs = tmp_path / "docs"
    docs.mkdir()
    target = docs / "target.md"
    target.write_text("# Target\n", encoding="utf-8")
    current = docs / "current.md"
    current.write_text(
        "# Current\n\n"
        "[ok](target.md)\n"
        "[missing](missing.md)\n"
        "[external](https://example.com)\n"
        '<a href="target.md">html</a>\n'
        "![img](image.png)\n"
        "```md\n[skip](missing.md)\n```\n",
        encoding="utf-8",
    )

    extracted = links.extract_links(current.read_text(encoding="utf-8"), str(current))
    assert any(link == "target.md" for _, link in extracted)
    assert links.resolve_link("https://example.com", str(current)) is None
    assert links.resolve_link("#anchor", str(current)) is None
    assert links.check_link(str(target))[0] is True
    assert links.check_link(str(docs / "missing.md")) == (False, "Target not found")
    result = links.check_path(str(current), verbose=True)
    assert result.broken_links >= 1
    links.print_report(result)
    assert "missing.md" in links.generate_fix_script(result.issues)

    output = tmp_path / "report.txt"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        sys, "argv", ["check-links.py", str(current), "--fix", "--output", str(output)]
    )
    with pytest.raises(SystemExit) as exc:
        links.main()
    assert exc.value.code == 1
    assert output.exists()
    assert "LINK CHECK REPORT" in capsys.readouterr().out


def test_lint_fix_scripts_process_files_and_cli(tmp_path, monkeypatch, capsys):
    checkboxes = load_module("fix_lint_checkboxes_coverage_test", "fix-lint-checkboxes.py")
    frontmatter = load_module("fix_lint_frontmatter_coverage_test", "fix-lint-frontmatter.py")
    doctypes = load_module("fix_lint_doctypes_coverage_test", "fix-lint-doctypes.py")
    fix_all = load_module("fix_lint_all_coverage_test", "fix-lint-all.py")

    docs = tmp_path / "docs"
    docs.mkdir()
    md = docs / "260101_0100_feature_task_01.md"
    md.write_text("# Title\n\n- [x]done\n", encoding="utf-8")
    excluded = docs / "checkbox-protocol.md"
    excluded.write_text("- [x]example\n", encoding="utf-8")

    assert md in checkboxes.find_files([str(docs)])
    assert excluded not in checkboxes.find_files([str(docs)])
    fixed, count = checkboxes.fix_checkbox_separators(md.read_text(encoding="utf-8"))
    assert count == 1
    assert "- [x] done" in fixed
    assert checkboxes.process_file(md, dry_run=True)["fixed"] == 1
    assert checkboxes.process_file(md, dry_run=False)["fixed"] == 1

    generated = frontmatter.generate_frontmatter(md, doc_type="task")
    assert "doc_type: task" in generated
    plain = docs / "plain.md"
    plain.write_text("# Plain\n", encoding="utf-8")
    assert frontmatter.add_frontmatter(plain, dry_run=True)["added"] is True
    assert not plain.read_text(encoding="utf-8").startswith("---")
    assert frontmatter.add_frontmatter(plain)["added"] is True
    assert frontmatter.add_frontmatter(plain)["error"] == "Already has frontmatter"

    typed = docs / "typed.md"
    typed.write_text("---\ndoc_type: spec-test\n---\n# Test\n", encoding="utf-8")
    assert "spec-test" in doctypes.extract_doc_types(docs)
    validator = docs / "scripts" / "agents-lint-docs.py"
    validator.parent.mkdir()
    validator.write_text("Valid: plan, task\n", encoding="utf-8")
    assert doctypes.find_validator_script(docs) == validator
    result = doctypes.update_validator(validator, {"plan", "spec-test"}, dry_run=False)
    assert result["updated"] is True
    assert "spec-test" in validator.read_text(encoding="utf-8")

    fixer = fix_all.LintFixer(str(docs), dry_run=True)
    assert md in fixer.find_files()
    assert fixer.fix_checkbox("- [x]done\n")[1] == 1
    assert fixer.has_frontmatter(plain.read_text(encoding="utf-8")) is True
    assert "doc_type:" in fixer.generate_frontmatter(docs / "new.md")
    run_doc = docs / "needs_fix.md"
    run_doc.write_text("# Needs Fix\n\n- [x]done\n", encoding="utf-8")
    assert fix_all.LintFixer(str(docs), check_only=True).run() == 1
    capsys.readouterr()
    original = run_doc.read_text(encoding="utf-8")
    assert fix_all.LintFixer(str(docs), dry_run=True).run() == 0
    dry_run_output = capsys.readouterr().out
    assert "Lint Fix - Mode: DRY RUN" in dry_run_output
    assert "Would fix 1 checkbox(es)" in dry_run_output
    assert "Run without --dry-run to apply fixes." in dry_run_output
    assert run_doc.read_text(encoding="utf-8") == original

    monkeypatch.setattr(sys, "argv", ["fix-lint-checkboxes.py", "--dry-run", str(docs)])
    assert checkboxes.main() == 0
    monkeypatch.setattr(
        sys, "argv", ["fix-lint-frontmatter.py", "--dry-run", str(docs / "missing.txt"), str(plain)]
    )
    assert frontmatter.main() == 0
    monkeypatch.setattr(sys, "argv", ["fix-lint-doctypes.py", "--dry-run", "--base-dir", str(docs)])
    assert doctypes.main() == 0
    monkeypatch.setattr(sys, "argv", ["fix-lint-all.py", "--dry-run", str(docs)])
    assert fix_all.main() == 0


def test_sync_agent_docs_hash_status_force_and_noninteractive(tmp_path, monkeypatch, capsys):
    sync_docs = load_module("sync_agent_docs_coverage_test", "sync-agent-docs.py")
    source = tmp_path / "AGENTS.md"
    source.write_text("# Canonical\n", encoding="utf-8")
    target = tmp_path / "CLAUDE.md"
    monkeypatch.setattr(sync_docs, "AGENTS_FILE", source)
    monkeypatch.setattr(sync_docs, "AGENT_FILES", [target])

    expected = sync_docs.get_expected_content(target)
    assert sync_docs.compute_hash(expected) == sync_docs.compute_hash(expected)
    status = sync_docs.check_file_status(target)
    assert status["exists"] is False
    assert sync_docs.sync_files(force=True) == 0
    assert target.read_text(encoding="utf-8") == expected
    assert sync_docs.check_file_status(target)["matches"] is True

    target.write_text("# Local edit\n", encoding="utf-8")
    with patch("sys.stdin.isatty", return_value=False):
        assert sync_docs.sync_files(force=False) == 1
    sync_docs.show_diff(target, expected, target.read_text(encoding="utf-8"))
    assert sync_docs.sync_files(force=True) == 0
    assert "Sync complete" in capsys.readouterr().out

    monkeypatch.setattr(sync_docs, "AGENTS_FILE", tmp_path / "missing.md")
    assert sync_docs.sync_files(force=True) == 1


def test_fix_symlinks_targets_modes_and_failures(tmp_path, monkeypatch, capsys):
    fix_symlinks = load_module("agents_fix_symlinks_coverage_test", "agents-fix-symlinks.py")
    root = tmp_path / "repo"
    (root / ".agents" / "skills").mkdir(parents=True)
    (root / ".agents" / "rules").mkdir(parents=True)
    (root / ".agents" / "skills" / "SKILL.md").write_text("skill\n", encoding="utf-8")
    (root / ".claude" / "rules").mkdir(parents=True)

    assert fix_symlinks.parse_targets("") == {"skills", "rules"}
    assert fix_symlinks.parse_targets("skills") == {"skills"}
    with pytest.raises(ValueError):
        fix_symlinks.parse_targets("bad")
    mappings = fix_symlinks.list_mappings(root, {"skills", "rules"})
    assert any(label == ".claude/skills" for label, *_ in mappings)

    label, src, target, link_target = mappings[0]
    assert fix_symlinks.process_mapping(label, src, target, link_target, "copy", False, False) == 0
    assert target.exists()
    assert (
        fix_symlinks.process_mapping(label, src, target, link_target, "symlink", True, False) == 1
    )
    assert fix_symlinks.same_symlink(target, link_target) is False

    monkeypatch.setattr(fix_symlinks, "ROOT_DIR", root)
    monkeypatch.setattr(fix_symlinks, "AGENT_DIRS", [".claude"])
    monkeypatch.setattr(
        sys, "argv", ["agents-fix-symlinks.py", "--mode", "copy", "--targets", "skills"]
    )
    assert fix_symlinks.main() == 0
    monkeypatch.setattr(sys, "argv", ["agents-fix-symlinks.py", "--targets", "bad"])
    assert fix_symlinks.main() == 1
    assert "Completed successfully" in capsys.readouterr().out


def write_wb_doc(session: Path, doc_type: str, body: str, status: str = "active") -> Path:
    path = session / f"{session.name}_{doc_type}_01.md"
    path.write_text(
        "---\n"
        f"doc_type: {doc_type}\n"
        f"id: {session.name}_{doc_type}_01\n"
        f"theme: {session.name}\n"
        f"status: {status}\n"
        "created_at: '2026-01-01T00:00:00Z'\n"
        "updated_at: '2026-01-01T00:00:00Z'\n"
        "roadmap_feature: F-01\n"
        "links: {}\n"
        "---\n\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return path


def test_wb_update_commands_touch_status_evidence_and_task_flow(tmp_path, monkeypatch, capsys):
    wb_update = load_module("agents_wb_update_coverage_test", "agents-wb-update.py")
    wb_dir = tmp_path / ".agents" / "wb"
    wb_case_dir = wb_dir / "260101_0100_wb-update-coverage"
    wb_case_dir.mkdir(parents=True)
    active = wb_dir / ".active_session"
    active.write_text(wb_case_dir.name + "\n", encoding="utf-8")

    plan = write_wb_doc(wb_case_dir, "plan", "# Plan\n")
    task = write_wb_doc(
        wb_case_dir,
        "task",
        "# Tasks\n\n"
        "## Task List\n"
        "- [ ] T-01 Implement the thing\n"
        "- [/] T-02 Keep going\n\n"
        "## State Board\n\n"
        "| Task | State | Owner | Notes |\n"
        "|------|-------|-------|-------|\n"
        "| T-03 | pending | agent | Table task |\n",
    )
    report = write_wb_doc(
        wb_case_dir, "report", "# Report\n\n## Files Changed\n\n- stale\n", status="active"
    )
    log = write_wb_doc(wb_case_dir, "log", "# Log\n\n## Timeline\n\n- old entry\n")
    write_wb_doc(wb_case_dir, "postmortem", "# Postmortem\n", status="final")
    spec_lite = write_wb_doc(wb_case_dir, "spec-lite", "# Spec Lite\n")

    monkeypatch.setattr(wb_update, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(wb_update, "WB_DIR", wb_dir)
    monkeypatch.setattr(wb_update, "CANONICAL_WB_DIR", wb_dir)
    monkeypatch.setattr(wb_update, "ACTIVE_SESSION_FILE", active)
    monkeypatch.setattr(wb_update, "TELEMETRY_SCRIPT", tmp_path / "telemetry.py")

    def fake_run(cmd, **kwargs):
        if cmd[0] == "git":
            return SimpleNamespace(
                returncode=0,
                stdout=" M src/app.py\n?? .agents/wb/session/log.md\nR  old.py -> src/new.py\n",
                stderr="",
            )
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(wb_update.subprocess, "run", fake_run)
    monkeypatch.setattr(wb_update, "now_iso_gmt3", lambda: "2026-04-12T12:00:00-03:00")
    monkeypatch.setattr(wb_update, "now_timeline_label", lambda: "2026-04-12 12:00-03")

    assert wb_update.get_active_session_id() == wb_case_dir.name
    assert wb_update.resolve_session(None) == wb_case_dir.resolve()
    assert wb_update.resolve_session(str(wb_case_dir)) == wb_case_dir
    outside_session = tmp_path / "app" / "workbench" / "260101_0100_wrong-root"
    outside_session.mkdir(parents=True)
    with pytest.raises(FileNotFoundError):
        wb_update.resolve_session(str(outside_session))
    with pytest.raises(FileNotFoundError):
        wb_update.resolve_session("missing")
    with pytest.raises(ValueError):
        wb_update.require_explicit_session(
            SimpleNamespace(session=None, file=None, all_wb=False), "touch"
        )
    assert wb_update.latest_doc_file(wb_case_dir, "spec-child") == spec_lite
    assert wb_update.display_path(plan) == str(plan.relative_to(tmp_path))
    assert wb_update.parse_iso_timestamp("2026-01-01T00:00:00Z").tzinfo is not None
    assert wb_update.to_iso_gmt3("2026-01-01T00:00:00Z").endswith("-03:00")

    assert wb_update.touch_file(plan, "2026-04-12T12:00:00-03:00")
    assert "2026-04-12T12:00:00-03:00" in plan.read_text(encoding="utf-8")
    assert wb_update.touch_targets([plan]) == 1
    assert wb_update.normalize_timestamps(plan) is True
    assert wb_update.git_changed_files() == [
        "src/app.py",
        ".agents/wb/session/log.md",
        "src/new.py",
    ]
    assert wb_update.update_files_changed(report, include_wb=False) == 2
    assert "`src/app.py`" in report.read_text(encoding="utf-8")
    assert wb_update.set_status([report], "review") == 1
    wb_update.update_link(plan, "report", "report-id")
    assert "report-id" in plan.read_text(encoding="utf-8")
    wb_update.append_timeline(log, "new event")
    assert "new event" in log.read_text(encoding="utf-8")

    evidence = wb_update.append_evidence_record(
        wb_case_dir, "T-01", "pytest", "passed", artifacts=["coverage"], note="unit coverage"
    )
    assert evidence["id"].startswith("E-")
    wb_update.validate_evidence_reference(wb_case_dir, evidence["id"], "T-01")
    with pytest.raises(ValueError):
        wb_update.validate_evidence_reference(wb_case_dir, evidence["id"], "T-99")
    with pytest.raises(ValueError):
        wb_update.validate_evidence_reference(wb_case_dir, "E-missing", "T-01")
    with pytest.raises(ValueError):
        wb_update.append_evidence_record(wb_case_dir, "bad", "pytest", "passed")
    wb_update.update_task_markers(task, "T-01", "x", "done", evidence_id=evidence["id"])
    wb_update.update_task_markers(task, "T-03", "!", "blocked")
    assert evidence["id"] in task.read_text(encoding="utf-8")

    wb_update.cmd_touch(SimpleNamespace(session=str(wb_case_dir), file=None, all_wb=False))
    wb_update.cmd_touch(SimpleNamespace(session=None, file=str(plan), all_wb=False))
    wb_update.cmd_normalize_time(SimpleNamespace(session=str(wb_case_dir), file=None, all_wb=False))
    wb_update.cmd_files_changed(
        SimpleNamespace(session=str(wb_case_dir), report=None, include_wb=True)
    )
    wb_update.cmd_link(
        SimpleNamespace(session=str(wb_case_dir), file="plan", key="task", value="task-id")
    )
    wb_update.cmd_timeline(SimpleNamespace(session=str(wb_case_dir), message="timeline command"))
    wb_update.cmd_evidence(
        SimpleNamespace(
            session=str(wb_case_dir),
            task_id="T-02",
            command="pytest",
            result="passed",
            artifact=[],
            note=None,
        )
    )
    evidence_t2 = wb_update.append_evidence_record(
        wb_case_dir, "T-02", "pytest", "passed", artifacts=["pytest.log"], note=None
    )
    wb_update.cmd_task(
        SimpleNamespace(
            **{
                "session": str(wb_case_dir),
                "task_id": "T-02",
                "evidence_id": evidence_t2["id"],
                "mark_done": True,
                "mark_in_progress": False,
                "mark_pending": False,
                "mark_implemented": False,
                "mark_tested": False,
                "mark_problem": False,
                "mark_moved": False,
                "mark_ready": False,
                "mark_blocked": False,
                "mark_skipped": False,
            }
        )
    )
    wb_update.cmd_status(SimpleNamespace(session=str(wb_case_dir), file="report", value="final"))
    assert wb_update._report_status(wb_case_dir) == "final"
    wb_update.ensure_optional_artifacts_ready_for_report_final(wb_case_dir)

    no_post = wb_dir / "260101_0200_no-postmortem"
    no_post.mkdir()
    write_wb_doc(no_post, "report", "# Report\n", status="active")
    write_wb_doc(no_post, "brainstorm", "# Brainstorm\n", status="active")
    with pytest.raises(ValueError):
        wb_update.ensure_optional_artifacts_ready_for_report_final(no_post)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "agents-wb-update.py",
            "timeline",
            "--session",
            str(wb_case_dir),
            "--message",
            "from main",
        ],
    )
    wb_update.main()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "agents-wb-update.py",
            "status",
            "--session",
            str(no_post),
            "--file",
            "report",
            "--value",
            "final",
        ],
    )
    with pytest.raises(SystemExit):
        wb_update.main()
    assert "timeline appended" in capsys.readouterr().out


def test_lint_docs_detects_invalid_docs_skip_rules_and_main(tmp_path, monkeypatch, capsys):
    lint_docs = load_module("agents_lint_docs_coverage_test", "agents-lint-docs.py")
    docs = tmp_path / ".agents"
    docs.mkdir()
    invalid = docs / "invalid.md"
    invalid.write_text(
        "---\n"
        "doc_type: strange\n"
        "status: weird\n"
        "created_at: not-a-date\n"
        "---\n\n"
        "# Invalid\n\n"
        "- [q]bad marker\n"
        "- [x]missing sep\n\n"
        "## State Board\n\n"
        "| Task | State | Owner | Notes |\n"
        "|------|-------|-------|-------|\n"
        "| T-01 | unknown | agent | Bad state |\n\n"
        "plan: '260101_0100_bad_plan_01'\n"
        "- [ ] unfinished\n",
        encoding="utf-8",
    )
    readme = docs / "README.md"
    readme.write_text("# README\n", encoding="utf-8")
    tmp_doc = docs / "tmp" / "skip.md"
    tmp_doc.parent.mkdir()
    tmp_doc.write_text("# skip\n", encoding="utf-8")
    no_frontmatter = docs / "plain.md"
    no_frontmatter.write_text("# Plain\n", encoding="utf-8")
    bad_yaml = docs / "bad-yaml.md"
    bad_yaml.write_text("---\n: bad\n---\n# Bad\n", encoding="utf-8")
    empty_yaml = docs / "empty-yaml.md"
    empty_yaml.write_text("---\n---\n# Empty\n", encoding="utf-8")
    non_map_yaml = docs / "non-map.md"
    non_map_yaml.write_text("---\n- list\n---\n# Non map\n", encoding="utf-8")

    monkeypatch.setattr(lint_docs, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(lint_docs, "AGENTS_DIR", docs)
    monkeypatch.setattr(lint_docs, "EXCLUDED_PATH_PREFIXES", ("excluded",))

    linter = lint_docs.DocLinter(fix=True)
    assert linter._extract_frontmatter("# No frontmatter")[0] is None
    assert linter._is_valid_timestamp("YYYY-MM-DDTHH:MM:SSZ") is True
    assert linter._is_placeholder_value("<status>") is True
    assert linter.should_skip_file(tmp_doc) is True
    monkeypatch.setattr(lint_docs.DocLinter, "should_skip_file", lambda self, path: path == tmp_doc)
    linter.lint_folder(docs)
    linter.stats["issues_found"] = len(linter.issues)
    messages = "\n".join(issue.message for issue in linter.issues)
    assert "Unknown doc_type" in messages
    assert "Unknown state" in messages
    assert "Missing YAML frontmatter" in messages
    assert "Frontmatter must be a YAML mapping/object" in messages
    linter.print_report()

    monkeypatch.setattr(sys, "argv", ["agents-lint-docs.py", str(docs), "--fix"])
    with pytest.raises(SystemExit) as exc:
        lint_docs.main()
    assert exc.value.code == 1
    assert "LINT REPORT" in capsys.readouterr().out


def test_doctor_run_checks_success_and_error_branches(tmp_path, monkeypatch, capsys):
    doctor_mod = load_module("agents_doctor_coverage_test", "agents-doctor.py")
    root = tmp_path / "repo"
    wb = root / ".agents" / "wb"
    templates = root / "docs" / "templates"
    arc = root / "docs" / "arc"
    specs = arc / "SPECS"
    map_dir = root / "docs" / "map"
    for path in (wb, templates, specs, arc / "DECISIONS", map_dir, root / ".claude"):
        path.mkdir(parents=True, exist_ok=True)
    (root / ".claude" / "skills").symlink_to("../.agents/skills", target_is_directory=True)
    (root / ".agents" / "skills").mkdir(parents=True, exist_ok=True)
    (root / "AGENTS.md").write_text("# Agents\n", encoding="utf-8")
    (root / "CLAUDE.md").write_text("# Claude\n", encoding="utf-8")
    template = templates / "plan.md"
    template.write_text("---\ndoc_type: plan\n---\n# Template\n", encoding="utf-8")
    doctor_wb_dir = wb / "260101_0100_doctor-session"
    doctor_wb_dir.mkdir()
    write_wb_doc(doctor_wb_dir, "task", "# Task\n\n-[x]bad\n")
    active = wb / ".active_session"
    active.write_text(doctor_wb_dir.name + "\n", encoding="utf-8")
    roadmap = arc / "GENERAL-ROADMAP.md"
    spec = specs / "260101_0100_parent_spec_01.md"
    spec.write_text("---\nid: 260101_0100_parent_spec_01\n---\n# Spec\n", encoding="utf-8")
    roadmap.write_text(
        "---\ndoc_type: roadmap\nid: roadmap_index\n---\n"
        "# Roadmap\n\n### F-01 Test\n- Governing spec: `docs/arc/SPECS/260101_0100_parent_spec_01.md`\n",
        encoding="utf-8",
    )
    for name in ("ARCHITECTURE.md", "README.md"):
        (arc / name).write_text(
            "---\ndoc_type: standard\nid: x_index\n---\n# Doc\n", encoding="utf-8"
        )
    (specs / "INDEX.md").write_text(
        "---\ndoc_type: specs_index\nid: specs_index\n---\n# Index\n", encoding="utf-8"
    )
    (arc / "DECISIONS" / "INDEX.md").write_text(
        "---\ndoc_type: adr_index\nid: adr_index\n---\n# Index\n", encoding="utf-8"
    )

    monkeypatch.setattr(doctor_mod, "ROOT_DIR", root)
    monkeypatch.setattr(doctor_mod, "TEMPLATES_DIR", templates)
    monkeypatch.setattr(doctor_mod, "REQUIRED_FOLDERS", [".agents/wb", "docs/arc"])
    monkeypatch.setattr(doctor_mod, "REQUIRED_TEMPLATES", ["plan.md", "missing.md"])
    monkeypatch.setattr(doctor_mod, "WB_DIR", wb)
    monkeypatch.setattr(doctor_mod, "ARC_DIR", arc)
    monkeypatch.setattr(doctor_mod, "ROADMAP_FILE", roadmap)
    monkeypatch.setattr(doctor_mod, "SPECS_DIR", specs)
    monkeypatch.setattr(doctor_mod, "ACTIVE_SESSION_FILE", active)
    monkeypatch.setattr(doctor_mod, "MAP_DIR", map_dir)

    doctor = doctor_mod.AgentsDoctor(fix=True)
    assert doctor.run() is False
    assert any(issue.message == "Required template missing" for issue in doctor.issues)
    bad = root / "bad.md"
    bad.write_text("---\n: bad\n---\n# Bad\n", encoding="utf-8")
    doctor.validate_frontmatter(bad)
    doctor.print_report()
    assert "VALIDATION REPORT" in capsys.readouterr().out

    monkeypatch.setattr(sys, "argv", ["agents-doctor.py"])
    with pytest.raises(SystemExit):
        doctor_mod.main()


def test_knowledge_and_memory_main_contracts(tmp_path, monkeypatch, capsys):
    knowledge = load_module("agents_knowledge_coverage_extra_test", "agents-knowledge.py")
    memory = load_module("agents_memory_coverage_extra_test", "agents-memory.py")
    root = tmp_path / "repo"
    wb = root / ".agents" / "wb"
    knowledge_wb_dir = wb / "260101_0100_knowledge"
    knowledge_wb_dir.mkdir(parents=True)
    knowledge_dir = root / "docs" / "knowledge"
    write_wb_doc(
        knowledge_wb_dir,
        "research",
        "# Research Title\n\nThis reusable testing note mentions coverage and validation.\n\nAnother coverage line.\n",
    )
    write_wb_doc(knowledge_wb_dir, "report", "# Report Title\n\nReport summary for tests.\n")

    monkeypatch.setattr(knowledge, "ROOT_DIR", root)
    monkeypatch.setattr(knowledge, "WB_DIR", wb)
    monkeypatch.setattr(knowledge, "KNOWLEDGE_DIR", knowledge_dir)
    monkeypatch.setattr(knowledge, "INDEX_FILE", knowledge_dir / "INDEX.md")
    docs = list(knowledge.iter_knowledge_docs())
    assert len(docs) == 2
    research_doc = next(doc for doc in docs if doc.doc_type == "research")
    assert knowledge.summarize_body("# H\n\n`code` summary") == "code summary"
    assert knowledge.compact_line("  a   `b`  ") == "a b"
    assert knowledge.extract_matching_snippets(research_doc.path, "coverage")
    assert knowledge.resolve_doc(research_doc.doc_id).path == research_doc.path
    assert knowledge.resolve_doc(str(research_doc.path)).path == research_doc.path

    for argv in (
        ["agents-knowledge.py", "list", "--limit", "5"],
        ["agents-knowledge.py", "search", "coverage"],
        ["agents-knowledge.py", "pull", "coverage"],
        ["agents-knowledge.py", "show", research_doc.doc_id],
        ["agents-knowledge.py", "index"],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        with pytest.raises(SystemExit) as exc:
            knowledge.main()
        assert exc.value.code == 0
    monkeypatch.setattr(sys, "argv", ["agents-knowledge.py", "show", "missing"])
    with pytest.raises(SystemExit) as exc:
        knowledge.main()
    assert exc.value.code == 1
    assert (knowledge_dir / "INDEX.md").exists()

    monkeypatch.setattr(
        memory,
        "CONFIG",
        {
            "memory": {
                "enabled": True,
                "required": False,
                "provider": "basic_memory",
                "mode": "runtime",
                "authority": "auxiliary",
                "project": "project-a",
                "workspace": "AI_notes",
            }
        },
    )
    assert memory.get_memory_config()["workspace"] == "AI_notes"
    assert memory.json_arg_block({"a": 1}).startswith("{")
    for argv in (
        ["status"],
        ["search", "coverage", "--limit", "2"],
        ["context", "coverage", "--url", "memory://note"],
        ["context", "coverage"],
        ["recent"],
        ["show", "memory://note"],
    ):
        assert memory.main(argv) == 0
    monkeypatch.setattr(memory, "CONFIG", {"memory": {"provider": "unknown"}})
    assert memory.main(["status"]) == 1
    assert "Memory Search Contract" in capsys.readouterr().out


def test_verify_tasks_report_and_main_branches(tmp_path, monkeypatch, capsys):
    verify_tasks = load_module("verify_tasks_coverage_extra_test", "verify-tasks.py")
    verify_wb_dir = tmp_path / "260101_0100_verify"
    verify_wb_dir.mkdir()
    task_file = verify_wb_dir / "260101_0100_verify_task_01.md"
    task_file.write_text("# Tasks\n\n- [ ] T-01 Finish coverage\n", encoding="utf-8")

    def result_payload(strict_mode: bool = True) -> dict:
        return {
            "session": verify_wb_dir,
            "strict_mode": strict_mode,
            "total_tasks": 2,
            "completed": 1,
            "done": 1,
            "skipped": 1,
            "moved": 1,
            "pending": 1,
            "in_progress": 1,
            "ready_for_test": 1,
            "implemented_untested": 1,
            "tested_needs_spec_validation": 0,
            "blocked": 1,
            "problem": 1,
            "task_files": [
                {
                    "file": task_file,
                    "tasks": [
                        {
                            "id": "T-01",
                            "line": 3,
                            "status": "pending",
                            "description": "Finish coverage",
                        }
                    ],
                }
            ],
            "open_tasks": [
                {
                    "file": task_file,
                    "id": "T-01",
                    "line": 3,
                    "status": "pending",
                    "description": "Finish coverage",
                }
            ],
            "issues": ["task still open"],
            "evidence_issues": [
                {
                    "task_id": "T-01",
                    "file": str(task_file),
                    "line": 3,
                    "description": "missing evidence",
                    "evidence_details": [{"type": "command", "count": 1}],
                }
            ],
            "contradictions": [
                {
                    "severity": "error",
                    "description": "conflicting report",
                    "conflicting_phrases": ["all_completed", "pending_execution"],
                }
            ],
            "temporal_issues": [{"document": task_file.name, "description": "timestamp drift"}],
            "coherence_issues": [{"severity": "error", "description": "plan mismatch"}],
            "governance_issues": [{"severity": "error", "description": "missing spec"}],
            "planning_gate_issues": [{"severity": "error", "description": "missing brainstorm"}],
            "execplan_issues": [{"severity": "error", "description": "missing section"}],
            "postmortem_issues": [{"severity": "error", "description": "missing postmortem"}],
            "artifact_utility_issues": [
                {"severity": "error", "description": "placeholder artifact"}
            ],
            "closure_issues": [{"severity": "error", "description": "missing closure"}],
            "final_doc_issues": [
                {"document": task_file.name, "line": 3, "description": "open checklist"}
            ],
        }

    verify_tasks.print_report(False, result_payload())
    failed_output = capsys.readouterr().out
    assert "Strict mode failures detected" in failed_output
    assert "missing evidence" in failed_output

    success_payload = result_payload(strict_mode=False)
    success_payload.update(
        {
            "pending": 0,
            "in_progress": 0,
            "ready_for_test": 0,
            "implemented_untested": 0,
            "tested_needs_spec_validation": 0,
            "blocked": 0,
            "problem": 0,
            "skipped": 0,
            "moved": 0,
            "open_tasks": [],
            "issues": [],
        }
    )
    verify_tasks.print_report(True, success_payload)
    assert "All tasks completed" in capsys.readouterr().out

    monkeypatch.setattr(
        verify_tasks, "verify_session", lambda path, strict=False: (True, success_payload)
    )
    monkeypatch.setattr(sys, "argv", ["verify-tasks.py", str(verify_wb_dir), "--strict"])
    with pytest.raises(SystemExit) as exc:
        verify_tasks.main()
    assert exc.value.code == 0
    assert "Task Verification Report" in capsys.readouterr().out


def test_agents_new_creates_workstream_quick_mode_and_error_branches(tmp_path, monkeypatch, capsys):
    agents_new = load_module("agents_new_coverage_extra_test", "agents-new.py")
    root = tmp_path / "repo"
    wb = root / ".agents" / "wb"
    specs = root / "docs" / "arc" / "SPECS"
    roadmap = root / "docs" / "arc" / "GENERAL-ROADMAP.md"
    wb.mkdir(parents=True)
    specs.mkdir(parents=True)
    roadmap.parent.mkdir(parents=True, exist_ok=True)
    active = wb / ".active_session"
    parent_spec = specs / "260101_0100_parent_spec_01.md"
    child_spec = specs / "260101_0100_child_spec_01.md"
    parent_spec.write_text(
        "---\nid: 260101_0100_parent_spec_01\ndoc_type: spec\n---\n# Parent\n",
        encoding="utf-8",
    )
    child_spec.write_text(
        "---\nid: 260101_0100_child_spec_01\ndoc_type: spec-child\n---\n# Child\n",
        encoding="utf-8",
    )
    roadmap.write_text(
        "# Roadmap\n\n### F-01 Coverage Feature\n- Governing spec: `docs/arc/SPECS/260101_0100_parent_spec_01.md`\n",
        encoding="utf-8",
    )
    telemetry = root / "telemetry.py"
    patterns = root / "patterns.py"
    telemetry.write_text("print('telemetry')\n", encoding="utf-8")
    patterns.write_text("print('patterns')\n", encoding="utf-8")

    monkeypatch.setattr(agents_new, "ROOT_DIR", root)
    monkeypatch.setattr(agents_new, "WB_DIR", wb)
    monkeypatch.setattr(agents_new, "CANONICAL_WB_DIR", wb)
    monkeypatch.setattr(agents_new, "ACTIVE_SESSION_FILE", active)
    monkeypatch.setattr(agents_new, "ROADMAP_FILE", roadmap)
    monkeypatch.setattr(agents_new, "SPECS_DIR", specs)
    monkeypatch.setattr(agents_new, "TEMPLATES_DIR", Path.cwd() / "docs" / "templates")
    monkeypatch.setattr(agents_new, "TELEMETRY_SCRIPT", telemetry)
    monkeypatch.setattr(agents_new, "PATTERNS_SCRIPT", patterns)
    monkeypatch.setattr(agents_new, "get_timestamp", lambda: "2026-04-12T12:00:00-03:00")
    monkeypatch.setattr(agents_new, "get_session_id", lambda theme: f"260412_1200_{theme}")

    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if "agents-patterns.py" in " ".join(map(str, cmd)) or str(patterns) in " ".join(
            map(str, cmd)
        ):
            return SimpleNamespace(returncode=0, stdout="PAT-001\n", stderr="")
        return SimpleNamespace(returncode=0, stdout="main\n", stderr="")

    monkeypatch.setattr(agents_new.subprocess, "run", fake_run)

    assert agents_new.sanitize_theme(" My__Feature!! ") == "my-feature"
    with pytest.raises(ValueError):
        agents_new.sanitize_theme("!!!")
    assert agents_new.get_config_placeholder("workflow.max_plan_lines_threshold") == "500"
    assert agents_new.get_config_placeholder("missing.value") is None
    assert "value" in agents_new.fill_template(
        "{workflow.max_plan_lines_threshold} <theme>", "id", "value", "ts"
    )
    assert agents_new._resolve_spec_reference("260101_0100_parent_spec_01") == parent_spec
    assert (
        agents_new._normalize_spec_reference(str(parent_spec), "Parent")
        == "260101_0100_parent_spec_01"
    )
    assert agents_new._roadmap_has_feature("F-01") is True

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "agents-new.py",
            "Coverage Feature",
            "--feature-id",
            "F-01",
            "--parent-spec",
            "260101_0100_parent_spec_01",
            "--spec-child",
            "--spec-test",
            "--with",
            "log",
            "--with=report",
            "--force-new",
        ],
    )
    agents_new.main()
    coverage_wb_dir = wb / "260412_1200_coverage-feature"
    assert coverage_wb_dir.exists()
    assert active.read_text(encoding="utf-8").strip() == coverage_wb_dir.name
    assert list(coverage_wb_dir.glob("*_task_*.md"))
    assert list(coverage_wb_dir.glob("*_spec-child_*.md"))
    assert list(coverage_wb_dir.glob("*_spec-test_*.md"))
    assert list(coverage_wb_dir.glob("*_report_*.md"))
    assert calls

    monkeypatch.setattr(sys, "argv", ["agents-new.py", "tiny followup", "--quick"])
    agents_new.main()
    task_file = sorted(coverage_wb_dir.glob("*_task_*.md"))[-1]
    assert "tiny-followup" in task_file.read_text(encoding="utf-8")

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "agents-new.py",
            "packed spec",
            "--feature-id",
            "F-01",
            "--parent-spec",
            "260101_0100_parent_spec_01",
            "--intent",
            "specification",
            "--pack",
            "api",
            "--into-session",
            coverage_wb_dir.name,
            "--spec",
        ],
    )
    agents_new.main()
    assert (coverage_wb_dir / "packs" / "api").exists()

    for argv in (
        ["agents-new.py"],
        ["agents-new.py", "bad", "--feature-id", "F-99", "--parent-spec", "missing"],
        [
            "agents-new.py",
            "bad",
            "--feature-id",
            "bad",
            "--parent-spec",
            "260101_0100_parent_spec_01",
        ],
        ["agents-new.py", "bad", "--feature-id", "F-01", "--parent-spec", "missing"],
        [
            "agents-new.py",
            "bad",
            "--feature-id",
            "F-01",
            "--parent-spec",
            "260101_0100_parent_spec_01",
            "--with",
            "not-real",
        ],
    ):
        monkeypatch.setattr(sys, "argv", argv)
        with pytest.raises(SystemExit):
            agents_new.main()

    assert "Creating new workstream" in capsys.readouterr().out


def test_agents_bootstrap_dry_run_and_baseline_helpers(tmp_path, monkeypatch, capsys):
    bootstrap = load_module("agents_bootstrap_coverage_extra_test", "agents-bootstrap.py")
    source = tmp_path / "source"
    target = tmp_path / "target"
    (source / ".agents" / "skills" / "local-skill").mkdir(parents=True)
    (source / ".agents" / "skills" / "local-skill" / "SKILL.md").write_text(
        "# Skill\n", encoding="utf-8"
    )
    (source / ".agents" / "skills-sync.manifest.json").write_text(
        '{"installs":[{"profile":"core"},{"profile":"dev"}]}\n',
        encoding="utf-8",
    )
    (source / "AGENTS.md").write_text("# Agents\n", encoding="utf-8")
    (source / "docs" / "templates").mkdir(parents=True)
    (source / "docs" / "templates" / "template.md").write_text(
        "ts=YYYY-MM-DDTHH:MM:SSZ\n", encoding="utf-8"
    )
    (source / "docs" / "templates" / "roadmap.md").write_text(
        'id: "ROADMAP_general"\n'
        "Feature F-01\n"
        "Feature F-02\n"
        "docs/arc/SPECS/<parent-spec-file>.md\n"
        "docs/arc/SPECS/<parent-spec-file>.md\n",
        encoding="utf-8",
    )
    (source / "docs" / "standards").mkdir(parents=True)
    target.mkdir()
    (target / "package.json").write_text(
        '{"scripts":{"test":"vitest","dev":"vite"}}', encoding="utf-8"
    )
    (target / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")

    monkeypatch.setattr(bootstrap, "ROOT_DIR", source)
    monkeypatch.setattr(bootstrap, "TEMPLATE_ROOT", source)
    monkeypatch.setattr(bootstrap, "MANDATORY_FILES_TO_COPY", [Path("AGENTS.md")])
    monkeypatch.setattr(bootstrap, "MANDATORY_DIRS_TO_COPY", [Path("docs/templates")])
    monkeypatch.setattr(bootstrap, "OPTIONAL_FILES_TO_COPY", [Path("missing.md")])
    monkeypatch.setattr(bootstrap, "ENSURE_DIRS", [Path(".agents/wb"), Path("docs/arc")])
    monkeypatch.setattr(
        bootstrap,
        "generated_baseline_content",
        lambda timestamp, install_mode: {
            Path("docs/arc/GENERAL-ROADMAP.md"): f"roadmap {timestamp} {install_mode}\n"
        },
    )
    monkeypatch.setattr(
        bootstrap, "prepare_sibling_universal_skills_checkout", lambda target, dry_run: None
    )
    monkeypatch.setattr(bootstrap, "run_post_checks", lambda target: None)

    stack = bootstrap.detect_stack(target)
    assert "Node.js (package.json)" in stack["signals"]
    assert "./.agents/tools/uv/bin/uv run --project . pytest" in stack["commands"]
    assert bootstrap.current_timestamp().endswith("Z")
    assert "ts=2026" in bootstrap.render_template(
        Path("docs/templates/template.md"), "2026-01-01T00:00:00Z"
    )
    assert (
        bootstrap.roadmap_specs_for_mode(bootstrap.INSTALL_MODE_PARTIAL)[0]["feature_id"] == "F-01"
    )
    assert "Existing Project Adoption" in bootstrap.build_partial_roadmap(
        "2026-01-01T00:00:00Z", bootstrap.PARTIAL_STARTER_PARENT_SPECS
    )
    assert "Feature F-01" in bootstrap.build_full_roadmap(
        "2026-01-01T00:00:00Z", bootstrap.FULL_STARTER_PARENT_SPECS
    )
    assert "Project Brief" in bootstrap.build_project_brief("2026-01-01T00:00:00Z")
    assert "Tech Stack" in bootstrap.build_tech_stack("2026-01-01T00:00:00Z")
    assert "Current-State Map" in bootstrap.build_current_state_map_readme("2026-01-01T00:00:00Z")
    assert "Engineering Guidelines" in bootstrap.build_engineering_guidelines(
        "2026-01-01T00:00:00Z"
    )
    assert "SPECS INDEX" in bootstrap.build_specs_index(
        "2026-01-01T00:00:00Z", bootstrap.FULL_STARTER_PARENT_SPECS
    )
    assert "ADRS INDEX" in bootstrap.build_decisions_index("2026-01-01T00:00:00Z")
    assert "Knowledge Index" in bootstrap.build_knowledge_index("2026-01-01T00:00:00Z")
    assert "SPEC:" in bootstrap.build_parent_spec(
        "2026-01-01T00:00:00Z", bootstrap.FULL_STARTER_PARENT_SPECS[0]
    )

    dst_file = target / "copied.md"
    bootstrap.safe_copy_file(source / "AGENTS.md", dst_file, force=False, dry_run=False)
    bootstrap.safe_copy_file(source / "AGENTS.md", dst_file, force=False, dry_run=False)
    dst_dir = target / "templates-copy"
    bootstrap.safe_copy_dir(
        source / "docs" / "templates",
        dst_dir,
        force=False,
        dry_run=False,
        ignore=bootstrap._ignore_default,
    )
    bootstrap.safe_copy_dir(
        source / "docs" / "templates",
        dst_dir,
        force=True,
        dry_run=True,
        ignore=bootstrap._ignore_default,
    )
    bootstrap.ensure_dirs(target, dry_run=True)
    bootstrap.ensure_justfile(target, dry_run=True)
    bootstrap.safe_write_file(target / "generated.md", "generated\n", force=False, dry_run=False)
    bootstrap.write_generated_baseline(
        target, force=False, dry_run=True, install_mode=bootstrap.INSTALL_MODE_FULL
    )
    bootstrap.write_adaptation_doc(
        target, stack, dry_run=False, install_mode=bootstrap.INSTALL_MODE_PARTIAL
    )
    assert (target / "docs" / "standards" / "bootstrap-adaptation.md").exists()
    assert bootstrap.load_local_skills_manifest()["installs"]
    assert bootstrap.local_project_skill_names() == ["local-skill"]
    assert bootstrap.profile_names_for_local_seed() == ["core", "dev"]
    checkout = target / ".agents" / "source" / "universal-skills"
    assert bootstrap.seed_repo_local_universal_skills_checkout(checkout) is True
    assert bootstrap.is_valid_universal_skills_checkout(checkout) is True

    monkeypatch.setattr(
        sys, "argv", ["agents-bootstrap.py", str(target), "--dry-run", "--skip-checks"]
    )
    assert bootstrap.main() == 0
    monkeypatch.setattr(sys, "argv", ["agents-bootstrap.py", str(source), "--dry-run"])
    assert bootstrap.main() == 1
    assert "AGENTS BOOTSTRAP" in capsys.readouterr().out
