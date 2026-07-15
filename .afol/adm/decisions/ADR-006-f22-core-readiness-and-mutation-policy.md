---
doc_type: adr
id: ADR-006
title: F-22 Core Readiness and Selective Mutation Policy
status: accepted
created_at: '2026-07-12T18:47:57-03:00'
updated_at: '2026-07-12T18:47:57-03:00'
decision_type: governance
owners:
- F-22 governance owner
supersedes: ""
superseded_by: ""
affected_specs:
- .afol/adm/specs/260710_core-integrity-and-transaction-safety_spec_01.md
- .afol/adm/specs/260711_c01-authorization-red-reproducers_spec-child_01.md
affected_rules: []
affected_skills: []
affected_commands:
- bun test
- bun run validate:release
- afol validate project
---

# ADR-006: F-22 Core Readiness and Selective Mutation Policy

## Context

F-22 requires evidence that the authorization boundary and core transaction
surfaces are tested without turning an experimental mutation runner into an
unreviewed permanent dependency. The F-22 governance owner records this
amendment on 2026-07-12 under the user's explicit directive to complete core
readiness. It authorizes evidence-only closure validation of already-implemented
C02A, C02B/C03, C03B, C03W, C04A, C05, C07A, and C07B behavior. It does not
authorize or imply new production scope.

## Decision

Accept the current F-22 core-readiness evidence and adopt selective, pinned
Stryker 9.4 mutation testing as a report-only policy:

- Run the command runner from the ignored `.afol/tmp/stryker-runner` workspace,
  pinned to `@stryker-mutator/core` 9.4.0.
- Mutate changed critical scopes only. The initial target is
  `cli/core/operation-context.ts:142-148`.
- Require at least 90% mutation score for authorization scope and 85% for
  central-rule scopes, with zero critical untriaged survivors.
- Permit an exception only when a reviewer records an exact reason that a
  survivor is equivalent, invalid, or irrelevant; the decision owner and
  review must be named in the evidence.
- Run report-only first. Do not add a permanent package dependency or global
  release gate until the runtime and command runner are stable.

The focused operation-context run started at 10/16 killed (62.5%) and ended at
16/16 killed (100%), with no survivors, in approximately 22.5 seconds. Durable
evidence is recorded at
`.afol/wb/260710_2355_core-integrity-quality-loop/reports/c08-mutation-policy-evidence-001.json`.

The immutable evidence binds StrykerJS 9.4.0, base commit `25089a5`, and SHA-256
hashes for the temporary config, generated report, production target, and test
target. The durable JSON contains the full digests.

The supported F-22 boundary is one Linux/WSL host per worktree. Windows-native
execution is routed to F-26 and is not claimed by this decision.

## Route dispositions

- C02A, C02B/C03, C03B, C03W, C04A, C05, C07A, and C07B are satisfied by the
  existing registry/context, lifecycle, bootstrap, publication,
  command-envelope, bounded-v1 state, isolation, and rebuild tests recorded in
  the evidence artifact.
- C04A acceptance is bounded to SQLite State DB v1 completeness. State DB v2,
  durable-event migration, downgrade, and recovery remain F-25 scope.
- C05 acceptance is bounded to one Linux/WSL host per worktree. It makes no
  cross-host coordination or takeover claim.
- For C08, Windows-native F-26 and F-23 through F-28 are accepted exclusions
  and separately governed future features, not F-22 closure prerequisites.
  None is silently implemented or closed by this ADR.

## Rationale

The policy gives changed security-critical logic a reproducible mutation
oracle while keeping tool installation and release behavior reversible. The
thresholds distinguish critical authorization logic from broader central rules,
and the explicit exception/review path prevents false-green closure.

## Verification

Rerun the exact evidence and release checks with:

```text
bun test cli/tests/operation-context.test.ts cli/tests/kernel.test.ts
bun run typecheck
bun run manifest:check
bun run validate:project-benchmarks
bun run validate:release
afol local-state rebuild --json
afol validate project --json
afol verify-tasks .afol/wb/260710_2355_core-integrity-quality-loop --strict
```

## Status

accepted
