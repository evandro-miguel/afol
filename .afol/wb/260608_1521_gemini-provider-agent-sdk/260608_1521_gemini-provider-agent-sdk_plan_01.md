# Plan: gemini-provider-agent-sdk

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-19
- parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01

## Execution Plan

Facts:
- Gemini/Gemma benchmark path currently uses REST `generateContent`.
- Google function calling supports function declarations and function responses.
- Current harness exposes only `run_shell`; this task adds a provider-agent SDK layer with simple local tools.
- Benchmark prompts must stay high-level. Tool choice comes from AGENTS.md, local skills, rules, docs, and tool descriptions.

Tasks:
- T-01: Implement provider-agent SDK wrapper for Gemini/Gemma with tool registry, simple file/shell tools, automatic progress logging, and benchmark result fields.
- T-02: Update benchmark docs/config so Gemma runs expose the agent tools and preserve RPD/RPM/request budget behavior.
- T-03: Add focused tests for tool declarations, file tools, functionResponse loop, progress events, and no prompt-level tool spoon-feeding.
- T-04: Validate with focused pytest, AFOL validation, diff check, and GitNexus change detection.

## Validation

- `uv run --with pytest pytest .agents/scripts/tests/test_agents_benchmark.py -q`
- `./afol validate --changed-path .agents/scripts/agents-benchmark.py --json`
- `./afol validate --changed-path docs/agentic/agents-benchmark.md --json`
- `./afol validate --changed-path .afol/wb/260608_1521_gemini-provider-agent-sdk --json`
- `git diff --check`
- `npx gitnexus detect-changes --repo agentic-standard-folder`

## Closure Criteria

- SDK exposes bounded `list_dir`, `read_file`, `write_file`, and `run_shell` tools.
- Each request, response, tool call, tool result, and final parse event is logged in benchmark output.
- Benchmarks remain evaluator-owned; prompt does not tell the model to invoke one specific tool.
- T-01 is marked done only after passed evidence exists.
