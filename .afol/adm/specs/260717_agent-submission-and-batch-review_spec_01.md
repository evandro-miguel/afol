---
doc_type: spec-child
id: 260717_agent-submission-and-batch-review_spec_01
theme: agent-submission-and-batch-review
status: active
implementation_status: planned
owners:
- F-30 governance owner
workstream_intent: Explore a governed one-worker submission and review boundary.
artifact_purpose: Backlog intent only; this spec authorizes no implementation or public command.
created_at: '2026-07-17T00:00:00-03:00'
updated_at: '2026-07-18T00:00:00-03:00'
roadmap_feature: F-30
spec_role: child
parent_spec: 260716_2155_afol-evolution-system_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md
  adr: .afol/adm/decisions/ADR-007-agent-submission-review-boundary.md
  evolution_adr: .afol/adm/decisions/ADR-008-afol-evolution-autonomy-and-evidence-boundary.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - future orchestration commands and lifecycle integration
  - future workbench submission artifacts and observed review evidence
  - benchmark and validation contracts after implementation exists
  packages:
  - AFOL CLI
risk_level: high
---

# SPEC CHILD: Agent Submission and Batch Review

## Intent and status

This F-30 child records a possible one-worker `dispatch -> submit -> review` workflow.
The current repository has no public commands, registry entries, benchmark
pack, or live scenario for this route. This document is a nonimplemented
backlog contract and does not authorize implementation, lifecycle mutation, or
release claims.

## Proposed boundary

- Worker submissions would be declarative and non-authorizing.
- Only an independent review would be allowed to create observed authorizing
  evidence or project acceptance onto canonical lifecycle state.
- Strong worker isolation would remain an external launcher or OS boundary;
  actor labels and assignment metadata are not authentication.

## Deferred scope

Before implementation is considered, a child spec must define the smallest
executable slice, public command registration, assignment persistence, path and
worktree checks, idempotency/recovery behavior, and deterministic tests. A
future benchmark scenario must use an explicit valid implementation status and
fresh observed evidence; planned intent never counts as proof.

Out of scope until separately governed: multiworker leases, provider adapters,
daemon or broker services, identity credentials, deployment, and global
installation.

## Acceptance gates for a future implementation slice

- Commands and static catalogs exist in the current AFOL registry.
- Deterministic tests prove authority, path integrity, drift handling,
  idempotency, recovery, and refresh bounds.
- Benchmark scenarios cover only existing commands and use strict coverage
  references. Only `implemented` scenarios create production proof.
- Snapshot and direct live evidence are separate gates; unavailable providers
  remain explicit blockers.

## Lifecycle

Keep the opt-in route absent and existing lifecycle commands authoritative until
the backlog is decomposed, implemented, and independently reviewed. Promotion
to an active or final spec requires fresh evidence and index updates.

---

*Planned child spec under F-30’s AFOL Evolution parent; not an implementation claim.*
