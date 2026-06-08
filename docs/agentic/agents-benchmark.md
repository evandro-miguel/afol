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

## Source Of Truth

- Scenario catalog: `.agents/scripts/agents-benchmark.py` (`SCENARIOS`)
- Clean-clone validation snapshot:
  `.agents/benchmarks/runtime-flow-live-agent-v4-latest.json`
- Raw full-result history:
  `.agents/data/benchmarks/results/*_runtime-flow-live-agent-v4.json`
- Provider profiles: `.agents/data/benchmarks/providers/*.json`
- Manual API runs: `.afol/tmp/benchmarks/*.json`

## Gemini/Gemma Profile

Config:

- `.agents/data/benchmarks/providers/gemini-gemma4-31b.json`
- runtime: `gemini-api`
- provider: `google-gemini`
- model: `gemma-4-31b-it`
- API key source: `GEMINI_API_KEY`
- request ledger: `.afol/tmp/benchmarks/gemini-rate-ledger.jsonl`

Do not commit API keys. Put the key in the shell environment or ignored
`.env.local` file:

```bash
export GEMINI_API_KEY="..."
```

The benchmark runner reads `GEMINI_API_KEY` from the process environment first,
then falls back to root `.env.local`. The file stays local-only and must not be
committed.

Initial limits:

- RPM: 15
- RPD: 1500
- minimum request interval: 4100 ms
- default request budget: 5 requests per scenario, 10 requests per suite
- recovery request: disabled by default

Implemented behavior:

- Provider config loading preserves Codex defaults and `--model` /
  `--reasoning-effort` compatibility.
- `gemini-api` calls Gemini `generateContent` with `GEMINI_API_KEY`, redacts
  secrets from payload output, and fails when the key is missing.
- API accounting is recorded in suite and scenario payloads:
  `api_request_count`, `api_rpm_limit`, `api_rpd_limit`, `api_rpm_peak`,
  `api_rpd_count`, `api_rate_limited`, and `api_throttle_delay_ms`.
- Local ledger enforces RPD, RPM, and minimum request spacing.
- Suite and scenario request budgets are enforced. A multi-scenario Gemini run
  receives only the remaining suite request budget for each next scenario.
- Gemini runs use text-only function calling with an allowlisted local
  `run_shell` harness.
- Unit tests mock Gemini HTTP responses. Real API runs are manual/dev-only.

Current verified real-API coverage:

| Scenario | Result | Requests | Tokens | Notes |
| --- | --- | ---: | ---: | --- |
| `live-implement-start-complete-evidence` | pass, 30/30 checks | 5 | 2076 | Verified with Gemma API and local tools. |

Current unverified real-API coverage:

- `live-afol-python-code-task-orchestrated`
- `live-autonomous-agentic-folder-delivery`
- Full multi-scenario Gemini suite

Risk: the hard code-task and autonomous scenarios may need more than the
default 5 requests/scenario. Raise budget only for intentional manual runs, and
keep the suite cap low to protect RPM/RPD.

## Scenarios

| Tier | Scenario | Purpose | Expected use |
| --- | --- | --- | --- |
| T0 read-only | `live-tools-benchmark-discovery` | Tool contract discovery. | Cheapest smoke check. |
| T0 read-only | `live-implement-next-governance-preflight` | Governance preflight/report for next task. | Quick rule-loading check. |
| T1 lifecycle | `live-implement-start-complete-evidence` | Start task, complete task, inspect final task and evidence. | Minimum closeout proof. |
| T1 lifecycle | `live-wb-update-task-evidence-timeline` | Evidence, done state, timeline updates. | Legacy workbench mutation check. |
| T1 lifecycle | `live-wb-session-create-scripted-progress` | Create session and advance T-01 through scripts. | Scripted lifecycle check. |
| T1 metadata | `live-wb-update-status-touch` | Frontmatter status/touch update. | Metadata mutation check. |
| T1 metadata | `live-wb-update-link` | Frontmatter link entry. | Metadata link check. |
| T2 AFOL delivery | `live-afol-provider-compatible-delivery` | Downstream `.afol/wb` delivery with provider-compatible paths. | AFOL-only lifecycle check. |
| T3 autonomous delivery | `live-autonomous-agentic-folder-delivery` | Discover workflow from local instructions, plan, execute, verify tiny fix. | Hard no-recipe workflow check. |
| T4 code task | `live-afol-python-code-task-orchestrated` | Planner/executor code task through AFOL with plan/task/report scoring. | Hardest code-delivery check. |

Selection rules:

- Need quick smoke: run `live-tools-benchmark-discovery`.
- Need final plan/task/evidence proof: run
  `live-implement-start-complete-evidence`.
- Need downstream `.afol/` compatibility: run
  `live-afol-provider-compatible-delivery`.
- Need real code-delivery ability: run
  `live-afol-python-code-task-orchestrated`.
- Need no-recipe autonomous discovery: run
  `live-autonomous-agentic-folder-delivery`.
- Need release regression: run the full Codex suite and refresh the tracked
  snapshot.

Do not confuse:

- `live-implement-start-complete-evidence` proves lifecycle closeout only. It
  does not prove code-task ability.
- `live-afol-python-code-task-orchestrated` is the harder code-task scenario.
- `live-autonomous-agentic-folder-delivery` tests workflow discovery without a
  command recipe in the prompt.
- `.agents/benchmarks/runtime-flow-live-agent-v4-latest.json` is the tracked
  clean-clone snapshot. Raw result files carry fuller diagnostics and token
  detail.
- `.afol/tmp/benchmarks/` is for ignored manual API outputs.

## Latest Codex Baseline

Latest full result inspected:
`.agents/data/benchmarks/results/20260607_132956_runtime-flow-live-agent-v4.json`.

| Scenario | Pass | Checks | Tools | Duration ms | Total tokens | Cached tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `live-tools-benchmark-discovery` | yes | 8/8 | 1 | 8580 | 32208 | 12544 |
| `live-implement-next-governance-preflight` | yes | 10/10 | 2 | 12421 | 52982 | 35968 |
| `live-implement-start-complete-evidence` | yes | 10/10 | 4 | 13968 | 67505 | 36864 |
| `live-wb-update-task-evidence-timeline` | yes | 12/12 | 6 | 18767 | 82257 | 65408 |
| `live-wb-session-create-scripted-progress` | yes | 31/31 | 6 | 24280 | 123050 | 104064 |
| `live-autonomous-agentic-folder-delivery` | yes | 34/34 | 19 | 63245 | 456853 | 418304 |
| `live-afol-provider-compatible-delivery` | yes | 35/35 | 7 | 32016 | 147414 | 129408 |
| `live-afol-python-code-task-orchestrated` | yes | 51/51 | 12 | 72124 | 255575 | 225792 |
| `live-wb-update-status-touch` | yes | 10/10 | 5 | 21527 | 102147 | 85248 |
| `live-wb-update-link` | yes | 9/9 | 2 | 11109 | 47886 | 33408 |

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

Gemini/Gemma manual runs:

```bash
python3 .agents/scripts/agents-benchmark.py run live-implement-start-complete-evidence --provider-config .agents/data/benchmarks/providers/gemini-gemma4-31b.json --output .afol/tmp/benchmarks/gemini-implement-complete.json --pretty
python3 .agents/scripts/agents-benchmark.py run live-afol-python-code-task-orchestrated --provider-config .agents/data/benchmarks/providers/gemini-gemma4-31b.json --output .afol/tmp/benchmarks/gemini-code-task-orchestrated.json --pretty
python3 .agents/scripts/agents-benchmark.py run live-autonomous-agentic-folder-delivery --provider-config .agents/data/benchmarks/providers/gemini-gemma4-31b.json --output .afol/tmp/benchmarks/gemini-autonomous-delivery.json --pretty
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
