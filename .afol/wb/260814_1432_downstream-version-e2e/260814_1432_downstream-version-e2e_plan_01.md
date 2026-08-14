---
doc_type: "workbench_plan"
id: "260814_1432_downstream-version-e2e_plan_01"
session_id: "260814_1432_downstream-version-e2e"
theme: "downstream-version-e2e"
status: "active"
created_at: "2026-08-14T19:32:11.558Z"
updated_at: "2026-08-14T19:32:11.558Z"
roadmap_feature: "F-30"
feature_id: "F-30"
parent_spec: "260716_2155_afol-evolution-system_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: downstream-version-e2e

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-30
- parent_spec: 260716_2155_afol-evolution-system_spec_01
- task: Run compiled AFOL happy-path and nonblocking-warning lifecycle in a disposable downstream project
- task: Run compiled AFOL carry-open, idempotency, recovery, and negative-path lifecycle in an isolated downstream project
- task: Consolidate artifact identity, full gates, and strict evidence

## Execution Plan

- T-01: Run compiled AFOL happy-path and nonblocking-warning lifecycle in a disposable downstream project
- T-02: Run compiled AFOL carry-open, idempotency, recovery, and negative-path lifecycle in an isolated downstream project
- T-03: Consolidate artifact identity, full gates, and strict evidence
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
