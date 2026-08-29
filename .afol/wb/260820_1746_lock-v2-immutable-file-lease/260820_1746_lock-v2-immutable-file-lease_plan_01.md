---
doc_type: "workbench_plan"
id: "260820_1746_lock-v2-immutable-file-lease_plan_01"
session_id: "260820_1746_lock-v2-immutable-file-lease"
theme: "lock-v2-immutable-file-lease"
status: "closed"
created_at: "2026-08-20T22:46:24.776Z"
updated_at: "2026-08-20T23:42:41.350Z"
roadmap_feature: "F-34"
feature_id: "F-34"
parent_spec: "260818_public-product-and-portfolio-readiness_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-08-20T23:42:41.350Z"
---

# Plan: lock-v2-immutable-file-lease

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Implement immutable-file completion lease v2 and legacy recovery
- task: Add lock v2 crash, reclaim, race, and forged-artifact coverage
- task: Run full regression and release gates

## Execution Plan

- T-01: Implement immutable-file completion lease v2 and legacy recovery
- T-02: Add lock v2 crash, reclaim, race, and forged-artifact coverage
- T-03: Run full regression and release gates
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
