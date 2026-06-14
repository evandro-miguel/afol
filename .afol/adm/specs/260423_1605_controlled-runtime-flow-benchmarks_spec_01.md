---
doc_type: spec
id: 260423_1605_controlled-runtime-flow-benchmarks_spec_01
theme: controlled-runtime-flow-benchmarks
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the benchmark contract for controlled agent-tool execution
  flows and when those benchmarks should be used as regression measurement.
created_at: '2026-04-23T16:05:00-03:00'
updated_at: '2026-04-23T16:05:00-03:00'
roadmap_feature: F-19
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - AGENTS.md
  - .agents/scripts
  - .agents/runtime
  - .agents/skills
  - docs/arc
  - docs/standards
  - docs/templates
  packages:
  - runtime compatibility
  - execution benchmarks
  - regression measurement
  - tool orchestration
risk_level: medium
---

# SPEC: Controlled Runtime Flow Benchmarks

## 1) Feature Intent

- Outcome: the scaffold gains a standard benchmark family for controlled
  agent-tool execution flows so maintainers can measure whether risky runtime
  changes broke real execution behavior.
- Why now: smoke checks and strict workbench verification are useful, but they
  do not answer how well a runtime path behaves when a real agent model must
  choose tools, respect scope, and finish a bounded flow.
- Roadmap feature: `F-19`
- Role of this spec: parent feature spec for targeted runtime-flow benchmark
  governance.

## 2) Problem

- Changes to runtime adapters, prompt/rule loading, tool routing, agent
  selection, or command orchestration can break execution flows without failing
  unit tests or basic smoke checks.
- The scaffold does not yet define a standard set of controlled tasks that let
  maintainers compare behavior before and after a risky change.
- Benchmark usage is currently ad hoc: one maintainer may run a broad manual
  test, while another may skip live execution entirely.
- Teams need a lightweight way to say "this risky flow still works" without
  turning live-model benchmarking into a mandatory gate for every task.

## 3) Users and User Journey

Primary users:

- Scaffold maintainers changing execution flows, runtime adapters, or
  agent-tool interaction paths.
- Reviewers who need a regression signal beyond static tests.
- Operators who want empirical confidence before adopting a runtime change.

User journey:

1. A maintainer changes a risky execution surface such as runtime routing,
   prompt/rule loading, tool invocation policy, or benchmark-sensitive
   orchestration logic.
2. The maintainer chooses the relevant controlled benchmark pack instead of
   improvising a manual check.
3. The benchmark runs a fixed-scope task using a standard model tier, expected
   tools, explicit success criteria, and captured metrics.
4. The maintainer compares pass/fail and timing data against baseline or prior
   runs and decides whether the flow regressed.

Failure or friction points:

- Benchmark is run for every tiny change -> too much cost and noise.
- Benchmark scope is vague -> results become anecdotal and non-comparable.
- Benchmark model tier drifts between runs -> results stop being useful.
- Benchmark captures only timing -> quality regressions go unnoticed.

## 4) Experience and Behavior

Expected behavior:

- The scaffold defines a standard benchmark contract for controlled
  agent-execution tasks.
- Each benchmark scenario names:
  - the bounded task and allowed scope
  - the expected tools or command families
  - the benchmark model tier
  - the expected output or observable completion condition
  - the metrics that must be recorded
- The default benchmark tier for this family is `gpt-5.4-mini` with `low`
  reasoning unless a benchmark spec or scenario explicitly overrides it.
- Runtime-flow benchmarks are targeted regression measurement for risky
  execution changes. They are not a universal gate for every repo edit.
- Benchmark results should capture both correctness and performance:
  pass/fail, timing, tool-call success/failure, retries, and any prompt/context
  size signal available from the runtime surface.
- Benchmark scenarios should stay compact and comparable. They are controlled
  tasks, not open-ended product demos.

Boundaries:

- This feature does not require live benchmark runs for every change.
- This feature does not replace unit tests, strict workbench verification, or
  smoke checks.
- This feature does not assume the benchmark must use the biggest model tier.
- This feature does not require one single benchmark suite for every runtime or
  workflow forever; scenario packs may be separated by execution family.

## 5) Existing Similar Systems

These systems already cover part of the need and should be extended instead of
duplicated:

- `just runtime-mcp-smoke` and `just agents-all` already provide baseline smoke
  and validation coverage.
- `verify-tasks --strict` already proves governance and workbench closure, but
  not live execution performance.
- F-06 already governs runtime compatibility and validation or smoke coverage.
- F-18 already governs when benchmark-heavy work should be framed correctly
  before execution.

Future refactor or extension pending items:

- Consider a dedicated benchmark command family once the scenario contract is
  proven.
- Consider storing benchmark result summaries in a canonical durable format
  after the first controlled packs exist.
- Consider separating prompt/context size measurement from timing measurement if
  runtime observability differs too much by adapter.

## 6) Scope

In scope:

- Benchmark governance for controlled runtime-flow tasks.
- Scenario requirements: fixed scope, expected tools, model tier, success
  criteria, and result metrics.
- A default benchmark model policy for this benchmark family.
- Policy for when benchmark runs are advisable after risky execution changes.
- Documentation updates that make the benchmark role explicit to future agents.

Out of scope:

- Implementing the full benchmark runner in this planning slice.
- Requiring benchmark execution for every task or every PR.
- Broad product benchmarking unrelated to scaffold execution flows.
- Provider-specific credential setup or model procurement policy.

## 7) Child Spec Strategy

- Child specs required: yes
- Decomposition rule:
  - Use one child spec for benchmark scenario design and pass/fail contracts.
  - Use one child spec for runtime command/result capture and storage.
  - Use one child spec for operator policy and when-to-run guidance if that
    surface grows separately.
- Planned child specs:
  - `runtime-flow-benchmark-scenarios` -> controlled tasks, scope, expected
    tools, and acceptance criteria.
  - `runtime-flow-benchmark-runner` -> command/runtime surface, outputs, and
    result persistence.
  - `runtime-flow-benchmark-live-agent` -> real `codex exec` task execution,
    observed tool-call capture, and live benchmark result metrics.
  - `runtime-flow-benchmark-operations` -> operator guidance for when and how
    to use the suite.

## 8) Delivery Plan

1. Define the benchmark philosophy and target only runtime-flow regression
   measurement, not a universal benchmark gate.
2. Define the default benchmark model contract:
   `gpt-5.4-mini` + `low` reasoning for the standard baseline.
3. Define scenario shape for controlled tasks, expected tools, and allowed
   scope.
4. Define required metrics: pass/fail, timing, tool success/failure, retries,
   and prompt/context size when available.
5. Define the "when to run" policy for changes that may break execution flows.
6. Update AGENTS and affected skills/docs so future agents treat this suite as
   a targeted regression instrument.
7. Plan the implementation slice that adds the benchmark runner, result schema,
   and scenario packs.

## 9) Constraints and Assumptions

Assumptions:

- A smaller model tier is sufficient for comparable regression measurement if
  the tasks are tightly controlled.
- Benchmark usefulness depends more on consistent scope than on absolute
  wall-clock precision.
- Not every runtime surface will expose the same prompt/context metrics, so the
  spec must allow "when available" capture.

Constraints:

- The benchmark must remain cheap enough to run selectively after risky changes.
- Scenario definitions must be strict enough that two runs are meaningfully
  comparable.
- The benchmark must not silently widen task scope or depend on open-ended
  exploration.

## 10) Acceptance

Success looks like:

- The roadmap and parent spec define a controlled benchmark family for
  runtime-flow regression measurement.
- Future implementation work has a clear contract for scenario shape, model
  default, metrics, and when-to-run policy.
- AGENTS and the local scaffold skill explain that benchmark runs are advisable
  after risky execution changes, but not mandatory for every task.

Review questions:

- Does the benchmark family measure a real execution flow instead of only static
  commands?
- Is the scenario scope tight enough to compare runs meaningfully?
- Is the default model tier explicit and cheap enough for repeated use?
- Does the policy avoid turning benchmarks into a universal ritual?
- Would a maintainer know when a runtime change deserves a benchmark run?

## 11) Risks and Tradeoffs

- Risk: benchmarks become too expensive -> Mitigation: default to
  `gpt-5.4-mini` low and controlled tasks.
- Risk: benchmarks become ceremonial -> Mitigation: define clear
  when-to-run triggers tied to risky execution changes.
- Risk: timing-only results hide quality regressions -> Mitigation: require
  success/failure and expected-output criteria in every scenario.
- Risk: prompt/context measurement is inconsistent across runtimes ->
  Mitigation: define it as "capture when available" instead of blocking the
  whole suite.

## 12) Verification Philosophy

Evidence expected from delivery:

- Strategic docs proving the benchmark family, default model tier, metrics, and
  targeted usage policy are defined.
- Workbench planning artifacts for the first implementation slice.
- `just lint` and strict workbench verification for the planning/governance
  slice.

Open questions:

- Q-01 Which execution flows should be in the first scenario pack: `implement`,
  `review`, runtime MCP/tool access, or a mix?
- Q-02 Should prompt/context size be captured in the benchmark runner itself or
  as optional runtime telemetry?
- Q-03 Should baseline comparison live in the same repo or an external result
  store?

## 13) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Benchmark-targeted behavior is distinguishable from universal validation

---

*Spec: `docs/arc/SPECS/260423_1605_controlled-runtime-flow-benchmarks_spec_01.md`*
