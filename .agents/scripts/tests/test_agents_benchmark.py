from __future__ import annotations

import importlib.util
from dataclasses import replace
import json
import subprocess
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


def write_gemini_config(tmp_path, benchmark, *, rpm=15, rpd=1500, interval_ms=0, max_requests=2):
    config_path = tmp_path / "gemini-gemma4-31b.json"
    config_path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "id": "gemini-gemma4-31b",
                "runtime": "gemini-api",
                "provider": "google-gemini",
                "model": "gemma-4-31b-it",
                "api_key_env": "GEMINI_API_KEY",
                "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                "generation": {"temperature": 0.1, "top_p": 0.95, "max_output_tokens": 8192},
                "rate_limits": {"rpm": rpm, "rpd": rpd, "min_request_interval_ms": interval_ms},
                "request_budget": {"max_requests_per_scenario": max_requests, "max_requests_per_suite": 10},
                "capabilities": {
                    "text_only": True,
                    "structured_json": True,
                    "tools": ["list_dir", "read_file", "write_file", "run_shell"],
                },
                "ledger": {"path": str(tmp_path / "gemini-rate-ledger.jsonl")},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    return config_path


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


def test_autonomous_scenario_requires_project_local_skill_without_prompt_recipe():
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-autonomous-agentic-folder-delivery"]
    prompt = scenario.prompt

    assert benchmark.AGENTIC_FOLDER_SKILL_PATH in scenario.context_artifacts
    assert benchmark.AGENTIC_FOLDER_SKILL_PATH in scenario.required_command_substrings
    assert benchmark.AGENTIC_FOLDER_SKILL_PATH not in prompt
    assert "--task" in scenario.required_command_substrings
    assert "--intent delivery" in scenario.required_command_substrings
    assert "docs/benchmark_problem.md" in prompt
    assert "Fast path:" not in prompt
    assert "at most 7 shell commands" not in prompt
    assert "./.agents/agents new" not in prompt
    assert "./.agents/agents implement start" not in prompt
    assert "./.agents/agents implement complete" not in prompt
    assert benchmark.RUNTIME_POLICY_CHECK_COMMAND not in prompt
    assert "/home/ozy/.codex" in scenario.forbidden_command_substrings
    assert "/home/ozy/.agents" in scenario.forbidden_command_substrings
    for forbidden in (
        *benchmark.BARE_AFOL_DISCOVERY_COMMANDS,
        "--help",
        "rg ",
        "find .agents/wb",
        "xargs",
        f".agents/wb/{benchmark.FIXTURE_WORKSTREAM_ID}",
        ".agents/policy.md",
        "ls -1 .agents",
        "ls -1 .agents/rules",
    ):
        assert forbidden in scenario.forbidden_command_substrings


def test_afol_fixture_scenarios_use_development_afold_launcher():
    benchmark = load_module()

    for scenario_id in benchmark.AFOL_FIXTURE_SCENARIOS:
        scenario = benchmark.SCENARIOS[scenario_id]
        command_groups = [command for group in scenario.any_required_command_groups for command in group]

        assert "afold" in scenario.context_artifacts
        assert "afol" not in scenario.context_artifacts
        assert "./afold new" in command_groups
        assert "./afold start" in command_groups
        assert "./afold evidence" in command_groups
        assert "./afold done" in command_groups
        assert "./afol " in scenario.forbidden_command_substrings
        assert "['./afol'" in scenario.forbidden_command_substrings
        assert "./afol new" not in command_groups
        assert "./afol start" not in command_groups
        assert "./afol evidence" not in command_groups
        assert "./afol done" not in command_groups


def test_afol_provider_delivery_prompt_is_not_a_lifecycle_recipe():
    benchmark = load_module()
    scenario_id = "live-afol-provider-compatible-delivery"
    prompt = benchmark.SCENARIOS[scenario_id].prompt

    assert benchmark.MAX_TOOL_CALLS_BY_SCENARIO[scenario_id] == 16
    assert "docs/benchmark_problem.md" in prompt
    assert "Expected fast path" not in prompt
    assert "at most 16 shell commands" not in prompt
    assert "Use `./afold`" not in prompt
    assert "./afold new" not in prompt
    assert "./afold start" not in prompt
    assert "./afold evidence" not in prompt
    assert "./afold done" not in prompt


def test_fixture_agents_text_points_to_project_local_skill():
    benchmark = load_module()
    agents_text = benchmark._fixture_agents_text()

    assert benchmark.AGENTIC_FOLDER_SKILL_PATH in agents_text
    assert "Do not inspect global skills" in agents_text


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


def test_benchmark_env_can_hide_bare_afol_path(tmp_path, monkeypatch):
    benchmark = load_module()
    afol_bin = tmp_path / "global-bin"
    keep_bin = tmp_path / "keep-bin"
    afol_bin.mkdir()
    keep_bin.mkdir()
    afol = afol_bin / "afol"
    afol.write_text("#!/bin/sh\n", encoding="utf-8")
    afol.chmod(0o755)
    monkeypatch.setenv("PATH", f"{afol_bin}:{keep_bin}")

    env = benchmark._benchmark_env(hide_bare_afol=True)

    assert str(afol_bin) not in env["PATH"].split(":")
    assert str(keep_bin) in env["PATH"].split(":")


def test_benchmark_env_isolates_zsh_login_shell(tmp_path, monkeypatch):
    benchmark = load_module()
    afol_bin = tmp_path / "global-bin"
    keep_bin = tmp_path / "keep-bin"
    zdotdir = tmp_path / "zdotdir"
    afol_bin.mkdir()
    keep_bin.mkdir()
    afol = afol_bin / "afol"
    afol.write_text("#!/bin/sh\n", encoding="utf-8")
    afol.chmod(0o755)
    monkeypatch.setenv("PATH", f"{afol_bin}:{keep_bin}")

    env = benchmark._benchmark_env(hide_bare_afol=True, isolated_zdotdir=zdotdir)
    completed = subprocess.run(
        ["/usr/bin/zsh", "-lc", "printf '%s\n' \"$PATH\"; command -v afol || true"],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )

    assert (zdotdir / ".zshenv").exists()
    assert str(keep_bin) in completed.stdout
    assert str(afol_bin) not in completed.stdout


def test_load_gemini_provider_config_reads_limits(tmp_path):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, rpm=15, rpd=1500, interval_ms=4100)

    config = benchmark._load_gemini_provider_config(str(config_path))

    assert config.runtime == "gemini-api"
    assert config.model == "gemma-4-31b-it"
    assert config.api_key_env == "GEMINI_API_KEY"
    assert config.rpm_limit == 15
    assert config.rpd_limit == 1500
    assert config.min_request_interval_ms == 4100
    assert config.ledger_path == tmp_path / "gemini-rate-ledger.jsonl"


def test_gemini_generation_config_uses_google_structured_output_fields(tmp_path):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark)
    config = benchmark._load_gemini_provider_config(str(config_path))
    schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": {"scenario_id": {"type": "string", "const": "live-tools-benchmark-discovery"}},
    }

    generation = benchmark._gemini_generation_config(config, schema)

    assert generation["responseMimeType"] == "application/json"
    assert generation["responseSchema"] == {
        "type": "object",
        "properties": {"scenario_id": {"type": "string", "enum": ["live-tools-benchmark-discovery"]}},
    }
    assert "responseFormat" not in generation


def test_gemini_runtime_refuses_missing_api_key(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(benchmark, "ROOT_DIR", tmp_path)

    try:
        benchmark.run_suite(["live-tools-benchmark-discovery"], profile)
    except ValueError as exc:
        assert "Missing GEMINI_API_KEY" in str(exc)
    else:
        raise AssertionError("expected missing API key failure")


def test_gemini_runtime_reads_api_key_from_env_local(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(benchmark, "ROOT_DIR", tmp_path)
    env_key = "GEMINI_API_" + "KEY"
    (tmp_path / ".env.local").write_text(f'{env_key}="local-secret-key"\n', encoding="utf-8")

    calls = []

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        calls.append({"contents": contents, "schema": schema, "tools": tools})
        assert api_key == "local-secret-key"
        if tools:
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "run_shell",
                                        "args": {"command": "./.agents/agents tools info benchmark"},
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
            }
        assert schema is not None
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": "live-tools-benchmark-discovery",
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)

    result = benchmark.run_suite(["live-tools-benchmark-discovery"], profile)

    assert result["pass"] is True
    assert result["api_request_count"] == 2
    assert result["scenarios"][0]["tool_call_count"] == 1
    assert len(calls) == 2


def test_gemini_local_env_reader_accepts_colon_format(tmp_path):
    benchmark = load_module()
    env_file = tmp_path / ".env.local"
    env_file.write_text("GEMINI_API_KEY: local-secret-key\n", encoding="utf-8")

    assert benchmark._read_local_env_value("GEMINI_API_KEY", env_file) == "local-secret-key"


def test_gemini_runtime_records_api_metrics_with_mocked_http(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")

    calls = []

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        calls.append({"contents": contents, "schema": schema, "tools": tools})
        assert config.model == "gemma-4-31b-it"
        assert "secret-test-key" == api_key
        if tools:
            assert schema is None
            initial_prompt = contents[0]["parts"][0]["text"]
            tool_names = {
                declaration["name"]
                for declaration in tools[0]["functionDeclarations"]
            }
            assert tool_names == {"list_dir", "read_file", "write_file", "run_shell"}
            assert "controlled runtime benchmark fixture" in initial_prompt
            assert "Use the provided `run_shell` tool" not in initial_prompt
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "run_shell",
                                        "args": {"command": "./.agents/agents tools info benchmark"},
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 5,
                    "candidatesTokenCount": 3,
                    "totalTokenCount": 8,
                },
            }
        assert "scenario_id" in schema["properties"]
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": "live-tools-benchmark-discovery",
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 11,
                "candidatesTokenCount": 7,
                "totalTokenCount": 18,
            },
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)

    payload = benchmark.run_suite(["live-tools-benchmark-discovery"], profile)
    scenario = payload["scenarios"][0]

    assert payload["pass"] is True
    assert payload["benchmark_profile"]["runtime"] == "gemini-api"
    assert payload["api_request_count"] == 2
    assert payload["api_rpm_limit"] == 15
    assert payload["api_rpd_limit"] == 1500
    assert payload["api_rpd_count"] == 2
    assert scenario["backend"] == "gemini_api"
    assert scenario["api_request_count"] == 2
    assert scenario["tool_call_count"] == 1
    assert scenario["tool_success_count"] == 1
    assert scenario["observed_tool_calls"][0]["command_excerpt"] == "./.agents/agents tools info benchmark"
    assert scenario["available_tools"] == ["list_dir", "read_file", "write_file", "run_shell"]
    assert scenario["agent_progress_event_count"] >= 6
    assert {"fixture_prepared", "tool_call", "tool_result", "structured_output_parsed"} <= {
        event["event"] for event in scenario["agent_progress"]
    }
    assert scenario["agent_progress"][0]["available_tools"] == ["list_dir", "read_file", "write_file", "run_shell"]
    assert isinstance(
        next(event["token_usage"] for event in scenario["agent_progress"] if event["event"] == "api_response_received"),
        dict,
    )
    assert scenario["token_usage"]["total_tokens"] == 18
    assert "secret-test-key" not in json.dumps(payload)
    assert len(calls) == 2


def test_gemini_runtime_respects_remaining_suite_request_budget(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=5)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
        api_request_budget_remaining=1,
    )
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")
    calls = []

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        calls.append({"schema": schema, "tools": tools})
        assert tools is None
        assert schema is not None
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": "live-tools-benchmark-discovery",
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1, "totalTokenCount": 2},
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)

    payload = benchmark.run_suite(["live-tools-benchmark-discovery"], profile)
    result = payload["scenarios"][0]

    assert result["api_request_count"] == 1
    assert result["tool_call_count"] == 0
    assert result["pass"] is False
    assert len(calls) == 1


def test_run_suite_passes_gemini_suite_request_budget_remaining(tmp_path):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=5)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    seen_remaining = []

    def fake_executor(scenario, scenario_profile):
        remaining = int(scenario_profile.api_request_budget_remaining)
        request_count = min(4, remaining)
        seen_remaining.append(remaining)
        return {
            "id": scenario.id,
            "backend": "gemini_api",
            "pass": True,
            "duration_ms": 12,
            "context_bytes": 100,
            "prompt_bytes": 50,
            "tool_call_count": 1,
            "tool_success_count": 1,
            "tool_success_rate": 1.0,
            "error_count": 0,
            "retry_count": 0,
            "checks_total": 8,
            "checks_passed": 8,
            "accuracy": 1.0,
            "observed_tool_calls": [{"name": "run_shell", "command_excerpt": "dummy"}],
            "failure_reasons": [],
            "output_json": {"scenario_id": scenario.id},
            "output_excerpt": '{"scenario_id":"x"}',
            "stdout_excerpt": "",
            "stderr_excerpt": "",
            "command": ["gemini-api"],
            "token_usage": {},
            "api_request_count": request_count,
        }

    payload = benchmark.run_suite(
        [
            "live-tools-benchmark-discovery",
            "live-implement-next-governance-preflight",
            "live-implement-start-complete-evidence",
        ],
        profile,
        executor=fake_executor,
    )

    assert seen_remaining == [10, 6, 2]
    assert payload["api_request_count"] == 10


def test_gemini_runtime_runs_multi_tool_completion_flow(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=5)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")

    scenario = benchmark.SCENARIOS["live-implement-start-complete-evidence"]
    commands = [
        f"{benchmark.AFOLD_COMMAND} start --session {benchmark.FIXTURE_WORKSTREAM_ID} --task-id T-01",
        (
            f"{benchmark.AFOLD_COMMAND} done --session {benchmark.FIXTURE_WORKSTREAM_ID} --task-id T-01 "
            f'--command "{benchmark.LIVE_COMPLETE_COMMAND}" --result passed '
            f"--artifact .afol/wb/{benchmark.FIXTURE_WORKSTREAM_ID}/{benchmark.FIXTURE_WORKSTREAM_ID}_task_01.md"
        ),
        f"cat .afol/wb/{benchmark.FIXTURE_WORKSTREAM_ID}/{benchmark.FIXTURE_WORKSTREAM_ID}_task_01.md",
        f"cat .afol/wb/{benchmark.FIXTURE_WORKSTREAM_ID}/.evidence.jsonl",
    ]
    calls = []

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        calls.append({"contents": contents, "schema": schema, "tools": tools})
        assert api_key == "secret-test-key"
        tool_turn = sum(1 for call in calls if call["tools"])
        if tools:
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "run_shell",
                                        "args": {"command": commands[tool_turn - 1]},
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 2, "totalTokenCount": 6},
            }
        assert schema is not None
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": scenario.id,
                                        "task_id": "T-01",
                                        "completed": True,
                                        "evidence_recorded": True,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 4, "totalTokenCount": 12},
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)

    payload = benchmark.run_suite([scenario.id], profile)
    result = payload["scenarios"][0]

    assert payload["pass"] is True
    assert result["pass"] is True
    assert result["api_request_count"] == 5
    assert result["tool_call_count"] == 4
    assert result["tool_success_count"] == 4
    assert result["output_json"]["completed"] is True
    assert result["output_json"]["evidence_recorded"] is True
    assert [call["command_excerpt"] for call in result["observed_tool_calls"]] == commands
    assert len(calls) == 5


def test_gemini_function_call_parser_and_allowlist(tmp_path):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-tools-benchmark-discovery"]
    response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "functionCall": {
                                "name": "run_shell",
                                "args": {"command": "./.agents/agents tools info benchmark"},
                            }
                        }
                    ]
                }
            }
        ]
    }

    calls = benchmark._gemini_function_calls(response)

    assert calls == [
        {
            "name": "run_shell",
            "args": {"command": "./.agents/agents tools info benchmark"},
            "id": "",
        }
    ]
    assert benchmark._gemini_command_allowed("./.agents/agents tools info benchmark", scenario) is True
    assert benchmark._gemini_command_allowed("rm -rf .", scenario) is False


def test_gemini_code_task_shell_allowlist_permits_afold_help_discovery():
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-afol-python-code-task-orchestrated"]

    assert benchmark._gemini_command_allowed("./afold --help", scenario) is True
    assert benchmark._gemini_command_allowed("./afold new --help", scenario) is True
    assert benchmark._gemini_command_allowed("command -v afol", scenario) is False
    assert benchmark._gemini_command_allowed("rm -rf .afol/wb", scenario) is False


def test_gemini_tool_declaration_uses_supported_schema_fields():
    benchmark = load_module()

    declarations = benchmark._gemini_tool_declarations()[0]["functionDeclarations"]
    by_name = {declaration["name"]: declaration for declaration in declarations}

    assert set(by_name) == {"list_dir", "read_file", "write_file", "run_shell"}
    for declaration in declarations:
        assert "additionalProperties" not in declaration["parameters"]
    assert by_name["run_shell"]["parameters"]["required"] == ["command"]
    assert by_name["read_file"]["parameters"]["required"] == ["path"]
    assert by_name["write_file"]["parameters"]["required"] == ["path", "content"]


def test_gemini_code_task_prompt_is_high_level_without_tool_recipe():
    benchmark = load_module()

    prompt = benchmark._gemini_initial_prompt(benchmark.SCENARIOS["live-afol-python-code-task-orchestrated"])

    assert "AGENTS.md" in prompt
    assert "docs" in prompt
    assert "run_shell" not in prompt
    assert "list_dir" not in prompt
    assert "./afold" not in prompt
    assert "python3 scripts/check_slugify.py" not in prompt
    assert "runner supplies phase prompts" not in prompt


def test_gemini_file_tools_are_bounded_to_fixture(tmp_path):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-tools-benchmark-discovery"]
    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir()
    (fixture_root / "docs").mkdir()
    (fixture_root / "docs" / "note.md").write_text("hello", encoding="utf-8")

    list_result, list_observation = benchmark._run_gemini_agent_tool(
        {"name": "list_dir", "args": {"path": "docs"}},
        fixture_root,
        scenario,
        1,
    )
    read_result, read_observation = benchmark._run_gemini_agent_tool(
        {"name": "read_file", "args": {"path": "docs/note.md"}},
        fixture_root,
        scenario,
        2,
    )
    write_result, write_observation = benchmark._run_gemini_agent_tool(
        {"name": "write_file", "args": {"path": "out/result.txt", "content": "done"}},
        fixture_root,
        scenario,
        3,
    )
    escape_result, _escape_observation = benchmark._run_gemini_agent_tool(
        {"name": "read_file", "args": {"path": "../outside.txt"}},
        fixture_root,
        scenario,
        4,
    )

    assert list_result["ok"] is True
    assert list_result["entries"] == [{"name": "note.md", "kind": "file"}]
    assert list_observation["name"] == "list_dir"
    assert read_result["ok"] is True
    assert read_result["content"] == "hello"
    assert read_observation["command_excerpt"] == "read_file docs/note.md"
    assert write_result["ok"] is True
    assert (fixture_root / "out" / "result.txt").read_text(encoding="utf-8") == "done"
    assert write_observation["exit_code"] == 0
    assert escape_result["ok"] is False
    assert escape_result["error"] == "path escapes benchmark fixture"


def test_gemini_rate_ledger_enforces_rpd(tmp_path):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, rpd=1)
    config = benchmark._load_gemini_provider_config(str(config_path))

    benchmark._reserve_gemini_request(config, "first")

    try:
        benchmark._reserve_gemini_request(config, "second")
    except ValueError as exc:
        assert "RPD limit exhausted" in str(exc)
    else:
        raise AssertionError("expected RPD exhaustion")


def test_gemini_rate_ledger_throttles_rpm(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, rpm=1)
    config = benchmark._load_gemini_provider_config(str(config_path))
    sleeps = []
    monkeypatch.setattr(benchmark.time, "sleep", lambda seconds: sleeps.append(seconds))

    benchmark._reserve_gemini_request(config, "first")
    stats = benchmark._reserve_gemini_request(config, "second")

    assert sleeps == [60.0]
    assert stats["api_rate_limited"] is True
    assert stats["api_throttle_delay_ms"] == 60000


def test_afold_fixture_launcher_writes_local_env(tmp_path):
    benchmark = load_module()
    dist_binary = tmp_path / "dist-afol"
    dist_binary.write_text("#!/bin/sh\n", encoding="utf-8")
    target = tmp_path / "target"
    target.mkdir()
    (target / "afol").write_text("#!/bin/sh\n", encoding="utf-8")
    (target / "a").write_text("#!/bin/sh\n", encoding="utf-8")

    benchmark._write_afold_fixture_launcher(target, dist_binary)

    assert (target / "afold").exists()
    assert not (target / "afol").exists()
    assert not (target / "a").exists()
    assert (target / ".afol" / "bin" / "afold-runtime").exists()
    assert (target / ".env").read_text(encoding="utf-8") == (
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nAFOL_BIN=./afold\nAFOLD_BIN=./afold\n"
    )


def test_live_scenario_command_uses_absolute_codex_path(tmp_path, monkeypatch):
    benchmark = load_module()
    scenario = benchmark.SCENARIOS["live-tools-benchmark-discovery"]
    monkeypatch.setattr(benchmark.shutil, "which", lambda name: "/tmp/codex" if name == "codex" else None)

    command = benchmark._live_scenario_command(
        scenario,
        benchmark.DEFAULT_PROFILE,
        tmp_path,
        tmp_path / "schema.json",
        tmp_path / "output.json",
    )

    assert command[0] == "/tmp/codex"


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


def test_gemini_tool_loop_appends_function_responses(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=5)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    scenario = replace(
        benchmark.SCENARIOS["live-tools-benchmark-discovery"],
        required_command_substrings=(".agents/agents tools info benchmark",),
        any_required_command_groups=(),
        forbidden_command_substrings=(),
        validation_check_count=0,
        min_tool_calls=0,
        validator=lambda _output_json, _repo_root: [],
    )

    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir()
    (fixture_root / "README.md").write_text("fixture", encoding="utf-8")
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")
    monkeypatch.setattr(benchmark, "_prepare_fixture_repo", lambda _tmp_dir: fixture_root)

    call_history = []
    calls = {"shell": 0}
    tool_sequence = [
        {"name": "list_dir", "args": {"path": "."}},
        {"name": "read_file", "args": {"path": "README.md"}},
        {"name": "write_file", "args": {"path": "notes/progress.md", "content": "ready"}},
        {"name": "run_shell", "args": {"command": "./.agents/agents tools info benchmark"}},
    ]

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        call_history.append(
            {
                "has_tools": bool(tools),
                "has_schema": bool(schema),
                "contents": json.loads(json.dumps(contents)),
            }
        )
        assert config.model == "gemma-4-31b-it"
        if tools:
            tool_turn = sum(1 for call in call_history if call["has_tools"])
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": tool_sequence[tool_turn - 1]["name"],
                                        "args": tool_sequence[tool_turn - 1]["args"],
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3, "totalTokenCount": 8},
            }
        assert schema is not None
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": scenario.id,
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 6, "candidatesTokenCount": 4, "totalTokenCount": 10},
        }

    def fake_run_shell(command, _fixture_root, _scenario):
        calls["shell"] += 1
        assert command == "./.agents/agents tools info benchmark"
        return {
            "ok": True,
            "exit_code": 0,
            "stdout": "tool ok",
            "stderr": "",
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)
    monkeypatch.setattr(benchmark, "_run_gemini_shell_tool", fake_run_shell)

    result = benchmark._run_gemini_scenario(scenario, profile)

    assert result["backend"] == "gemini_api"
    assert result["api_request_count"] == 5
    assert result["tool_call_count"] == 4
    assert result["tool_success_count"] == 4
    assert [call["name"] for call in result["observed_tool_calls"]] == [
        "list_dir",
        "read_file",
        "write_file",
        "run_shell",
    ]
    assert result["observed_tool_calls"][-1]["command_excerpt"] == "./.agents/agents tools info benchmark"
    assert calls["shell"] == 1
    assert len(call_history) == 5
    tool_messages = call_history[1]["contents"]
    assert any(part.get("functionResponse") is not None for message in tool_messages for part in message.get("parts", []))
    assert (fixture_root / "notes" / "progress.md").read_text(encoding="utf-8") == "ready"
    assert result["available_tools"] == ["list_dir", "read_file", "write_file", "run_shell"]
    assert {"tool_call", "tool_result", "structured_output_parsed"} <= {
        event["event"] for event in result["agent_progress"]
    }


def test_gemini_scenario_respects_max_requests_per_scenario_limit(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=0)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    scenario = replace(
        benchmark.SCENARIOS["live-tools-benchmark-discovery"],
        required_command_substrings=(),
        any_required_command_groups=(),
        forbidden_command_substrings=(),
        validation_check_count=0,
        min_tool_calls=1,
        validator=lambda _output_json, _repo_root: [],
    )
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")

    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir()
    monkeypatch.setattr(benchmark, "_prepare_fixture_repo", lambda _tmp_dir: fixture_root)

    called = []

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        called.append((bool(tools), bool(schema)))
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": scenario.id,
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 6, "candidatesTokenCount": 4, "totalTokenCount": 10},
        }

    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)

    result = benchmark._run_gemini_scenario(scenario, profile)

    assert result["api_request_count"] == 0
    assert result["tool_call_count"] == 0
    assert result["pass"] is False
    assert "Gemini request budget exhausted before first request" in result["failure_reasons"]
    assert called == []


def test_gemini_runtime_records_rate_limit_and_rpd_metrics_from_reserve(tmp_path, monkeypatch):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark, max_requests=4)
    profile = benchmark.BenchmarkProfile(
        runtime="gemini-api",
        model="gemma-4-31b-it",
        provider_config_path=str(config_path),
    )
    scenario = replace(
        benchmark.SCENARIOS["live-tools-benchmark-discovery"],
        required_command_substrings=(),
        any_required_command_groups=(),
        forbidden_command_substrings=(),
        validation_check_count=0,
        min_tool_calls=1,
        validator=lambda _output_json, _repo_root: [],
    )
    monkeypatch.setenv("GEMINI_API_KEY", "secret-test-key")
    fixture_root = tmp_path / "fixture"
    fixture_root.mkdir()
    monkeypatch.setattr(benchmark, "_prepare_fixture_repo", lambda _tmp_dir: fixture_root)

    reserve_calls = []

    def fake_reserve(config, scenario_id, now=None):
        reserve_calls.append(scenario_id)
        return {
            "api_rpm_limit": 15,
            "api_rpd_limit": 1500,
            "api_rpm_peak": len(reserve_calls),
            "api_rpd_count": 20 + len(reserve_calls),
            "api_rate_limited": len(reserve_calls) > 1,
            "api_throttle_delay_ms": 60000 if len(reserve_calls) == 2 else 0,
        }

    def fake_generate_content(config, contents, api_key, *, schema=None, tools=None):
        if tools:
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "run_shell",
                                        "args": {"command": "echo metric-check"},
                                    }
                                }
                            ]
                        }
                    }
                ],
                "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 3, "totalTokenCount": 8},
            }
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "scenario_id": scenario.id,
                                        "tool_surface": "benchmark",
                                        "default_model": benchmark.DEFAULT_PROFILE.model,
                                        "default_reasoning_effort": benchmark.DEFAULT_PROFILE.reasoning_effort,
                                    }
                                )
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 6, "candidatesTokenCount": 4, "totalTokenCount": 10},
        }

    def fake_run_shell(command, _fixture_root, _scenario):
        return {"ok": True, "exit_code": 0, "stdout": "ok", "stderr": ""}

    monkeypatch.setattr(benchmark, "_reserve_gemini_request", fake_reserve)
    monkeypatch.setattr(benchmark, "_gemini_http_generate_content", fake_generate_content)
    monkeypatch.setattr(benchmark, "_run_gemini_shell_tool", fake_run_shell)

    result = benchmark._run_gemini_scenario(scenario, profile)

    assert result["api_request_count"] == 2
    assert reserve_calls == [scenario.id, scenario.id]
    assert result["api_rpm_limit"] == 15
    assert result["api_rpd_limit"] == 1500
    assert result["api_rpm_peak"] == 2
    assert result["api_rpd_count"] == 22
    assert result["api_rate_limited"] is True
    assert result["api_throttle_delay_ms"] == 60000


def test_run_orchestrated_code_task_scenario_exposes_delivery_artifacts_and_quality(tmp_path, monkeypatch):
    benchmark = load_module()
    scenario = replace(
        benchmark.SCENARIOS["live-afol-python-code-task-orchestrated"],
        required_command_substrings=(),
        any_required_command_groups=(),
        forbidden_command_substrings=(),
        validation_check_count=0,
        min_tool_calls=0,
        validator=lambda _output_json, _repo_root: [],
    )

    fixture_root = tmp_path / "code-task"
    fixture_root.mkdir()
    session_id = benchmark.FIXTURE_WORKSTREAM_ID
    session_dir = fixture_root / ".afol" / "wb" / session_id
    session_dir.mkdir(parents=True)
    (session_dir / f"{session_id}_plan_01.md").write_text("# Plan\n", encoding="utf-8")
    (session_dir / f"{session_id}_task_01.md").write_text("| T-01 | done | worker | Implement slugify |\n", encoding="utf-8")
    (session_dir / ".evidence.jsonl").write_text('{"task_id":"T-01","command":"python3 scripts/check_slugify.py","result":"passed","artifact":"test-code-task-project/benchmark_report.md"}\n', encoding="utf-8")
    (fixture_root / "docs").mkdir()
    (fixture_root / "docs" / "benchmark_problem.md").write_text("# Benchmark Problem\n", encoding="utf-8")
    project_dir = fixture_root / benchmark.CODE_TASK_PROJECT_DIR
    (project_dir / "src").mkdir(parents=True)
    (project_dir / "src" / "text_utils.py").write_text("def slugify(text): return text\n", encoding="utf-8")
    (project_dir / "benchmark_report.md").write_text("# Report\n", encoding="utf-8")
    scripts_dir = fixture_root / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "check_slugify.py").write_text("print('ok')\n", encoding="utf-8")

    monkeypatch.setattr(benchmark, "_prepare_code_task_fixture_repo", lambda _tmp_dir: fixture_root)

    phase_runs = []

    def fake_codex_phase(phase, **_kwargs):
        phase_runs.append(phase)
        return {
            "phase": phase,
            "returncode": 0,
            "timed_out": False,
            "error_count": 0,
            "retry_count": 0,
            "prompt_bytes": 42,
            "stdout_excerpt": "phase ok",
            "stderr_excerpt": "",
            "command": ["codex", "--phase", phase],
            "token_usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2, "cached_input_tokens": 0, "reasoning_output_tokens": 0},
            "tool_calls": [],
            "output_error": None,
            "stdout": "phase ok",
            "stderr": "",
            "output_json": {"session_id": session_id},
        }

    def fake_score(
        _session_id,
        _plan_text,
        _task_text,
        _report_text,
        _evidence_text,
        _changed_paths,
    ):
        return {"score": 92, "pass": True}

    monkeypatch.setattr(benchmark, "_run_codex_phase", fake_codex_phase)
    monkeypatch.setattr(benchmark, "_score_code_task_delivery_quality", fake_score)
    monkeypatch.setattr(benchmark, "_code_task_changed_paths", lambda _repo_root: [f"{benchmark.CODE_TASK_PROJECT_DIR}/src/text_utils.py"])
    monkeypatch.setattr(benchmark, "_validate_code_task_planner", lambda _output_json, _fixture_root: [])
    monkeypatch.setattr(benchmark, "_validate_code_task_executor", lambda _output_json, _fixture_root: [])

    result = benchmark._run_orchestrated_code_task_scenario(scenario, benchmark.BenchmarkProfile(runtime="gemini-api"))

    assert phase_runs == ["planner", "executor"]
    assert result["backend"] == "live_agent_orchestrated"
    assert result["pass"] is True
    assert result["quality_score"]["score"] == 92
    assert result["delivery_artifacts"]["session_id"] == session_id
    assert result["delivery_artifacts"]["problem"]["exists"] is True
    assert "Benchmark Problem" in result["delivery_artifacts"]["problem"]["content"]
    assert result["delivery_artifacts"]["text_utils"]["exists"] is True
    assert "def slugify" in result["delivery_artifacts"]["text_utils"]["content"]
    assert result["delivery_artifacts"]["plan"]["path"] == f".afol/wb/{session_id}/{session_id}_plan_01.md"
    assert result["delivery_artifacts"]["task"]["path"] == f".afol/wb/{session_id}/{session_id}_task_01.md"
    assert result["delivery_artifacts"]["evidence_jsonl"]["path"] == f".afol/wb/{session_id}/.evidence.jsonl"
    assert result["delivery_artifacts"]["report"]["path"] == f"{benchmark.CODE_TASK_PROJECT_DIR}/benchmark_report.md"
    assert result["delivery_artifacts"]["problem"]["path"] == "docs/benchmark_problem.md"
    assert result["output_json"]["session_id"] == session_id


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
    assert usage["uncached_input_tokens"] == 9
    assert usage["uncached_total_tokens"] == 16
    assert usage["reasoning_output_tokens"] == 2


def test_parse_token_usage_derives_total_when_codex_omits_it():
    benchmark = load_module()
    stdout = '{"type":"event","usage":{"input_tokens":21,"output_tokens":8,"cached_input_tokens":13}}'

    usage = benchmark._parse_token_usage(stdout)

    assert usage["available"] is True
    assert usage["total_tokens"] == 29
    assert usage["uncached_total_tokens"] == 16


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
    session_dir = tmp_path / ".afol" / "wb" / benchmark.FIXTURE_WORKSTREAM_ID
    session_dir.mkdir(parents=True, exist_ok=True)
    task_file = session_dir / f"{benchmark.FIXTURE_WORKSTREAM_ID}_task_01.md"
    evidence_file = session_dir / ".evidence.jsonl"

    task_file.write_text(
        "| T-01 | done | worker | Run the controlled live benchmark fixture flow. "
        "(evidence: E-20260529152307831530) |\n",
        encoding="utf-8",
    )
    evidence_file.write_text(
        '{"task_id": "T-01", "command": "live benchmark fixture command", "result": "passed"}\n',
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
    launcher = tmp_path / "afold"
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


def test_score_autonomous_plan_quality_accepts_concrete_plan_and_task():
    benchmark = load_module()
    plan_text = (
        "# Plan\n\n"
        "## Steps\n"
        "- T-01: Fix runtime policy in app/runtime_policy.json for agentic-folder governed workflow.\n"
        "- Use .agents/agents for governed task state and evidence; keep scripts/check_runtime_policy.py read-only.\n"
        "- Verify with python scripts/check_runtime_policy.py.\n\n"
        "## Validation\n"
        "- Record evidence from python scripts/check_runtime_policy.py before marking T-01 done.\n"
    )
    task_text = (
        "| T-01 | done | worker | Fix app/runtime_policy.json for agentic-folder governed workflow "
        "and verify with python scripts/check_runtime_policy.py. |\n"
    )

    quality = benchmark._score_autonomous_plan_quality(plan_text, task_text)

    assert quality["score"] == 100
    assert quality["pass"] is True
    assert sum(item["weight"] for item in quality["criteria"]) == 100


def test_score_autonomous_plan_quality_accepts_runtime_policy_identifier_style():
    benchmark = load_module()
    plan_text = (
        "# Plan\n\n"
        "## Execution Plan\n"
        "- T-01: Fix app/runtime_policy.json to require agentic-folder governed workflow.\n"
        "- Use .agents/agents for governed task state and evidence in .agents/wb.\n\n"
        "## Validation\n"
        "- Run python scripts/check_runtime_policy.py and record evidence before marking T-01 done.\n"
    )
    task_text = (
        "| T-01 | done | worker | Fix app/runtime_policy.json to require agentic-folder governed workflow "
        "and verify with python scripts/check_runtime_policy.py. |\n"
    )

    quality = benchmark._score_autonomous_plan_quality(plan_text, task_text)

    assert quality["score"] == 100
    assert quality["pass"] is True


def test_score_autonomous_plan_quality_rejects_template_placeholders():
    benchmark = load_module()

    quality = benchmark._score_autonomous_plan_quality(
        "# Plan\n\n## Concrete Steps\n- <exact edit or command and expected outcome>\n",
        "| T-01 | done | worker | <path> <command> |\n",
    )

    assert quality["score"] < benchmark.AUTONOMOUS_PLAN_QUALITY_THRESHOLD
    assert quality["pass"] is False
    failed_ids = {item["id"] for item in quality["criteria"] if not item["passed"]}
    assert {"scope_target", "execution_path", "validation_evidence", "task_executability"} <= failed_ids


def test_score_autonomous_plan_quality_rejects_placeholders_in_otherwise_valid_artifact():
    benchmark = load_module()
    plan_text = (
        "# Plan\n\n"
        "## Steps\n"
        "- T-01: Fix runtime policy in app/runtime_policy.json for agentic-folder governed workflow.\n"
        "- Use .agents/agents for governed task state and evidence; keep scripts/check_runtime_policy.py read-only.\n"
        "- Verify with python scripts/check_runtime_policy.py.\n"
        "- <observable proof or metric>\n\n"
        "## Validation\n"
        "- Record evidence from python scripts/check_runtime_policy.py before marking T-01 done.\n"
    )
    task_text = (
        "| T-01 | done | worker | Fix app/runtime_policy.json for agentic-folder governed workflow "
        "and verify with python scripts/check_runtime_policy.py. |\n"
    )

    quality = benchmark._score_autonomous_plan_quality(plan_text, task_text)

    assert quality["pass"] is False
    assert "scope_target" in quality["required_failures"]


def test_validate_autonomous_delivery_rejects_template_plan_and_task(tmp_path):
    benchmark = load_module()
    session_id = "260607_1750_runtime-policy-fix"
    session_dir = tmp_path / ".agents" / "wb" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / f"{session_id}_plan_01.md").write_text(
        "# Runtime Policy Fix Plan\n\n"
        "## Purpose\n"
        "Explain what this change enables and how it supports F-19.\n\n"
        "## Concrete Steps\n"
        "- <exact edit or command and expected outcome>\n",
        encoding="utf-8",
    )
    (session_dir / f"{session_id}_task_01.md").write_text(
        "| T-01 | done | worker | <path> <command> |\n",
        encoding="utf-8",
    )
    (session_dir / ".evidence.jsonl").write_text(
        '{"task_id": "T-01", "command": "python scripts/check_runtime_policy.py", "result": "passed"}\n',
        encoding="utf-8",
    )
    (tmp_path / "app").mkdir()
    (tmp_path / "scripts").mkdir()
    (tmp_path / "app" / "runtime_policy.json").write_text(
        json.dumps(
            {
                "workflow_mode": "agentic-folder",
                "default_execution": "governed",
                "evidence_required": True,
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "scripts" / "check_runtime_policy.py").write_text(
        benchmark._runtime_policy_check_text(),
        encoding="utf-8",
    )

    failures = benchmark._validate_autonomous_delivery(
        {
            "session_id": session_id,
            "problem_fixed": True,
            "verification_passed": True,
            "plan_created": True,
            "task_completed": True,
            "evidence_recorded": True,
            "used_governed_session": True,
            "used_scripted_task_flow": True,
            "manual_wb_task_edit": False,
        },
        tmp_path,
    )

    assert "autonomous plan/task still contains scaffold template placeholders" in failures
    assert any("autonomous plan/task quality score" in failure for failure in failures)


def test_autonomous_delivery_prompt_stays_simple_and_evaluator_owned():
    benchmark = load_module()
    prompt = benchmark.SCENARIOS["live-autonomous-agentic-folder-delivery"].prompt

    assert "Read the local instructions" in prompt
    assert "docs/benchmark_problem.md" in prompt
    assert "return JSON only matching the provided schema" in prompt
    assert "Do not polish or repair template prose" not in prompt
    assert "must already be concrete" not in prompt
    assert "do not manually rewrite workbench prose" not in prompt
    assert "Do not manually edit workbench task state or evidence ledgers" not in prompt
    assert "update only the created plan/task content" not in prompt


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


def test_run_suite_fails_when_scenario_exceeds_token_budget(tmp_path):
    benchmark = load_module()
    scenario_id = "live-tools-benchmark-discovery"
    budget = benchmark.MAX_UNCACHED_TOKENS_BY_SCENARIO[scenario_id]

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
                "input_tokens": budget + 1,
                "output_tokens": 0,
                "total_tokens": budget + 1,
                "cached_input_tokens": 0,
                "reasoning_output_tokens": 0,
            },
        }

    payload = benchmark.run_suite(
        [scenario_id],
        benchmark.DEFAULT_PROFILE,
        tmp_path / "runtime-flow-live-agent.json",
        executor=fake_executor,
    )

    scenario = payload["scenarios"][0]
    assert payload["pass"] is False
    assert scenario["pass"] is False
    assert scenario["checks_total"] == 8
    assert scenario["checks_passed"] == 7
    assert scenario["accuracy"] == 0.875
    assert scenario["failure_reasons"] == [
        f"token budget exceeded: uncached_total_tokens {budget + 1} > {budget}"
    ]


def test_run_suite_does_not_fail_token_budget_on_cached_input(tmp_path):
    benchmark = load_module()
    scenario_id = "live-tools-benchmark-discovery"
    budget = benchmark.MAX_UNCACHED_TOKENS_BY_SCENARIO[scenario_id]

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
                "input_tokens": 1_000_000,
                "output_tokens": budget,
                "total_tokens": 1_000_000 + budget,
                "cached_input_tokens": 1_000_000,
                "reasoning_output_tokens": 0,
            },
        }

    payload = benchmark.run_suite(
        [scenario_id],
        benchmark.DEFAULT_PROFILE,
        tmp_path / "runtime-flow-live-agent.json",
        executor=fake_executor,
    )

    assert payload["pass"] is True
    assert payload["token_usage"]["uncached_total_tokens"] == budget


def test_run_suite_fails_when_scenario_exceeds_tool_budget(tmp_path):
    benchmark = load_module()
    scenario_id = "live-autonomous-agentic-folder-delivery"
    budget = benchmark.MAX_TOOL_CALLS_BY_SCENARIO[scenario_id]

    def fake_executor(scenario, profile):
        return {
            "id": scenario.id,
            "backend": "live_agent",
            "pass": True,
            "duration_ms": 12,
            "context_bytes": 100,
            "prompt_bytes": 50,
            "tool_call_count": budget + 1,
            "tool_success_count": budget + 1,
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
                "input_tokens": 1,
                "output_tokens": 1,
                "total_tokens": 2,
                "cached_input_tokens": 0,
                "reasoning_output_tokens": 0,
            },
        }

    payload = benchmark.run_suite(
        [scenario_id],
        benchmark.DEFAULT_PROFILE,
        tmp_path / "runtime-flow-live-agent.json",
        executor=fake_executor,
    )

    scenario = payload["scenarios"][0]
    assert payload["pass"] is False
    assert scenario["failure_reasons"] == [
        f"tool call budget exceeded: tool_call_count {budget + 1} > {budget}"
    ]


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
        "token_usage": {
            "available": True,
            "input_tokens": 9,
            "output_tokens": 6,
            "total_tokens": 15,
            "cached_input_tokens": 3,
            "reasoning_output_tokens": 2,
        },
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
                "token_usage": {
                    "available": True,
                    "input_tokens": 4,
                    "output_tokens": 3,
                    "total_tokens": 7,
                    "cached_input_tokens": 1,
                    "reasoning_output_tokens": 1,
                },
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
                "token_usage": {
                    "available": True,
                    "input_tokens": 5,
                    "output_tokens": 3,
                    "total_tokens": 8,
                    "cached_input_tokens": 2,
                    "reasoning_output_tokens": 1,
                },
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
    assert current_snapshot["summary"]["token_usage_total"] == 15
    assert current_snapshot["scenarios"][0]["token_usage"]["total_tokens"] == 7
    assert current_snapshot["scenarios"][1]["token_usage"]["total_tokens"] == 8
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


def test_main_run_accepts_gemini_provider_config(tmp_path, monkeypatch, capsys):
    benchmark = load_module()
    config_path = write_gemini_config(tmp_path, benchmark)
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
            "api_request_count": 0,
            "api_rpm_limit": 0,
            "api_rpd_limit": 0,
            "api_rpm_peak": 0,
            "api_rpd_count": 0,
            "api_rate_limited": False,
            "api_throttle_delay_ms": 0,
            "accuracy": 1.0,
            "tool_success_rate": 0.0,
            "scenarios": [],
        }

    monkeypatch.setattr(benchmark, "run_suite", fake_run_suite)
    code = benchmark.main(["run", "--provider-config", str(config_path), "live-tools-benchmark-discovery"])
    payload = json.loads(capsys.readouterr().out)

    assert code == 0
    assert captured["ids"] == ["live-tools-benchmark-discovery"]
    assert captured["profile"].runtime == "gemini-api"
    assert captured["profile"].model == "gemma-4-31b-it"
    assert payload["benchmark_profile"]["runtime"] == "gemini-api"
    assert payload["benchmark_profile"]["model"] == "gemma-4-31b-it"
    assert payload["benchmark_profile"]["provider_config_path"].endswith("gemini-gemma4-31b.json")
