from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_PATH = Path(".agents/scripts/agents-benchmark.py").resolve()


def load_module():
    spec = importlib.util.spec_from_file_location("agents_benchmark_test", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_catalog_contains_live_scenarios():
    benchmark = load_module()

    assert {
        "live-tools-benchmark-discovery",
        "live-implement-next-governance-preflight",
        "live-implement-start-complete-evidence",
        "live-wb-update-task-evidence-timeline",
        "live-wb-session-create-scripted-progress",
        "live-autonomous-agentic-folder-delivery",
        "live-wb-update-status-touch",
        "live-wb-update-link",
    } <= set(benchmark.SCENARIOS)
    assert benchmark.DEFAULT_PROFILE.model == "gpt-5.4-mini"
    assert benchmark.DEFAULT_PROFILE.reasoning_effort == "medium"
    assert benchmark.BENCHMARK_PACK_ID == "runtime-flow-live-agent-v4"


def test_fixture_roadmap_matches_agents_new_feature_heading_contract():
    benchmark = load_module()

    roadmap = benchmark._fixture_roadmap_text()

    assert f"### {benchmark.FIXTURE_FEATURE_ID} " in roadmap


def test_tool_info_validator_checks_tool_id_contract():
    benchmark = load_module()

    failures = benchmark._validate_tool_info(
        {
            "scenario_id": "live-tools-benchmark-discovery",
            "tool_id": "benchmark",
            "default_model": benchmark.DEFAULT_PROFILE.model,
            "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
        },
        Path("."),
    )

    assert failures == []
    assert "tool_id" in benchmark._tool_info_schema()["required"]


def test_live_scenario_command_uses_current_sandbox_flag(tmp_path):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-tools-benchmark-discovery"]

    command = benchmark._live_scenario_command(
        scenario,
        benchmark.DEFAULT_PROFILE,
        tmp_path,
        tmp_path / "schema.json",
        tmp_path / "output.json",
    )

    assert "--full-auto" not in command
    assert command[command.index("-s") + 1] == "workspace-write"


def test_parse_observed_tool_data_counts_errors_and_retries():
    benchmark = load_module()
    stdout = "\n".join(
        [
            '{"type":"response_item","payload":{"type":"function_call","call_id":"call_1","name":"exec_command","arguments":"{\\"cmd\\":\\"./.agents/agents tools info benchmark\\"}"}}',
            '{"type":"response_item","payload":{"type":"function_call_output","call_id":"call_1","output":"Command: ...\\nProcess exited with code 1\\n"}}',
            '{"type":"response_item","payload":{"type":"function_call","call_id":"call_2","name":"exec_command","arguments":"{\\"cmd\\":\\"./.agents/agents tools info benchmark\\"}"}}',
            '{"type":"response_item","payload":{"type":"function_call_output","call_id":"call_2","output":"Command: ...\\nProcess exited with code 0\\n"}}',
        ]
    )

    tool_calls, error_count, retry_count = benchmark._parse_observed_tool_data(stdout)

    assert len(tool_calls) == 2
    assert error_count == 1
    assert retry_count == 1
    assert tool_calls[0]["command_excerpt"] == "./.agents/agents tools info benchmark"


def test_forbidden_commands_absent_reports_manual_wb_edits():
    benchmark = load_module()
    tool_calls = [
        {
            "name": "exec_command",
            "arguments_excerpt": "",
            "command_excerpt": "apply_patch .agents/wb/session/task.md",
        }
    ]

    failures = benchmark._forbidden_commands_absent(tool_calls, ("apply_patch",))

    assert failures == ["forbidden tool command observed: apply_patch"]


def test_live_scenario_command_keeps_agents_dir_writable_mount(tmp_path):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-implement-start-complete-evidence"]
    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir(parents=True, exist_ok=True)
    schema_path = tmp_path / "schema.json"
    output_path = tmp_path / "output.json"

    command = benchmark._live_scenario_command(
        scenario,
        benchmark.DEFAULT_PROFILE,
        fixture_root,
        schema_path,
        output_path,
    )

    assert "--add-dir" in command
    assert command[command.index("--add-dir") + 1] == str(fixture_root / ".agents")
    assert "-C" in command
    assert command[command.index("-C") + 1] == str(fixture_root)


def test_validate_completion_accepts_done_row_with_evidence_suffix(tmp_path):
    benchmark = load_module()
    session_dir = tmp_path / ".agents" / "wb" / benchmark.FIXTURE_WORKSTREAM_ID
    session_dir.mkdir(parents=True, exist_ok=True)
    task_file = session_dir / f"{benchmark.FIXTURE_WORKSTREAM_ID}_task_01.md"
    evidence_file = session_dir / ".evidence.jsonl"

    task_file.write_text(
        "| T-01 | done | worker | Run the controlled live benchmark fixture flow. "
        "(evidence: E-20260529152307831530) |\n",
        encoding="utf-8",
    )
    evidence_file.write_text(
        '{"command": "live benchmark fixture command", "result": "passed"}\n',
        encoding="utf-8",
    )

    failures = benchmark._validate_completion(
        {
            "task_id": "T-01",
            "completed": True,
            "evidence_recorded": True,
        },
        tmp_path,
    )

    assert failures == []


def test_run_suite_aggregates_results_and_writes_output(tmp_path):
    benchmark = load_module()

    def fake_executor(scenario, profile):
        return {
            "id": scenario.id,
            "backend": "live_agent",
            "pass": True,
            "duration_ms": 12,
            "context_bytes": 100,
            "prompt_bytes": 50,
            "tool_call_count": 2,
            "tool_success_count": 2,
            "tool_success_rate": 1.0,
            "error_count": 0,
            "retry_count": 0,
            "checks_total": 8,
            "checks_passed": 8,
            "accuracy": 1.0,
            "observed_tool_calls": [{"name": "exec_command", "command_excerpt": "dummy"}],
            "failure_reasons": [],
            "output_json": {"scenario_id": scenario.id},
            "output_excerpt": '{"scenario_id":"x"}',
            "stdout_excerpt": "",
            "stderr_excerpt": "",
            "command": ["codex", "exec"],
        }

    output_path = tmp_path / "runtime-flow-live-agent.json"
    payload = benchmark.run_suite(
        ["live-tools-benchmark-discovery", "live-implement-next-governance-preflight"],
        benchmark.DEFAULT_PROFILE,
        output_path,
        executor=fake_executor,
    )

    assert payload["pack_id"] == "runtime-flow-live-agent-v4"
    assert payload["pass"] is True
    assert payload["scenario_count"] == 2
    assert payload["tool_call_count"] == 4
    assert payload["tool_success_count"] == 4
    assert payload["tool_success_rate"] == 1.0
    assert payload["checks_total"] == 16
    assert payload["checks_passed"] == 16
    assert payload["accuracy"] == 1.0
    assert payload["context_bytes_total"] == 200
    assert payload["prompt_bytes_total"] == 100
    assert output_path.exists()


def test_save_payload_updates_stable_snapshot_files(tmp_path):
    benchmark = load_module()
    benchmark.ROOT_DIR = tmp_path
    benchmark.RESULTS_DIR = tmp_path / ".agents" / "data" / "benchmarks" / "results"
    benchmark.BENCHMARK_SNAPSHOT_DIR = tmp_path / ".agents" / "benchmarks"
    benchmark.CURRENT_RESULTS_FILE = benchmark.BENCHMARK_SNAPSHOT_DIR / "current-results.json"
    benchmark._timestamp_slug = lambda: "20260424_120000"

    payload = {
        "pack_id": benchmark.BENCHMARK_PACK_ID,
        "generated_at": "2026-04-24T15:00:00Z",
        "benchmark_profile": benchmark.DEFAULT_PROFILE.to_dict(),
        "scenario_count": 2,
        "pass": True,
        "duration_ms": 200,
        "tool_call_count": 4,
        "tool_success_count": 4,
        "error_count": 0,
        "retry_count": 0,
        "checks_total": 10,
        "checks_passed": 10,
        "context_bytes_total": 120,
        "prompt_bytes_total": 80,
        "accuracy": 1.0,
        "tool_success_rate": 1.0,
        "scenarios": [
            {
                "id": "s1",
                "pass": True,
                "duration_ms": 110,
                "tool_call_count": 2,
                "checks_total": 5,
                "checks_passed": 5,
                "error_count": 0,
                "retry_count": 0,
            },
            {
                "id": "s2",
                "pass": True,
                "duration_ms": 90,
                "tool_call_count": 2,
                "checks_total": 5,
                "checks_passed": 5,
                "error_count": 0,
                "retry_count": 0,
            },
        ],
    }

    saved_path = benchmark._save_payload(payload)
    assert saved_path.exists()

    current_snapshot_path = benchmark.CURRENT_RESULTS_FILE
    pack_snapshot_path = benchmark.BENCHMARK_SNAPSHOT_DIR / "runtime-flow-live-agent-v4-latest.json"
    assert current_snapshot_path.exists()
    assert pack_snapshot_path.exists()

    current_snapshot = json.loads(current_snapshot_path.read_text(encoding="utf-8"))
    pack_snapshot = json.loads(pack_snapshot_path.read_text(encoding="utf-8"))
    assert current_snapshot == pack_snapshot
    assert current_snapshot["saved_result_path"] == str(saved_path.relative_to(tmp_path))
    assert current_snapshot["summary"]["scenario_count"] == 2
    assert current_snapshot["summary"]["duration_ms"] == 200
    assert current_snapshot["efficiency"]["duration_ms_per_scenario"] == 100.0
    assert current_snapshot["efficiency"]["checks_per_second"] == 50.0
    assert current_snapshot["efficiency"]["tool_calls_per_second"] == 20.0
    assert current_snapshot["efficiency"]["bytes_per_second"] == 1000.0
    assert current_snapshot["efficiency"]["bytes_per_tool_call"] == 50.0
    comparison = current_snapshot["comparison_to_previous"]
    assert comparison["status"] == "unavailable"
    assert comparison["reason"] == "no_previous_saved_snapshot"
    assert comparison["delta"] == {}
    assert comparison["delta_pct"] == {}
    assert comparison["trend"] == {}


def test_save_payload_adds_comparison_against_previous_snapshot(tmp_path):
    benchmark = load_module()
    benchmark.ROOT_DIR = tmp_path
    benchmark.RESULTS_DIR = tmp_path / ".agents" / "data" / "benchmarks" / "results"
    benchmark.BENCHMARK_SNAPSHOT_DIR = tmp_path / ".agents" / "benchmarks"
    benchmark.CURRENT_RESULTS_FILE = benchmark.BENCHMARK_SNAPSHOT_DIR / "current-results.json"
    timestamps = iter(("20260424_120000", "20260424_120500"))
    benchmark._timestamp_slug = lambda: next(timestamps)

    first_payload = {
        "pack_id": benchmark.BENCHMARK_PACK_ID,
        "generated_at": "2026-04-24T15:00:00Z",
        "benchmark_profile": benchmark.DEFAULT_PROFILE.to_dict(),
        "scenario_count": 2,
        "pass": True,
        "duration_ms": 200,
        "tool_call_count": 4,
        "tool_success_count": 4,
        "error_count": 0,
        "retry_count": 0,
        "checks_total": 10,
        "checks_passed": 10,
        "context_bytes_total": 120,
        "prompt_bytes_total": 80,
        "accuracy": 1.0,
        "tool_success_rate": 1.0,
        "scenarios": [
            {
                "id": "s1",
                "pass": True,
                "duration_ms": 110,
                "tool_call_count": 2,
                "checks_total": 5,
                "checks_passed": 5,
                "error_count": 0,
                "retry_count": 0,
            },
            {
                "id": "s2",
                "pass": True,
                "duration_ms": 90,
                "tool_call_count": 2,
                "checks_total": 5,
                "checks_passed": 5,
                "error_count": 0,
                "retry_count": 0,
            },
        ],
    }

    first_saved_path = benchmark._save_payload(first_payload)
    second_payload = dict(first_payload)
    second_payload.update(
        {
            "generated_at": "2026-04-24T15:05:00Z",
            "duration_ms": 180,
            "tool_call_count": 3,
            "tool_success_count": 3,
            "tool_success_rate": 0.95,
            "error_count": 1,
            "checks_passed": 9,
            "accuracy": 0.9,
            "context_bytes_total": 100,
            "prompt_bytes_total": 70,
        }
    )
    benchmark._save_payload(second_payload)

    current_snapshot = json.loads(benchmark.CURRENT_RESULTS_FILE.read_text(encoding="utf-8"))
    comparison = current_snapshot["comparison_to_previous"]
    assert comparison["status"] == "comparable"
    assert comparison["reason"] == "same_pack_and_scenarios"
    assert comparison["baseline_saved_result_path"] == str(first_saved_path.relative_to(tmp_path))
    assert comparison["delta"]["duration_ms"] == -20
    assert comparison["delta"]["tool_call_count"] == -1
    assert comparison["delta"]["tool_success_rate"] == -0.05
    assert comparison["delta"]["error_count"] == 1
    assert comparison["delta"]["accuracy"] == -0.1
    assert comparison["delta"]["context_bytes_total"] == -20
    assert comparison["delta"]["prompt_bytes_total"] == -10
    assert comparison["trend"]["duration_ms"] == "improved"
    assert comparison["trend"]["tool_call_count"] == "improved"
    assert comparison["trend"]["tool_success_rate"] == "regressed"
    assert comparison["trend"]["error_count"] == "regressed"
    assert comparison["trend"]["accuracy"] == "regressed"
    assert comparison["trend"]["context_bytes_total"] == "improved"
    assert comparison["trend"]["prompt_bytes_total"] == "improved"


def test_validate_scenario_ids_rejects_unknown_ids():
    benchmark = load_module()

    try:
        benchmark._validate_scenario_ids(["missing-scenario"])
    except ValueError as exc:
        assert "Unknown benchmark scenario" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_print_show_compact_json_by_default(capsys):
    benchmark = load_module()
    scenario_id = next(iter(benchmark.SCENARIOS))
    benchmark._print_show(scenario_id, pretty=False)
    output = capsys.readouterr().out.strip()
    assert output.startswith("{")
    assert "\n" not in output


def test_main_run_emits_compact_json(monkeypatch, capsys):
    benchmark = load_module()

    def fake_run_suite(_ids, _profile, _output, executor=None):
        _ = executor
        return {
            "pack_id": benchmark.BENCHMARK_PACK_ID,
            "generated_at": "2026-05-14T00:00:00Z",
            "benchmark_profile": benchmark.DEFAULT_PROFILE.to_dict(),
            "scenario_count": 0,
            "pass": True,
            "duration_ms": 0,
            "tool_call_count": 0,
            "tool_success_count": 0,
            "error_count": 0,
            "retry_count": 0,
            "checks_total": 0,
            "checks_passed": 0,
            "context_bytes_total": 0,
            "prompt_bytes_total": 0,
            "accuracy": 1.0,
            "tool_success_rate": 0.0,
            "scenarios": [],
        }

    monkeypatch.setattr(benchmark, "run_suite", fake_run_suite)
    code = benchmark.main(["run"])
    output = capsys.readouterr().out.strip()
    assert code == 0
    assert output.startswith("{")
    assert "\n" not in output
