# Plan: gemma-agentic-tools-benchmark

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-19
- parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01

## Goal

Make the Gemma 4 31B Gemini API benchmark path behave like a real bounded
agent: declare tools, execute local tool calls, return tool responses to the
model, inspect final `.afol/wb` artifacts, and report request/token/RPM/RPD
costs. The hard proof target is `live-afol-python-code-task-orchestrated`.

## Current facts

- Provider config exists at `.agents/data/benchmarks/providers/gemini-gemma4-31b.json`.
- Current profile uses `runtime: gemini-api`, `model: gemma-4-31b-it`, RPM 15,
  RPD 1500, min request interval 4100 ms, and suite cap 10 requests.
- Runner already has a local Gemini function-calling harness with `run_shell`.
- Docs say manual Gemini API runs write ignored outputs under
  `.afol/tmp/benchmarks/`.
- Previous hard scenario result failed because final plan/task/report/evidence
  was not actually inspected/proven.

## Google docs anchors

- Gemini API function calling: declare functions in `tools`, receive
  `functionCall`, execute locally, then send `functionResponse` back in the next
  model turn.
- Gemini API tools docs: built-in tools can finish inside one API call; custom
  local tools require the application harness to execute the tool loop.
- Google ADK Gemma docs: Gemma 4 can be used through Gemini API with ADK agents
  and `FunctionTool` style tools, but this repo runner currently uses a direct
  Gemini API harness to avoid adding a new mandatory benchmark dependency.

## Execution Plan

- T-01: Align docs/provider contract with Google function-calling and ADK/Gemma
  guidance.
- T-02: Harden the Gemini local agent harness if code gaps remain for real
  tool-loop execution, final artifact capture, or request accounting.
- T-03: Add or adjust focused tests for tool-loop behavior, request/RPM/RPD
  accounting, and final artifact inspection.
- T-04: Run the hard Gemma API benchmark, inspect final plan/tasks/report/evidence
  from the fixture, and write a compact run report with tokens and API usage.

## Delegation

- Agent docs owns T-01. Write scope:
  `docs/agentic/agents-benchmark.md`, `.agents/data/benchmarks/README.md`.
- Agent runner owns T-02. Write scope:
  `.agents/scripts/agents-benchmark.py`, provider config only if budget fields
  need correction.
- Agent tests owns T-03. Write scope:
  `.agents/scripts/tests/test_agents_benchmark.py`.
- Agent verifier owns T-04. Write scope:
  `.afol/wb/260608_1450_gemma-agentic-tools-benchmark/*_report_01.md` and
  ignored `.afol/tmp/benchmarks/*.json` outputs only.

Agents must not edit `.env`, `.env.local`, secrets, or unrelated workbench
sessions. If a task needs a shared code change outside its write scope, report
the gap instead of widening scope silently.

## Validation

- `uv run --with pytest pytest .agents/scripts/tests/test_agents_benchmark.py -q`
- `./afol validate --changed-path docs/agentic/agents-benchmark.md --json`
- `./afol validate --changed-path .afol/wb/260608_1450_gemma-agentic-tools-benchmark --json`
- Hard manual run:
  `python3 .agents/scripts/agents-benchmark.py run live-afol-python-code-task-orchestrated --provider-config .agents/data/benchmarks/providers/gemini-gemma4-31b.json --output .afol/tmp/benchmarks/gemini-code-task-orchestrated.json --pretty`

## Pass Criteria

- Hard benchmark result is not accepted unless the final plan, task state,
  evidence ledger, and report artifacts are present and inspected.
- Result payload reports `api_request_count`, `api_rpm_limit`, `api_rpd_limit`,
  `api_rpm_peak`, `api_rpd_count`, `token_usage`, `tool_call_count`, and
  `observed_tool_calls`.
- Request use stays within configured caps unless the report records an explicit
  manual waiver and reason.
- Task closure uses AFOL evidence; no task is marked done from model claims alone.
