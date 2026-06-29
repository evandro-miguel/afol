---
doc_type: spec-child
id: 260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01
theme: afol-tool-scenario-coverage-and-ux-registry
status: final
closure_note: "Delivered: command-surface coverage gate, UX journey registry/list/show/validate/coverage/register, alias normalization, saved-result runtime-live validation, and focused tests for show plus restricted non-dry-run registration."
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define full AFOL command scenario coverage and a UX journey
  registry contract for benchmarkable user flows.
created_at: '2026-06-27T15:22:00Z'
updated_at: '2026-06-27T15:22:00Z'
roadmap_feature: F-11
spec_role: child
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  coverage_plan: .afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md
  ux_standard: docs/standards/user-journey-registry.md
risk_level: medium
---

# SPEC CHILD: AFOL Tool Scenario Coverage And UX Registry

## Intent

- Outcome: every AFOL command and documented subcommand has an explicit test
  journey, expected result, and evidence lane.
- Roadmap feature: `F-11`
- Parent spec: `260521_0110_validation-ci-and-benchmarks_spec_01`

## Current Facts

- `.afol/adm/tools.json` currently lists 44 AFOL command tools.
- `cli/registry.ts` currently exposes 138 command and subcommand surface items.
- `.afol/data/benchmarks/catalog/` currently has 68 scenario files across 15
  packs.
- `runtime-live-agent` currently has 4 JSON scenarios.
- The benchmark registry currently has zero command or subcommand coverage
  exemptions.
- `governance-history/tool-surface-coverage-matrix` maps all 138 command and
  subcommand surfaces to journeys, objectives, expected results, and use cases.
- `governance-history/feature-spec-coverage-matrix` maps every `F-xx` roadmap
  feature and every root spec to implemented benchmark coverage.
- `afol validate bench` fails when a roadmap feature has `TBD`, stale
  governing spec, missing feature coverage, or a root spec lacks scenario
  coverage.
- Runtime live-agent validation now requires the saved result artifact named by
  the snapshot before live coverage can pass.
- Deeper executable fixtures remain required when a command behavior changes or
  a production incident exposes a weak path.

## User Or Operator Journey

1. A maintainer asks whether AFOL tools really work in production-like agent
   flows.
2. The maintainer opens the coverage plan and sees every command mapped to a
   scenario lane.
3. For simple read-only commands, the maintainer runs scripted fixture checks.
4. For agent-decision flows, the maintainer runs live-agent scenarios that force
   the task to naturally require the relevant AFOL tools.
5. The maintainer inspects saved benchmark results, tool-call logs, token
   budget, warnings, and expected output.
6. A project UX journey is considered registered only when the governing spec,
   optional `ux-journey` doc, and evidence explain the user goal, command path,
   states, failure recovery, and validation command.

## Required Scenario Lanes

- `scripted-surface`: deterministic fixture scenario for every command and
  documented subcommand.
- `fixture-mutation`: isolated fixture for commands that can write, append, or
  generate files.
- `live-agent`: bounded `gpt-5.4-mini` agent scenario when tool choice, memory,
  research, workbench execution, update safety, maintenance, or governance
  behavior matters.
- `ux-journey`: registered user flow with actor, goal, entry point, steps,
  states, expected output, recovery, and metric.

## Live-Agent Families

Live-agent coverage is reserved for flows where agent judgment matters. Do not
turn every deterministic command into a live prompt; prove deterministic
behavior with scripted catalog scenarios first.

- Research/preflight agent: `preflight`, `ctx`, `pstr`, `spec`, `adr`,
  `changelog`, `library`, and `rule`.
- Memory/library agent: `memory`, `library`, `health`, `maintenance`, `ctx`,
  and `state`.
- Workbench execution agent: `new`, `start`, `log`, `evidence`, `done`,
  `close`, `verify`, `verify-tasks`, `session`, and `catchup`.
- Mutation/update agent: `file`, `update`, `init`, `bootstrap`, `adapter`, and
  `schema` in dry-run or isolated fixture mode.
- Benchmark/telemetry agent: `bench`, `validate`, `project-benchmark`,
  `telemetry`, `db`, `doctor`, and `sweep`.

## UX Registry Contract

- The source of truth stays in existing AFOL governance artifacts:
  roadmap -> parent spec -> child spec -> spec-test -> workbench evidence.
- `afol ux` is the active reader and validator for journey discovery, field
  checks, and tool coverage queries.
- `afol ux` must not replace roadmap/spec/spec-test/workbench evidence as the
  source of truth.
- Use `docs/templates/ux-journey.md` only when a journey is complex enough to
  need a standalone flow document.
- A registered UX journey must name:
  - primary user and goal
  - trigger and entry point
  - expected AFOL commands or tools
  - system states and visible feedback
  - expected output or durable state change
  - failure and recovery path
  - evidence command, benchmark pack, or report
  - metric or acceptance threshold

## First Implementation Slice

- Add a registry-to-scenario coverage gate over `cli/registry.ts`,
  `.afol/adm/tools.json`, and catalog scenario metadata.
- Add scripted packs for validation gates, ops observability, platform controls,
  and missing workflow exact-usage coverage.
- Keep `runtime-live-agent` as the live-agent lane and expand it only for named
  production failure modes.
- Implement `afol ux` list/show/validate/coverage/register over the existing
  governance artifacts.
- Cover the `afol ux` subcommands with a scripted `governance-history`
  scenario.

## Out Of Scope

- Creating a second UX registry tree outside roadmap/spec/spec-test evidence.
- Claiming a changed command behavior is production-tested before saved
  benchmark reports exist for the relevant scripted or live lane.
- Running destructive or side-effecting command paths outside isolated fixtures.

## AFOL UX Module

Active CLI surface:

```bash
afol ux list
afol ux show <journey-id>
afol ux validate
afol ux coverage --tool <afol-command>
afol ux register --from-spec <spec-id>
```

The reader validates existing roadmap/spec/spec-test frontmatter and optional
`ux-journey` docs. It does not create a second governance source of truth.
`register --from-spec` writes only after local approval; `--dry-run` is the
benchmark-safe path.

## Acceptance

- [x] Coverage plan lists all 44 AFOL command tools from `.afol/adm/tools.json`.
- [x] Coverage plan defines how 138 command/subcommand surface items become
  scripted scenarios.
- [x] Live-agent families cover research, memory/library, workbench, update,
  maintenance, benchmark, and telemetry flows.
- [x] First implementation slice prioritizes registry-to-scenario scripted
  coverage before adding more live-agent prompts.
- [x] UX journey registry standard is documented and exported in the template.
- [x] Template includes the journey template and rule.
- [x] `afol ux` validates and queries journeys without changing the registry
  model.
- [x] Full surface matrix replaces the former 89 subcommand exemptions; registry
  exemptions are now empty.
- [x] Runtime live-agent validation fails when the saved result artifact is
  missing.
- [x] `afol ux coverage` normalizes public aliases before matching journeys.
- [x] Feature/spec coverage matrix blocks roadmap features without governing
  specs and root specs without scenario coverage.

## Risks And Follow-ups

- Risk: a separate UX tree drifts from specs -> Mitigation: roadmap/spec/spec-
  test remain canonical.
- Risk: command count grows without coverage -> Mitigation: validation should
  compare `.afol/adm/tools.json` against the coverage matrix.
- Risk: catalog metadata is mistaken for production proof -> Mitigation: require
  saved run/report artifacts before "all tools tested" claims.
- Risk: existing runtime benchmark specs use a roadmap id that now means config
  rehome -> Follow-up: reconcile benchmark spec roadmap metadata in a separate
  governance cleanup.

---

*Template: `docs/templates/spec-child.md`*
