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
- reasoning_effort: `low`

## Scenarios

- `live-tools-benchmark-discovery`
- `live-implement-next-governance-preflight`
- `live-implement-start-complete-evidence`
- `live-wb-update-task-evidence-timeline`
- `live-wb-session-create-scripted-progress`
- `live-autonomous-agentic-folder-delivery`
- `live-wb-update-status-touch`
- `live-wb-update-link`
- `live-afol-provider-compatible-delivery`
- `live-afol-python-code-task-orchestrated`

## Commands

```bash
python3 .agents/scripts/agents-benchmark.py list
python3 .agents/scripts/agents-benchmark.py show live-implement-next-governance-preflight
python3 .agents/scripts/agents-benchmark.py run --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-implement-start-complete-evidence --save --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-wb-update-task-evidence-timeline --save --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-wb-session-create-scripted-progress --save --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-autonomous-agentic-folder-delivery --save --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-afol-provider-compatible-delivery --save --model gpt-5.4-mini --reasoning-effort low
python3 .agents/scripts/agents-benchmark.py run live-afol-python-code-task-orchestrated --save --model gpt-5.4-mini --reasoning-effort low
```

## Validation Bridge

- `bun run cli/main.ts v bench --pack runtime-live-agent --json` consumes the
  saved live benchmark evidence from:
  - `.agents/benchmarks/runtime-flow-live-agent-v4-latest.json`
  - the ignored raw result referenced by `saved_result_path`, when present
- The tracked snapshot is sufficient for validation in a clean clone; the raw
  result remains a local diagnostic artifact.
- Each `runtime-live-agent` scenario must resolve to direct live evidence via
  its explicit `live_runner_scenario_id`; index fallback and row reuse are
  rejected.
- Scenario thresholds are applied to the mapped live metrics. A saved live
  artifact with `pass=true` still fails validation when duration, tool success,
  or other scenario thresholds are violated.
- Refresh live evidence with:
  - `python3 .agents/scripts/agents-benchmark.py run --save --model gpt-5.4-mini --reasoning-effort low`
- If the tracked live snapshot is missing or only covers a partial scenario set,
  the validation pack returns `status=failed` with an actionable note that
  points to the refresh command.

## Contract

- Runs `codex exec --json` in an isolated fixture repo
- AFOL fixture scenarios install a local development launcher named `./afold`
  inside the fixture. It points at the freshly built development binary and is
  not packaged as the production `afol` CLI.
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
  - `token_usage` when the runtime exposes it
  - `quality_score` for interpretive plan/task/report scenarios
- Validates that live agents call the expected scripts instead of only returning a plausible answer.
- Fails targeted scenarios when forbidden manual workbench edits are observed.
- Includes script-writing flows for session creation, task state, evidence, timeline entries, frontmatter status/touch, and frontmatter links.
- Includes an autonomous hypothetical delivery scenario where the prompt does not name the exact scaffold commands; the agent must read `.agents/skills/agentic-folder-sys/SKILL.md`, discover operations from AGENTS.md and the public tool catalog, prefer `.agents/agents` wrapper commands, create a governed session/plan, implement a tiny fixture fix, record evidence, complete the task, and run bounded acceptance verification.
- Includes AFOL provider-compatible scenarios where mutable operational state stays under `.afol/` instead of `.agents/`.
- AFOL provider-compatible scenarios must use `./afold`; `./afol`, `./a`, bare
  `afol` discovery, global skills, and manual `.afol/data` session edits are failure
  signals.
- Autonomous benchmark scenarios should not rely on reading `.agents/scripts/*.py` internals to infer command routing.

## Qualitative Score

Scripted checks are primary. Qualitative scoring is used only for artifacts that
need reading judgment, such as plan/task/report coherence.

Plan/task threshold: 80/100.
Required gates: scope/target, validation/evidence, constraints/safety, and task
executability.

| Criterion | Weight | Checks |
| --- | ---: | --- |
| Scope and target | 25 | Objective, project folder, and exact files are named. |
| Execution path | 20 | Steps are ordered, actionable, and tied to task IDs. |
| Validation/evidence | 20 | Exact acceptance command and evidence requirement are named. |
| Constraints/safety | 15 | Allowed boundaries are clear; provider-hostile paths are absent. |
| Concision | 10 | Artifact is short enough for a small executor. |
| Task executability | 10 | Task has state, target, and acceptance command. |

Execution/report threshold: 85/100.
Required gates: functional correctness, evidence/task state, and scope control.

| Criterion | Weight | Checks |
| --- | ---: | --- |
| Functional correctness | 30 | Acceptance command passed and matches evidence. |
| Evidence/task state | 20 | Task is done only with valid evidence. |
| Report clarity | 20 | Session, task, change, verification, evidence, and files are clear. |
| Scope control | 15 | Changed files stay inside allowed fixture/AFOL paths. |
| Concision | 10 | Report is compact and not a transcript. |
| Reviewer readability | 5 | Status is obvious and not contradictory. |

Overall code-task score: 40% plan/task and 60% execution/report, threshold
85/100.

## Usage Policy

- Run this selectively after risky runtime-flow changes during development.
- Do not turn it into a daily or universal production gate.
- The benchmark is only meaningful when the live agent actually uses tools.

---

*Document: `docs/agentic/agents-benchmark.md`*
