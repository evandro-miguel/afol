---
doc_type: spec-child
id: 260423_1821_runtime-flow-benchmark-runner_spec-child_01
theme: runtime-flow-benchmark-runner
status: final
closure_note: Benchmark runner contract (v bench JSON/result schema, pack coverage) is implemented and tested.
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the first executable slice for controlled runtime-flow
  benchmarks, including the command surface, controlled fixture strategy,
  scenario pack, and result contract.
created_at: '2026-04-23T18:21:34-03:00'
updated_at: '2026-06-14T00:00:00-03:00'
roadmap_feature: F-19
spec_role: child
parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
risk_level: medium
---

# SPEC CHILD: runtime-flow-benchmark-runner

## Intent

- Outcome: the scaffold gains a standard `benchmark` command that runs compact,
  controlled runtime-flow scenarios and emits structured results that are
  comparable across risky execution changes.
- Roadmap feature: `F-19`
- Parent spec: `260423_1605_controlled-runtime-flow-benchmarks_spec_01`

## Child Scope Rationale

- The parent feature defines philosophy and policy, but the first executable
  slice needs a tighter contract for what the runner does, where scenarios live,
  how fixtures are isolated, and which metrics are guaranteed.
- Keeping this child scope separate avoids mixing the initial runner contract
  with future concerns such as external result stores or provider-specific live
  agent adapters.

## User or Operator Journey

1. A maintainer changes a risky execution surface such as governed command
   routing, rule visibility, runtime registry behavior, or tool selection.
2. The maintainer runs the standard benchmark command instead of improvising a
   manual check.
3. The runner creates a controlled fixture repo/session, executes the selected
   scenario pack, and records per-step pass/fail plus performance metrics.
4. The maintainer reviews JSON output or a saved result file to see whether the
   risky execution flow regressed.

## Boundaries

- In scope:
  - A public `.agents/agents benchmark ...` command registered in the runtime
    registry.
  - A first controlled scenario pack for benchmarking governed scaffold flows.
  - Structured JSON results with stable metrics, step evidence, and explicit
    benchmark profile metadata.
  - Explicit `context_bytes` capture for the benchmark fixture artifacts that
    define the scenario scope.
- Out of scope:
  - Mandatory benchmark execution for every task or PR.
  - A live external-agent executor as the only supported benchmark backend.
  - Cross-repo result aggregation or historical dashboards.

## Runner Contract

- Command family:
  - `benchmark list`
  - `benchmark show <scenario-id>`
  - `benchmark run [scenario-id ...]`
- Default benchmark profile:
  - `runtime`: `codex`
  - `model`: `gpt-5.4-mini`
  - `reasoning_effort`: `medium`
- Default output contract:
  - overall `pass` / `fail`
  - total duration in milliseconds
  - per-scenario duration in milliseconds
  - per-step command, exit code, pass/fail, retries, and observed output tokens
  - `context_bytes` for the declared scenario artifacts
  - declared benchmark profile metadata
- Result persistence:
  - stdout JSON is mandatory
  - saving a JSON file under `.afol/data/benchmarks/results/` is supported
    when requested

## Controlled Fixture Strategy

- Scenarios must run against an isolated temporary fixture, not the live
  workbench session of the current repository.
- The fixture copies only the scaffold surfaces required by the command family
  under test plus the minimal roadmap/spec/rule/session context needed by that
  scenario.
- Each scenario declares the artifacts whose byte size counts toward
  `context_bytes` so context growth can be tracked as part of the benchmark.

## First Scenario Pack

- `implement-next-governance-preflight`
  - validates governed preflight output, rule visibility, and next-task
    selection
- `implement-start-complete-evidence`
  - validates start/complete flow, evidence insertion, and task-state
    transitions
- `tools-benchmark-discovery`
  - validates that the new benchmark surface is discoverable through the tool
    catalog and wrapper help paths

## Risks and Mitigations

- Fixture becomes too heavy -> keep the copied surface minimal and deterministic.
- The benchmark claims to measure prompt context but only measures command
  output -> define `context_bytes` strictly as declared fixture artifact size in
  v1.
- The suite becomes another smoke test with no result comparability -> require a
  stable JSON result contract and bounded scenarios.

## Acceptance

- [ ] `benchmark` is available through the wrapper and runtime registry
- [ ] A first controlled scenario pack runs without mutating the live workbench
- [ ] JSON results include pass/fail, timing, retries/errors, and `context_bytes`
- [ ] The default benchmark profile is explicit and uses `gpt-5.4-mini` with
      `medium`
- [ ] Docs and tests cover the new command surface and first scenario pack

---

*Template: `docs/templates/spec-child.md`*
