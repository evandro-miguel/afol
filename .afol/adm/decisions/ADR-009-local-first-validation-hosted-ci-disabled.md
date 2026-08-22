---
doc_type: adr
id: ADR-009
title: Local-First Validation; Automatic Hosted CI Disabled
status: accepted
created_at: '2026-08-21T20:45:00-03:00'
updated_at: '2026-08-21T21:55:00-03:00'
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

- The repository ships no GitHub Actions workflows. The former `afol-ci`
  workflow was removed outright after the account situation proved
  permanent: there is no premium plan, so hosted runners can never start.
- Local validation against the exact candidate SHA is the canonical release
  and merge evidence, with no hosted counterpart to wait for.
- Documentation must never describe a missing or administratively
  unavailable hosted run as green, red, or failed product code.
- Reintroducing any hosted automation requires a new decision record; a
  contract test asserts `.github/workflows` stays absent.

## Options Considered

1) Keep automatic triggers and ignore failures

- Pros: no diff.
- Cons: permanent false-failure noise; contradicts the existing lesson.
- Risks: trains agents to distrust CI entirely.

2) Delete the workflow file (chosen)

- Pros: zero dead code; contract test locks `.github/workflows` absent;
  doctrine and lesson stay aligned; nothing to maintain.
- Cons: restoring hosted observation later requires recreating the workflow.
- Risks: none technical; git history preserves the recipe.

3) Manual-dispatch only (superseded same day)

- Pros: pipeline preserved as opt-in.
- Cons: kept a permanently unrunnable pipeline plus its contract test alive
  for no signal; the account has no premium plan, so dispatch could never
  start a runner either.

## Rationale

Local gates are strictly more comprehensive than the hosted job and are the
only source that can observe the exact candidate SHA deterministically.
Paying (or accruing debt) for a runner that cannot start buys no signal.
Local gates are strictly more comprehensive than the hosted job and are the
only source that can observe the exact candidate SHA deterministically. With
no premium plan, even manual dispatch could never start a runner, so keeping
the file bought nothing.

## Consequences

- `cli/tests/release-toolchain.test.ts` asserts `.github/workflows` stays
  absent; reintroduction is a decision-record event.
- `.afol/adm/doctrine/RELEASE-RUNBOOK.md` describes local-first validation as
  the release evidence chain.
- Contributors need no Actions minutes; PR review relies on local runs of the
  checks listed in CONTRIBUTING.md.
