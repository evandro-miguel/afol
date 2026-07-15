---
doc_type: spec-child
id: 260715_afol-1-0-local-diagnostics_spec-child_01
theme: afol-1-0-local-diagnostics
status: final
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define offline local diagnostics and integrity evidence for AFOL 1.0.
created_at: '2026-07-15T20:40:00Z'
updated_at: '2026-07-15T20:40:00Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  plan: .afol/wb/260715_1636_afol-1-0-governance-bootstrap/260715_1636_afol-1-0-governance-bootstrap_plan_01.md
risk_level: high
---

# SPEC CHILD: AFOL 1.0 Local Diagnostics

## Intent

- Outcome: operators can inspect newly caught integrity/unexpected failures and
  offline local feedback without exposing raw stacks, secrets, or network data.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

Diagnostics have a distinct privacy, persistence, and contention contract from
release packaging. Keeping this child separate lets tests prove redaction and
failure atomicity without coupling them to platform build claims.

## Required Behavior

- Existing result envelopes and error text remain unchanged; only newly caught
  unexpected/integrity failures may add optional diagnostic metadata and a
  collision-resistant report ID.
- Local feedback is offline, root-free, redacted before persistence, and
  explicitly disabled or local by mode (`off|local`).
- SQLite/WAL or equivalent local writes are bounded under multiprocess
  contention; no lost update, duplicate annotation, unsafe purge, or silent
  corruption is accepted.
- Diagnostic output never prints raw stacks, tokens, cookies, credentials, or
  arbitrary environment values.

## Boundaries

In scope:

- Diagnostic boundary, report IDs, redaction, local persistence, and focused
  fault-injection/concurrency tests.
- Specs index/frontmatter drift validation as the governance integrity check.

Out of scope:

- Network listeners, remote sync, Feedback Hub, MCP transport, Windows/macOS,
  ARM, result/v2, and unrelated product CLI redesign.

## Acceptance

- [x] Positive and negative tests prove redaction, offline behavior, bounded
  contention, and stable existing envelopes.
- [x] Fault injection leaves no partial diagnostic record or corrupted index.
- [x] No raw stack or secret value appears in persisted or displayed output.
- [x] `afol validate project --check-drift --json` catches index/frontmatter
  drift and passes on the reconciled repository.

## Closure

Diagnostics are final in `260715_1811_afol-1-0-final-status` on
`E-20260715172724325-99e5fa` from the governed F-29 diagnostics session. The
observed full-test result was `1203/0`; the implementation remains offline,
redacted, opt-in, and bounded without a network or result/v2 claim.

## Verification Plan

Run the focused diagnostics/integrity test files plus the project validation
fixture. Record exact commands and observed evidence in the governed F-29
session; retain failed evidence as blockers.

## Rollout and Backout

Ship diagnostics additively behind the local mode boundary. If privacy,
contention, or envelope compatibility fails, disable the new path and retain
the existing error contract while leaving the child draft for remediation.
