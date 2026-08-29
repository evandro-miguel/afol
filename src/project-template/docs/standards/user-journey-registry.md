---
doc_type: standard
id: user-journey-registry
status: active
created_at: '2026-06-27T15:22:00Z'
updated_at: '2026-06-27T15:22:00Z'
title: User Journey Registry Standard
---

# User Journey Registry Standard

User journeys are critical AFOL governance artifacts. They define what a user or
agent is trying to accomplish, which AFOL tools should be used, what output must
appear, and how the flow is verified.

## Canonical Registry

Use the existing governance chain as the registry:

1. Roadmap feature: why the journey matters.
2. Parent spec: product or system behavior.
3. Child spec: bounded implementation or benchmark slice.
4. Spec-test: command path, expected output, evidence, and pass/fail rule.
5. Optional `ux-journey` doc: only for complex multi-step flows.
6. Workbench evidence: proof from execution.

Do not create a separate UX source of truth that can drift from specs.

## Required Fields

A registered journey must name:

- journey id and owner
- primary user or agent
- user goal and context
- entry point or trigger
- steps and decisions
- expected AFOL commands/tools
- visible system states
- expected output or durable state change
- failure and recovery path
- evidence command, benchmark pack, or report
- metric or acceptance threshold

## Agent Experience Mapping

Use separately licensed UX guidance for complex user or agent journeys. When a
flow spans commands, workbench state, warnings, delegated agents,
governance docs, or maintenance cadences, map it as an experience or service
blueprint, not only a command checklist.

Agent UX maps must separate facts, assumptions, and unknowns; name touchpoints
such as roadmap, specs, workbench, memory, library, rules, skills, benchmark
catalog, telemetry, and reports; and define recovery for stale sessions,
missing evidence, failed validation, overdue reviews, and excessive output.

Minimum complex-journey shape:

- current experience map: phase, action, thought or question, emotion or risk,
  touchpoint, evidence, friction, and opportunity
- target experience map: target behavior, needed change, owner, metric, and
  validation
- service blueprint: frontstage output, backstage agent/system work, systems or
  data touched, policy or guardrail, and failure mode
- state coverage: default, in-progress, empty, error, partial failure,
  permission denied, stale state, success, first use, and returning user

For delegated-agent flows, the journey must state the handoff contract:
objective, root, allowed tools, forbidden surfaces, write scope, session/task
ids, required skills, expected evidence, token/output budget, and closure gate.

## AFOL Tool Coverage

Any command behavior change must update or explicitly defer the scenario row in
`.afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md`.

Claims like "all tools tested" are valid only when:

- `.afol/adm/tools.json` count matches the coverage matrix
- each `### F-xx` roadmap feature maps to one concrete governing spec
- each roadmap feature and root spec appears in implemented scenario coverage
- every documented subcommand has a scripted scenario
- agent-decision flows have live-agent scenarios
- saved benchmark result/report artifacts exist for the relevant scenario lane
- warnings, rotations, cleanup, and review prompts are part of the expected
  output when relevant

Current executable gate:

- `afol validate bench` reads
  `.afol/data/benchmarks/catalog/registry.json.coverage`.
- A command is covered when it appears in `scenario.command` or
  `scenario.coverage.commands`.
- A documented subcommand is covered when it appears in
  `scenario.coverage.subcommands`.
- A roadmap feature is covered when it appears in
  `scenario.coverage.features`.
- A root spec is covered when its spec ID or `.afol/adm/specs/*.md` path appears
  in `scenario.coverage.specs`.
- A full-surface claim requires `registry.json.coverage.exemptions` and
  `registry.json.coverage.subcommand_exemptions` to be empty.
- Any temporary command or subcommand gap must appear in those arrays with an
  explicit reason and is visible backlog, not passing proof.
- Missing command coverage fails with `tool-coverage-missing:<command>`.
- Missing subcommand coverage fails with
  `tool-subcommand-coverage-missing:<command> <usage>`.
- Missing feature/spec coverage fails with
  `scenario-feature-coverage-missing:<feature>` or
  `scenario-spec-coverage-missing:<spec-id>`.
- A roadmap feature with `TBD` or stale governing spec fails benchmark
  validation before production-readiness can be claimed.
- Runtime live-agent coverage must bind to saved result artifacts.
- Full-surface claims still require benchmark result/report artifacts for the
  relevant scripted or live lane.

## AFOL UX Module

`afol ux` is the AFOL reader and validator over existing roadmap/spec/spec-
test/frontmatter data and optional standalone journey docs:

```bash
afol ux list
afol ux show <journey-id>
afol ux validate
afol ux coverage --tool <afol-command>
afol ux register --from-spec <spec-id>
```

The command must not create another source of truth. It reads:

- `.afol/adm/specs/**` for spec-derived journeys.
- `.afol/adm/ux/**` for standalone journeys that need more detail than a spec.
- `docs/ux/**` when a project keeps local UX notes.

`afol ux register --from-spec <spec-id>` creates a spec-linked journey draft
only after local interactive approval. Use `--dry-run` in tests, benchmarks, and
agent planning.

Expected usage:

- `afol ux list`: show registered and spec-derived journeys.
- `afol ux show <journey-id>`: inspect one journey, including commands and
  evidence links.
- `afol ux validate`: fail when required standards/templates or standalone
  journey fields are missing. Every standalone journey must name its success
  exit, recovery exit, visible output, durable-state effect, warning/review
  prompt, output budget, and `States And Recovery`; a flow without a safe next
  action cannot count as UX coverage.
- `afol ux coverage --tool <afol-command>`: show journeys that mention a tool.
- `afol ux register --from-spec <spec-id>`: create a draft journey from a
  governing spec without replacing that spec.

## Validation

- For docs/process changes: `afol validate project`.
- For command/tool changes: `afol validate bench --pack <relevant-pack> --json`.
- For UX registry changes: `afol ux validate` and
  `afol ux coverage --tool <command>`.
- For live-agent changes: run the matching live-agent scenario pack and inspect
  saved tool-call evidence.

---

*Standard: `docs/standards/user-journey-registry.md`*
