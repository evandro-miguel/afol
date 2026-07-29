---
doc_type: adr
id: ADR-007
title: Proposed F-30 Agent Submission and Review Boundary
status: proposed
created_at: '2026-07-18T00:00:00-03:00'
updated_at: '2026-07-18T00:00:00-03:00'
decision_type: governance
owners:
- F-30 governance owner
supersedes: ''
superseded_by: ''
affected_specs:
- .afol/adm/specs/260717_agent-submission-and-batch-review_spec_01.md
affected_rules: []
affected_skills: []
affected_commands: []
---

# ADR-007: Proposed F-30 Agent Submission and Review Boundary

## Status and non-authority

This is a proposed design note for the planned F-30 backlog. It is not an
accepted architecture decision, does not authorize implementation, and does
not claim that `afol dispatch`, `afol submit`, `afol review`, or an F-30
benchmark pack exists.

## Context

AFOL may eventually need a compact way for a worker to return declarative
delivery state while keeping acceptance authority with an orchestrator. The
current lifecycle and evidence commands remain canonical until that work is
implemented and reviewed.

## Proposed boundary

- A future worker submission would remain declarative and non-authorizing.
- A future independent review could validate actual paths, focused checks,
  evidence, and lifecycle state before any projection.
- Actor labels, assignment metadata, and transport markers would not be
  authentication; stronger isolation would require an external launcher or OS
  boundary.

## Options retained for future review

1. Keep existing lifecycle commands as the operator path.
2. Add a governed one-worker submission/review slice after a child spec and
   deterministic tests exist.
3. Defer multiworker leases, provider adapters, brokers, and identity systems
   to separate governed workstreams.

## Consequences

No runtime, registry, catalog, or lifecycle behavior changes follow from this
proposal. Any implementation must preserve observed evidence, canonical task
state, and AFOL as the sole public entrypoint, and must record fresh evidence
before promotion to an accepted decision.

## Verification required before acceptance

- Public commands and catalogs are real and registered.
- Deterministic authority, path, drift, idempotency, recovery, and refresh
  gates pass.
- Benchmark coverage references existing surfaces strictly for every status;
  only implemented scenarios create proof.
- Live provider availability and token-efficiency claims are evidenced rather
  than inferred from snapshots.

## Status

proposed; non-authorizing backlog guidance only.
