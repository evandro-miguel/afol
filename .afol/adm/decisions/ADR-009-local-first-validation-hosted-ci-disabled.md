---
doc_type: adr
id: ADR-009
title: Local-First Validation; Automatic Hosted CI Disabled
status: accepted
created_at: '2026-08-21T20:45:00-03:00'
updated_at: '2026-08-21T20:45:00-03:00'
decision_type: governance
owners:
- orchestrator
supersedes: ""
superseded_by: ""
affected_specs:
- .afol/adm/doctrine/RELEASE-RUNBOOK.md
affected_rules: []
affected_skills: []
affected_commands:
- afol validate project
- bun run validate:release
---

# ADR-009: Local-First Validation; Automatic Hosted CI Disabled

## Context

- The GitHub Actions account has no runner budget. Every automatic run since
  2026-07 fails at job start with a billing annotation (see lesson
  `20260729_1213_ci-billing-failures-are-administrative`), so the hosted
  pipeline provides zero signal while remaining configured as a required
  expectation for pushes and pull requests.
- The repository already defines a complete local validation chain
  (`validate:release`: version/manifest checks, biome, oxlint, knip, full
  tests, coverage, security scanners, deterministic build, provenance,
  smokes) that produces stronger evidence than the thin hosted job.
- The user explicitly decided on 2026-08-21 to stop paying (or owing) for
  hosted runners and to make local validation the release gate.

## Decision

- Remove `push` and `pull_request` triggers from the `afol-ci` workflow. It
  remains in the repository as an opt-in `workflow_dispatch` tool for when
  billing allows manual observation.
- Local validation against the exact candidate SHA is the canonical release
  and merge evidence.
- Documentation must never describe a missing or administratively
  unavailable hosted run as green, red, or failed product code.

## Options Considered

1) Keep automatic triggers and ignore failures

- Pros: no diff.
- Cons: permanent false-failure noise; contradicts the existing lesson.
- Risks: trains agents to distrust CI entirely.

2) Delete the workflow file

- Pros: simplest tree.
- Cons: discards a validated pipeline definition that costs nothing while
  idle.
- Risks: harder to restore hosted observation later.

3) Manual-dispatch only (chosen)

- Pros: zero runner consumption in normal flow; pipeline preserved as
  opt-in; contract test locks the trigger surface; aligns doctrine and
  lesson.
- Cons: hosted observation requires an explicit action plus billing.
- Risks: none technical; documented.

## Rationale

Local gates are strictly more comprehensive than the hosted job and are the
only source that can observe the exact candidate SHA deterministically.
Paying (or accruing debt) for a runner that cannot start buys no signal.
Manual dispatch keeps future optionality without cost.

## Consequences

- `cli/tests/release-toolchain.test.ts` asserts manual-dispatch-only triggers
  and the ADR-009 marker inside the workflow.
- `.afol/adm/doctrine/RELEASE-RUNBOOK.md` describes local-first validation as
  the release evidence chain.
- Contributors need no Actions minutes; PR review relies on local runs of the
  checks listed in CONTRIBUTING.md.
