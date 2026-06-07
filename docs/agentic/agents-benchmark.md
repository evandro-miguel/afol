---
id: agents-benchmark
theme: agents-benchmark
status: active
owners:
- orchestrator
updated_at: '2026-04-24T12:29:13-03:00'
---

# agents-benchmark.py - Controlled Live-Agent Runtime Flow Benchmarks

## Purpose

Provide a selective, development-only benchmark family for risky scaffold
execution changes using a real mini-tier agent, real tool calls, and bounded
fixture tasks.

## Default Profile

- runtime: `codex`
- model: `gpt-5.4-mini`
- reasoning_effort: `medium`

## Scenarios

- `live-tools-benchmark-discovery`
- `live-implement-next-governance-preflight`
- `live-implement-start-complete-evidence`
- `live-wb-update-task-evidence-timeline`
- `live-wb-session-create-scripted-progress`
- `live-autonomous-agentic-folder-delivery`
- `live-wb-update-status-touch`
- `live-wb-update-link`

## Commands

```bash
.agents/agents benchmark list
.agents/agents benchmark show live-implement-next-governance-preflight
.agents/agents benchmark run
.agents/agents benchmark run live-implement-start-complete-evidence --save
.agents/agents benchmark run live-wb-update-task-evidence-timeline --save
.agents/agents benchmark run live-wb-session-create-scripted-progress --save
.agents/agents benchmark run live-autonomous-agentic-folder-delivery --save
just benchmark-runtime-flow
```

## Validation Bridge

- `bun run cli/main.ts v bench --pack runtime-live-agent --json` consumes the
  saved live benchmark artifact from:
  - `.agents/benchmarks/runtime-flow-live-agent-v4-latest.json`
  - the `saved_result_path` referenced by that snapshot
- Each `runtime-live-agent` scenario must resolve to direct live evidence via
  its explicit `live_runner_scenario_id`; index fallback and row reuse are
  rejected.
- Refresh live evidence with:
  - `./.agents/agents benchmark run --save`
- If the saved live artifact is missing or only covers a partial scenario set,
  the validation pack returns `status=failed` with an actionable note that
  points to the refresh command.

## Contract

- Runs `codex exec --json` in an isolated fixture repo
- Requires bounded tool-driven task execution
- Captures:
  - pass/fail
  - duration
  - `tool_call_count`
  - `tool_success_count`
  - `tool_success_rate`
  - observed tool names and command excerpts when available
  - `error_count`
  - `retry_count` when inferable
  - `context_bytes`
  - `prompt_bytes`
  - `checks_total`
  - `checks_passed`
- `accuracy`
- Validates that live agents call the expected scripts instead of only returning a plausible answer.
- Fails targeted scenarios when forbidden manual workbench edits are observed.
- Includes script-writing flows for session creation, task state, evidence, timeline entries, frontmatter status/touch, and frontmatter links.
- Includes an autonomous hypothetical delivery scenario where the prompt does not name the exact scaffold commands; the agent must discover operations from AGENTS.md and the public tool catalog, prefer `.agents/agents` wrapper commands, create a governed session/plan, implement a tiny fixture fix, record evidence, complete the task, and run bounded acceptance verification.
- Autonomous benchmark scenarios should not rely on reading `.agents/scripts/*.py` internals to infer command routing.

## Usage Policy

- Run this selectively after risky runtime-flow changes during development.
- Do not turn it into a daily or universal production gate.
- The benchmark is only meaningful when the live agent actually uses tools.

---

*Document: `docs/agentic/agents-benchmark.md`*
