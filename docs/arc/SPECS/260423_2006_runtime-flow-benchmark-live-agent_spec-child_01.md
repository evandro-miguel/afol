---
doc_type: spec-child
id: 260423_2006_runtime-flow-benchmark-live-agent_spec-child_01
theme: runtime-flow-benchmark-live-agent
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the live-agent execution slice for controlled
  runtime-flow benchmarks using real Codex tool calls and bounded fixture tasks.
created_at: '2026-04-23T20:06:00-03:00'
updated_at: '2026-04-23T20:06:00-03:00'
roadmap_feature: F-19
spec_role: child
parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
risk_level: medium
---

# SPEC CHILD: runtime-flow-benchmark-live-agent

## Intent

- Outcome: the scaffold benchmarks a real mini-tier agent executing controlled
  tasks through actual tool calls instead of only benchmarking local command
  harnesses.
- Roadmap feature: `F-19`
- Parent spec: `260423_1605_controlled-runtime-flow-benchmarks_spec_01`

## Child Scope Rationale

- The previous runner slice proved the benchmark command family and fixture
  contract, but it stopped short of the original intent: measuring a live agent
  using tools in controlled execution flows.
- This child slice adds the missing executor layer without replacing the parent
  benchmark philosophy or turning the benchmark into a universal gate.

## User or Operator Journey

1. A maintainer changes a risky execution surface that may affect prompt shape,
   rule visibility, tool access, or governed command behavior.
2. The maintainer runs the standard benchmark command.
3. The runner creates a bounded fixture repo and launches `codex exec` with the
   default `gpt-5.4-mini` + `low` profile.
4. The live agent must use tools to finish a fixed-scope task.
5. The runner captures the structured result, observed tool calls, timing,
   error/retry signals, and declared context footprint.
6. The maintainer compares the saved result against prior baselines to see if
   the risky change broke real execution flow.

## Boundaries

- In scope:
  - A live-agent executor backend using `codex exec --json`.
  - Controlled fixture repos and fixed-scope tasks for runtime-flow measurement.
  - Parsing observed tool calls from the Codex event stream.
  - Structured result output with tool-usage metrics, timing, and context size.
- Out of scope:
  - Broad provider bake-offs.
  - Open-ended product tasks.
  - Mandatory live benchmark execution for every task or PR.

## Live-Agent Contract

- Default live benchmark profile:
  - `runtime`: `codex`
  - `model`: `gpt-5.4-mini`
  - `reasoning_effort`: `low`
- The runner must:
  - execute `codex exec --json` in an isolated fixture repo
  - require a bounded task and structured final output
  - record observed tool calls from the event stream
  - fail the scenario if required tool usage did not happen
- Result payload must include:
  - overall and per-scenario `pass` / `fail`
  - duration in milliseconds
  - `tool_call_count`
  - observed tool names and command excerpts when available
  - `error_count`
  - `retry_count` when inferable from repeated failed tool attempts
  - `context_bytes`
  - `prompt_bytes`

## First Live Scenario Pack

- `live-tools-benchmark-discovery`
  - the agent must use tools to inspect the benchmark surface and report the
    default model contract
- `live-implement-next-governance-preflight`
  - the agent must use tools to run governed preflight and report the next task
    plus feature/spec context
- `live-implement-start-complete-evidence`
  - the agent must use tools to start and complete the controlled fixture task
    and the runner must verify the resulting evidence

## Risks and Mitigations

- Live execution becomes flaky or expensive -> keep tasks tiny, deterministic,
  and fixture-scoped.
- The runner claims tool usage without proof -> parse the Codex JSONL event
  stream and fail if required tool calls are absent.
- Context grows silently -> report both `context_bytes` and `prompt_bytes`.

## Acceptance

- [ ] The benchmark runner supports a live-agent backend through `codex exec`
- [ ] The default profile remains `gpt-5.4-mini` with `low`
- [ ] The first live scenario pack requires and verifies tool usage
- [ ] Result JSON includes tool-call metrics in addition to pass/fail and timing
- [ ] Docs, tests, and template parity reflect the live-agent contract

---

*Template: `docs/templates/spec-child.md`*
