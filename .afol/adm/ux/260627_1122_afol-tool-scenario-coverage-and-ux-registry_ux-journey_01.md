---
doc_type: ux-journey
id: 260627_1122_afol-tool-scenario-coverage-and-ux-registry_ux-journey_01
theme: afol-tool-scenario-coverage-and-ux-registry
status: active
owners:
- orchestrator
created_at: '2026-06-27T15:22:00Z'
updated_at: '2026-06-27T15:22:00Z'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
source_spec: 260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01
benchmark_pack: governance-history
---

# UX Journey: AFOL Tool Scenario Coverage And UX Registry

## Purpose

- User or agent: maintainer, orchestrator, benchmark agent, maintenance agent.
- Goal: prove a command or user-flow claim by finding the journey, expected
  output, warning behavior, scenario lane, and validation command.
- Context: a project changes AFOL commands, lifecycle behavior, maintenance
  warnings, memory/library cadence, or agent UX expectations.

## Entry And Exit

- Entry point: `afol ux list` or `afol ux coverage --tool maintenance`.
- Success exit: `afol ux validate` passes and the relevant command has a
  journey or explicit benchmark backlog.
- Recovery exit: `afol ux register --from-spec <spec-id> --dry-run` proposes a
  missing journey draft without mutating files.

## Flow

1. Maintainer lists registered journeys.
   - Information shown: registered `ux-journey` docs and spec-derived journeys.
   - User or agent decision: choose the journey that matches the changed tool.
   - AFOL command/tool: `afol ux list`.
   - System state: read-only registry projection.
   - Possible failure: required standard or template missing.
   - Recovery: restore `docs/standards/user-journey-registry.md` and
     `docs/templates/ux-journey.md`.
2. Maintainer inspects the journey.
   - Information shown: purpose, flow, expected commands, evidence, metrics,
     and acceptance.
   - User or agent decision: confirm expected output and warning behavior.
   - AFOL command/tool:
     `afol ux show 260627_1122_afol-tool-scenario-coverage-and-ux-registry_ux-journey_01`.
   - System state: read-only journey detail.
   - Possible failure: journey id not found.
   - Recovery: use `afol ux list` and reopen the right id.
3. Maintainer checks maintenance warning coverage.
   - Information shown: journeys that mention maintenance command paths.
   - User or agent decision: verify warnings are visible before claiming
     memory/library/workbench maintenance readiness.
   - AFOL command/tool: `afol ux coverage --tool maintenance`.
   - System state: read-only coverage summary.
   - Possible failure: no journey names `afol maintenance`.
   - Recovery:
     `afol ux register --from-spec 260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01 --dry-run`.
4. Maintenance agent exercises warning commands.
   - Information shown: due cleanup, stale memory/library review, old sessions,
     rules/skills/docs review, and bounded token output.
   - User or agent decision: schedule review or archive work without deleting
     data.
   - AFOL command/tool: `afol maintenance weekly --dry-run`,
     `afol maintenance monthly --dry-run`,
     `afol maintenance review --area memory --dry-run`,
     `afol maintenance review --area library --dry-run`.
   - System state: dry-run advisory output only.
   - Possible failure: warning text missing or output exceeds token budget.
   - Recovery: update maintenance rules, skills, scenario expectations, and
     rerun `afol validate bench --pack governance-history --json`.
5. Maintainer validates registry health.
   - Information shown: missing required files, invalid standalone journey
     fields, and total journey count.
   - User or agent decision: block release if validation fails.
   - AFOL command/tool: `afol ux validate`.
   - System state: read-only validation.
   - Possible failure: standalone journey misses headings or required
     frontmatter.
   - Recovery: repair the journey from `docs/templates/ux-journey.md`.

## Expected Result

- Output: compact JSON or human output names journeys, commands, coverage, and
  missing fields.
- Durable state change: none for list/show/validate/coverage; register writes
  only after local approval.
- Warning or review prompt: maintenance flow shows memory, library, old session,
  roadmap/spec/manifest/rule/skill/doc review prompts when due.
- Token/output budget: `afol ux` commands should remain below 500 output tokens
  by default; any command exceeding 5,000 output tokens is a bug.

## States And Recovery

| State | User-visible output | Safe correction or continuation |
| --- | --- | --- |
| default | Compact journey and coverage summary | Inspect one journey or tool without mutation |
| empty | No journey or tool match | List valid ids, then retry with a listed id |
| invalid journey | Exact missing heading, marker, or frontmatter field | Repair from `docs/templates/ux-journey.md`; existing state is unchanged |
| partial coverage | Covered and uncovered commands remain distinguishable | Add the missing implemented scenario; covered lanes may continue |
| permission denied | Registration states that local approval is required | Keep the dry-run preview and rerun from an authorized local context |
| stale live evidence | Snapshot age and receipt refresh command are shown | Refresh through the external harness; scripted checks remain usable |
| success | Validation count, coverage, and next inspection command are shown | Continue to the relevant benchmark or release gate |
| returning user | Current registry counts and new issues are summarized | Resume from the named issue without repeating successful checks |

## Evidence

- Scripted scenario:
  `.afol/data/benchmarks/catalog/scenarios/governance-history/ux-registry-lifecycle.json`.
- Live-agent scenario:
  `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-maintenance-cadence.json`.
- Benchmark pack: `afol validate bench --pack governance-history --json`.
- Report or workbench evidence:
  `.afol/wb/260627_1250_scenario-subcommand-backlog/.evidence.jsonl`.

## Metrics

- Completion criterion: `afol ux validate` exits 0 and
  `afol ux coverage --tool maintenance` returns at least one journey.
- Error/retry criterion: missing standards, missing headings, or missing
  command coverage blocks the scenario.
- User effort or latency criterion: list/show/validate/coverage complete under
  300 ms deterministic benchmark threshold.

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit
