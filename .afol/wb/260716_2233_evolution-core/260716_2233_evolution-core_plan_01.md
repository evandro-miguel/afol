---
doc_type: "workbench_plan"
id: "260716_2233_evolution-core_plan_01"
session_id: "260716_2233_evolution-core"
theme: "evolution-core"
status: "active"
created_at: "2026-07-17T02:33:20.599Z"
updated_at: "2026-07-17T02:33:20.599Z"
roadmap_feature: "F-30"
feature_id: "F-30"
parent_spec: "260716_2155_afol-evolution-system_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: evolution-core

- Created by native CLI workbench lifecycle.

## Native command metadata

- feature_id: F-30
- parent_spec: 260716_2155_afol-evolution-system_spec_01
- task: Implement Evolution Slice 1 core foundations

## Execution Plan

- T-01: Implement the Evolution Slice 1 foundation as one reversible slice.
- Extend project configuration additively with stable project identity,
  timezone, evolution paths, validated defaults, and old-project compatibility.
- Add a separate versioned `evolution.db` migration runner and production-day
  ledger; do not change the State DB v1 schema.
- Add evolution health/status services and route `afol evolve status` through
  the existing registry, router, help, policy, and JSON envelope patterns.
- Keep analysis, external imports, preferences, recurrence, queue ranking,
  receipt claiming, and automatic application outside this slice.
- Rebuild derived state, capture observed evidence, and request two independent
  read-only critic gates before delivery.

## Validation

- Run focused config, migration, ledger, health, router, registry, and command
  tests first.
- Run typecheck, manifest parity, project validation, and the full release gate.
- Run Gitleaks and OSV through the repository release validation path.
- Confirm old configs remain readable without silent mutation and repeated DB
  initialization is idempotent.

## Closure Criteria

- `afol evolve status` is implemented without LLM calls or critical mutation.
- Evolution schema migration is explicit, idempotent, and reports health.
- Production-day allocation is project-local, timezone-aware, monotonic, and
  safe under repeated qualification of the same local date.
- Existing projects continue to operate without an automatically persisted UUID
  or config rewrite; explicit initialization guidance is reported when needed.
- Every task is marked done only after passed evidence and critic approval.
