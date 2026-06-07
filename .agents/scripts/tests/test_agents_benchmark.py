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
        "live-afol-provider-compatible-delivery",
        "live-afol-python-code-task-orchestrated",
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
            "tool_surface": "benchmark",
            "tool_id": "benchmark",
            "default_model": benchmark.DEFAULT_PROFILE.model,
            "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
        },
        Path("."),
    )

    assert failures == []
    assert "tool_surface" in benchmark._tool_info_schema()["required"]


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


def test_parse_token_usage_collects_response_usage():
    benchmark = load_module()
    stdout = "\n".join(
        [
            '{"type":"event","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}',
            '{"type":"event","payload":{"usage":{"input_tokens":12,"output_tokens":7,"total_tokens":19,"cached_input_tokens":3,"reasoning_output_tokens":2}}}',
        ]
    )

    usage = benchmark._parse_token_usage(stdout)

    assert usage["available"] is True
    assert usage["input_tokens"] == 12
    assert usage["output_tokens"] == 7
    assert usage["total_tokens"] == 19
    assert usage["cached_input_tokens"] == 3
    assert usage["reasoning_output_tokens"] == 2


def test_parse_token_usage_derives_total_when_codex_omits_it():
    benchmark = load_module()
    stdout = '{"type":"event","usage":{"input_tokens":21,"output_tokens":8,"cached_input_tokens":13}}'

    usage = benchmark._parse_token_usage(stdout)

    assert usage["available"] is True
    assert usage["total_tokens"] == 29


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


def test_live_scenario_command_keeps_afol_dir_writable_mount(tmp_path):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-afol-provider-compatible-delivery"]
    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir(parents=True, exist_ok=True)

    command = benchmark._live_scenario_command(
        scenario,
        benchmark.DEFAULT_PROFILE,
        fixture_root,
        tmp_path / "schema.json",
        tmp_path / "output.json",
    )

    assert "--add-dir" in command
    assert command[command.index("--add-dir") + 1] == str(fixture_root / ".afol")
    assert str(fixture_root / ".agents") not in command


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


def test_validate_afol_provider_delivery_accepts_afol_session(tmp_path):
    benchmark = load_module()
    session_id = "260607_1200_afol-provider-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text("# Plan\n", encoding="utf-8")
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Update runtime policy for AFOL provider-compatible state. |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id": "T-01", "command": "python3 scripts/check_afol_policy.py", "result": "passed"}\n',
        encoding="utf-8",
    )
    (tmp_path / "app").mkdir()
    (tmp_path / "scripts").mkdir()
    (tmp_path / "app" / "runtime_policy.json").write_text(
        json.dumps(
            {
                "workflow_mode": "afol",
                "mutable_state": ".afol",
                "evidence_required": True,
            }
        ),
        encoding="utf-8",
    )
    check_file = tmp_path / "scripts" / "check_afol_policy.py"
    check_file.write_text(benchmark._afol_runtime_policy_check_text(), encoding="utf-8")

    failures = benchmark._validate_afol_provider_delivery(
        {
            "scenario_id": "live-afol-provider-compatible-delivery",
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "used_afol_new": True,
            "used_afol_start": True,
            "used_afol_evidence": True,
            "used_afol_done": True,
            "task_completed": True,
            "evidence_recorded": True,
            "manual_afol_wb_edit": False,
            "created_agents_wb": False,
        },
        tmp_path,
    )

    assert failures == []


def test_collect_afol_delivery_artifacts_preserves_generated_files(tmp_path):
    benchmark = load_module()
    session_id = "260607_1200_afol-provider-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text("# Plan\n\n- Do work.\n", encoding="utf-8")
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Update runtime policy. |\n",
        encoding="utf-8",
    )
    (session_dir / f"{session_id}_log_01.md").write_text("# Log\n", encoding="utf-8")
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id":"T-01","command":"python3 scripts/check_afol_policy.py","result":"passed"}\n',
        encoding="utf-8",
    )
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "runtime_policy.json").write_text(
        '{"workflow_mode":"afol","mutable_state":".afol","evidence_required":true}\n',
        encoding="utf-8",
    )
    launcher = tmp_path / "afol"
    launcher.write_text(
        "#!/usr/bin/env bash\nprintf '%s\\n' '{\"status\":\"done\",\"session_count\":1}'\n",
        encoding="utf-8",
    )
    launcher.chmod(0o755)

    artifacts = benchmark._collect_afol_delivery_artifacts(
        {"session_id": session_id},
        tmp_path,
    )

    assert artifacts["session_id"] == session_id
    assert artifacts["session_dir"] == f".afol/wb/{session_id}"
    assert artifacts["status_json"]["status"] == "done"
    assert artifacts["plan"]["path"].endswith("_plan_01.md")
    assert artifacts["plan"]["content"].startswith("# Plan")
    assert artifacts["task"]["content"].startswith("| T-01 | done |")
    assert "check_afol_policy.py" in artifacts["evidence_jsonl"]["content"]
    assert '"mutable_state":".afol"' in artifacts["runtime_policy"]["content"]


def test_validate_code_task_planner_accepts_meaningful_afol_plan_and_task(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text(
        "# Plan\n\n"
        "## Steps\n"
        "- T-01: Implement slugify in test-code-task-project/src/text_utils.py.\n"
        "- Verify with python3 scripts/check_slugify.py.\n"
        "- Record evidence before marking T-01 done.\n\n"
        "## Closure Criteria\n"
        "- T-01 is done after passed evidence exists.\n",
        encoding="utf-8",
    )
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | pending | worker | Implement slugify(text) in test-code-task-project/src/text_utils.py and verify with python3 scripts/check_slugify.py. |\n",
        encoding="utf-8",
    )

    failures = benchmark._validate_code_task_planner(
        {
            "session_id": session_id,
            "used_afol_new": True,
            "plan_created": True,
            "task_created": True,
            "plan_mentions_slugify": True,
            "task_mentions_slugify": True,
            "plan_quality_passed": True,
            "task_quality_passed": True,
            "manual_afol_wb_edit": False,
        },
        tmp_path,
    )

    assert failures == []


def test_score_code_task_plan_quality_uses_weighted_rubric():
    benchmark = load_module()
    plan_text = (
        "# Plan\n\n"
        "## Steps\n"
        "- T-01: Implement slugify in test-code-task-project/src/text_utils.py inside .afol benchmark scope.\n"
        "- Verify with python3 scripts/check_slugify.py.\n"
        "- Record evidence before marking T-01 done.\n\n"
        "## Closure Criteria\n"
        "- T-01 is done after passed evidence exists.\n"
    )
    task_text = (
        "| T-01 | pending | worker | Implement slugify(text) in "
        "test-code-task-project/src/text_utils.py and verify with python3 scripts/check_slugify.py. |\n"
    )

    quality = benchmark._score_code_task_plan_quality(plan_text, task_text)

    assert quality["score"] == 100
    assert quality["pass"] is True
    assert sum(item["weight"] for item in quality["criteria"]) == 100


def test_score_code_task_plan_quality_penalizes_vague_artifacts():
    benchmark = load_module()

    quality = benchmark._score_code_task_plan_quality(
        "# Plan\n\n- feature_id: F-CODE\n- task: slugify\n",
        "| T-01 | pending | worker | slugify |\n",
    )

    assert quality["score"] < benchmark.CODE_TASK_PLAN_QUALITY_THRESHOLD
    assert quality["pass"] is False
    failed_ids = {item["id"] for item in quality["criteria"] if not item["passed"]}
    assert {"scope_target", "execution_path", "validation_evidence", "task_executability"} <= failed_ids
    assert "scope_target" in quality["required_failures"]


def test_validate_code_task_planner_rejects_metadata_only_plan_and_vague_task(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text(
        "# Plan\n\n- feature_id: F-CODE\n- task: slugify\n",
        encoding="utf-8",
    )
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | pending | worker | slugify |\n",
        encoding="utf-8",
    )

    failures = benchmark._validate_code_task_planner(
        {
            "session_id": session_id,
            "used_afol_new": True,
            "plan_created": True,
            "task_created": True,
            "plan_mentions_slugify": True,
            "task_mentions_slugify": True,
            "plan_quality_passed": True,
            "task_quality_passed": True,
            "manual_afol_wb_edit": False,
        },
        tmp_path,
    )

    assert "planner plan missing execution steps section" in failures
    assert "planner plan missing validation section" in failures
    assert "planner plan missing closure criteria" in failures
    assert "planner plan missing evidence guidance" in failures
    assert "planner task missing target source path" in failures
    assert "planner task missing acceptance command" in failures


def test_validate_code_task_executor_accepts_completed_slugify_task(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    project_src = tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src"
    scripts_dir = tmp_path / "scripts"
    session_dir.mkdir(parents=True, exist_ok=True)
    project_src.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Implement slugify(text) in test-code-task-project/src/text_utils.py. |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py","result":"passed","artifact":"test-code-task-project/benchmark_report.md"}\n',
        encoding="utf-8",
    )
    (project_src / "text_utils.py").write_text(
        "from __future__ import annotations\n\n"
        "import re\n\n\n"
        "def slugify(text: str) -> str:\n"
        "    lowered = text.strip().lower()\n"
        "    slug = re.sub(r'[^a-z0-9]+', '-', lowered)\n"
        "    return slug.strip('-')\n",
        encoding="utf-8",
    )
    check_file = scripts_dir / "check_slugify.py"
    check_file.write_text(benchmark._code_task_check_text(), encoding="utf-8")
    check_file.chmod(0o755)
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "benchmark_report.md").write_text(
        "# Benchmark Report\n\n"
        f"Session: {session_id}\n"
        "Task: T-01 done.\n"
        "Summary: slugify implemented in test-code-task-project/src/text_utils.py.\n"
        "Verification: python3 scripts/check_slugify.py passed.\n"
        "Evidence: recorded in AFOL ledger.\n"
        "Changed files: test-code-task-project/src/text_utils.py, test-code-task-project/benchmark_report.md.\n",
        encoding="utf-8",
    )
    benchmark._git_baseline_fixture(tmp_path)

    failures = benchmark._validate_code_task_executor(
        {
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "used_afol_start": True,
            "used_afol_evidence": True,
            "used_afol_done": True,
            "task_completed": True,
            "evidence_recorded": True,
            "report_written": True,
            "report_coherent": True,
            "task_marked_correct": True,
            "manual_afol_wb_edit": False,
            "edited_only_allowed_paths": True,
        },
        tmp_path,
    )

    assert failures == []


def test_score_code_task_delivery_quality_combines_plan_and_report_rubrics():
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    plan_text = (
        "# Plan\n\n"
        "## Steps\n"
        "- T-01: Implement slugify in test-code-task-project/src/text_utils.py inside .afol benchmark scope.\n"
        "- Verify with python3 scripts/check_slugify.py and record evidence.\n\n"
        "## Closure Criteria\n"
        "- T-01 done after evidence.\n"
    )
    task_text = (
        "| T-01 | done | worker | Implement slugify(text) in "
        "test-code-task-project/src/text_utils.py and verify with python3 scripts/check_slugify.py. |\n"
    )
    report_text = (
        "# Benchmark Report\n\n"
        f"Session: {session_id}\n"
        "Task: T-01 done.\n"
        "Summary: slugify implemented in test-code-task-project/src/text_utils.py.\n"
        "Verification: python3 scripts/check_slugify.py passed.\n"
        "Evidence: recorded in AFOL ledger.\n"
        "Changed files: test-code-task-project/src/text_utils.py, test-code-task-project/benchmark_report.md.\n"
    )
    evidence_text = (
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py",'
        '"result":"passed","artifact":"test-code-task-project/benchmark_report.md"}\n'
    )

    quality = benchmark._score_code_task_delivery_quality(
        session_id,
        plan_text,
        task_text,
        report_text,
        evidence_text,
        ["test-code-task-project/src/text_utils.py", "test-code-task-project/benchmark_report.md"],
    )

    assert quality["score"] == 100
    assert quality["pass"] is True
    assert quality["weights"] == {"plan_task": 0.4, "report_execution": 0.6}


def test_score_code_task_report_quality_fails_scope_control_gate():
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    report_text = (
        "# Benchmark Report\n\n"
        f"Session: {session_id}\n"
        "Task: T-01 done.\n"
        "Summary: slugify implemented in test-code-task-project/src/text_utils.py.\n"
        "Verification: python3 scripts/check_slugify.py passed.\n"
        "Evidence: recorded in AFOL ledger.\n"
        "Changed files: test-code-task-project/src/text_utils.py, test-code-task-project/benchmark_report.md.\n"
    )
    evidence_text = (
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py",'
        '"result":"passed","artifact":"test-code-task-project/benchmark_report.md"}\n'
    )
    task_text = (
        "| T-01 | done | worker | Implement slugify(text) in "
        "test-code-task-project/src/text_utils.py and verify with python3 scripts/check_slugify.py. |\n"
    )

    quality = benchmark._score_code_task_report_quality(
        session_id,
        report_text,
        evidence_text,
        task_text,
        ["README.md"],
    )

    assert quality["score"] == benchmark.CODE_TASK_REPORT_QUALITY_THRESHOLD
    assert quality["pass"] is False
    assert quality["required_failures"] == ["scope_control"]


def test_code_task_changed_paths_fails_closed_outside_git_repo(tmp_path):
    benchmark = load_module()

    assert benchmark._code_task_changed_paths(tmp_path) == ["<git-status-unavailable>"]


def test_validate_code_task_executor_rejects_incoherent_delivery_report(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    project_src = tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src"
    scripts_dir = tmp_path / "scripts"
    session_dir.mkdir(parents=True, exist_ok=True)
    project_src.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Implement slugify(text) in test-code-task-project/src/text_utils.py. |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py","result":"passed","artifact":"test-code-task-project/benchmark_report.md"}\n',
        encoding="utf-8",
    )
    (project_src / "text_utils.py").write_text(
        "from __future__ import annotations\n\n"
        "import re\n\n\n"
        "def slugify(text: str) -> str:\n"
        "    lowered = text.strip().lower()\n"
        "    slug = re.sub(r'[^a-z0-9]+', '-', lowered)\n"
        "    return slug.strip('-')\n",
        encoding="utf-8",
    )
    check_file = scripts_dir / "check_slugify.py"
    check_file.write_text(benchmark._code_task_check_text(), encoding="utf-8")
    check_file.chmod(0o755)
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "benchmark_report.md").write_text(
        "# Benchmark Report\n\nDone.\n",
        encoding="utf-8",
    )

    failures = benchmark._validate_code_task_executor(
        {
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "used_afol_start": True,
            "used_afol_evidence": True,
            "used_afol_done": True,
            "task_completed": True,
            "evidence_recorded": True,
            "report_written": True,
            "report_coherent": True,
            "task_marked_correct": True,
            "manual_afol_wb_edit": False,
            "edited_only_allowed_paths": True,
        },
        tmp_path,
    )

    assert f"code task report missing {session_id}" in failures
    assert "code task report missing slugify" in failures
    assert "code task report missing python3 scripts/check_slugify.py" in failures
    assert "code task report missing test-code-task-project/benchmark_report.md" in failures


def test_validate_code_task_executor_rejects_evidence_without_report_artifact(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    project_src = tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src"
    scripts_dir = tmp_path / "scripts"
    session_dir.mkdir(parents=True, exist_ok=True)
    project_src.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Implement slugify(text) in test-code-task-project/src/text_utils.py. |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py","result":"passed"}\n',
        encoding="utf-8",
    )
    (project_src / "text_utils.py").write_text(
        "from __future__ import annotations\n\n"
        "import re\n\n\n"
        "def slugify(text: str) -> str:\n"
        "    lowered = text.strip().lower()\n"
        "    slug = re.sub(r'[^a-z0-9]+', '-', lowered)\n"
        "    return slug.strip('-')\n",
        encoding="utf-8",
    )
    check_file = scripts_dir / "check_slugify.py"
    check_file.write_text(benchmark._code_task_check_text(), encoding="utf-8")
    check_file.chmod(0o755)
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "benchmark_report.md").write_text(
        "# Benchmark Report\n\n"
        f"Session: {session_id}\n"
        "Task: T-01 done.\n"
        "Summary: slugify implemented in test-code-task-project/src/text_utils.py.\n"
        "Verification: python3 scripts/check_slugify.py passed.\n"
        "Evidence: recorded in AFOL ledger.\n"
        "Changed files: test-code-task-project/src/text_utils.py, test-code-task-project/benchmark_report.md.\n",
        encoding="utf-8",
    )

    failures = benchmark._validate_code_task_executor(
        {
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "used_afol_start": True,
            "used_afol_evidence": True,
            "used_afol_done": True,
            "task_completed": True,
            "evidence_recorded": True,
            "report_written": True,
            "report_coherent": True,
            "task_marked_correct": True,
            "manual_afol_wb_edit": False,
            "edited_only_allowed_paths": True,
        },
        tmp_path,
    )

    assert "code task evidence ledger missing test-code-task-project/benchmark_report.md" in failures
    assert "code task evidence ledger missing passed T-01 report artifact record" in failures


def test_validate_code_task_executor_rejects_missing_delivery_report(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    project_src = tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src"
    scripts_dir = tmp_path / "scripts"
    session_dir.mkdir(parents=True, exist_ok=True)
    project_src.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | Implement slugify(text) in test-code-task-project/src/text_utils.py. |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id":"T-01","command":"python3 scripts/check_slugify.py","result":"passed"}\n',
        encoding="utf-8",
    )
    (project_src / "text_utils.py").write_text(
        "from __future__ import annotations\n\n"
        "import re\n\n\n"
        "def slugify(text: str) -> str:\n"
        "    lowered = text.strip().lower()\n"
        "    slug = re.sub(r'[^a-z0-9]+', '-', lowered)\n"
        "    return slug.strip('-')\n",
        encoding="utf-8",
    )
    check_file = scripts_dir / "check_slugify.py"
    check_file.write_text(benchmark._code_task_check_text(), encoding="utf-8")
    check_file.chmod(0o755)

    failures = benchmark._validate_code_task_executor(
        {
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "used_afol_start": True,
            "used_afol_evidence": True,
            "used_afol_done": True,
            "task_completed": True,
            "evidence_recorded": True,
            "report_written": True,
            "report_coherent": True,
            "task_marked_correct": True,
            "manual_afol_wb_edit": False,
            "edited_only_allowed_paths": True,
        },
        tmp_path,
    )

    assert "code task report missing" in failures


def test_collect_code_task_delivery_artifacts_preserves_prompt_fixture(tmp_path):
    benchmark = load_module()
    session_id = "260607_1300_code-task-benchmark"
    session_dir = tmp_path / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text("# Plan\n", encoding="utf-8")
    (session_dir / f"{session_id}_task_01.md").write_text("| T-01 | done | worker | slugify |\n", encoding="utf-8")
    (session_dir / ".evidence.jsonl").write_text('{"command":"python3 scripts/check_slugify.py"}\n', encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "benchmark_problem.md").write_text("# Problem\n", encoding="utf-8")
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src").mkdir(parents=True)
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "src" / "text_utils.py").write_text("def slugify(text): ...\n", encoding="utf-8")
    (tmp_path / benchmark.CODE_TASK_PROJECT_DIR / "benchmark_report.md").write_text("# Report\n", encoding="utf-8")
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "check_slugify.py").write_text("print('ok')\n", encoding="utf-8")

    artifacts = benchmark._collect_code_task_delivery_artifacts({"session_id": session_id}, tmp_path)

    assert artifacts["session_id"] == session_id
    assert artifacts["plan"]["content"].startswith("# Plan")
    assert artifacts["problem"]["path"] == "docs/benchmark_problem.md"
    assert artifacts["text_utils"]["path"].endswith("src/text_utils.py")
    assert artifacts["report"]["path"] == "test-code-task-project/benchmark_report.md"
    assert artifacts["acceptance_check"]["path"] == "scripts/check_slugify.py"


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
            "token_usage": {
                "available": True,
                "input_tokens": 6,
                "output_tokens": 3,
                "total_tokens": 9,
                "cached_input_tokens": 1,
                "reasoning_output_tokens": 2,
            },
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
    assert payload["token_usage"]["available"] is True
    assert payload["token_usage"]["total_tokens"] == 18
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


def test_save_payload_can_skip_stable_snapshot_files(tmp_path):
    benchmark = load_module()
    benchmark.ROOT_DIR = tmp_path
    benchmark.RESULTS_DIR = tmp_path / ".agents" / "data" / "benchmarks" / "results"
    benchmark.BENCHMARK_SNAPSHOT_DIR = tmp_path / ".agents" / "benchmarks"
    benchmark.CURRENT_RESULTS_FILE = benchmark.BENCHMARK_SNAPSHOT_DIR / "current-results.json"
    benchmark._timestamp_slug = lambda: "20260424_120001"

    payload = {
        "pack_id": benchmark.BENCHMARK_PACK_ID,
        "generated_at": "2026-04-24T15:00:00Z",
        "benchmark_profile": {"runtime": "codex", "model": "gpt-5.4-mini", "reasoning_effort": "low"},
        "scenario_count": 1,
        "pass": True,
        "duration_ms": 100,
        "tool_call_count": 1,
        "tool_success_count": 1,
        "error_count": 0,
        "retry_count": 0,
        "checks_total": 1,
        "checks_passed": 1,
        "context_bytes_total": 10,
        "prompt_bytes_total": 10,
        "accuracy": 1.0,
        "tool_success_rate": 1.0,
        "scenarios": [],
    }

    saved_path = benchmark._save_payload(payload, write_stable_snapshots=False)

    assert saved_path.exists()
    assert not benchmark.CURRENT_RESULTS_FILE.exists()
    assert not (benchmark.BENCHMARK_SNAPSHOT_DIR / "runtime-flow-live-agent-v4-latest.json").exists()


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


def test_main_run_accepts_profile_overrides(monkeypatch, capsys):
    benchmark = load_module()
    captured = {}

    def fake_run_suite(ids, profile, output, executor=None):
        _ = executor
        captured["ids"] = ids
        captured["profile"] = profile
        captured["output"] = output
        return {
            "pack_id": benchmark.BENCHMARK_PACK_ID,
            "generated_at": "2026-05-14T00:00:00Z",
            "benchmark_profile": profile.to_dict(),
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
    code = benchmark.main(
        [
            "run",
            "--model",
            "test-mini",
            "--reasoning-effort",
            "low",
            "live-tools-benchmark-discovery",
        ]
    )
    payload = json.loads(capsys.readouterr().out)

    assert code == 0
    assert captured["ids"] == ["live-tools-benchmark-discovery"]
    assert captured["profile"].model == "test-mini"
    assert captured["profile"].reasoning_effort == "low"
    assert payload["benchmark_profile"]["model"] == "test-mini"
    assert payload["benchmark_profile"]["reasoning_effort"] == "low"
