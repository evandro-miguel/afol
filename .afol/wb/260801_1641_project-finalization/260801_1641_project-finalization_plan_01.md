---
doc_type: "workbench_plan"
id: "260801_1641_project-finalization_plan_01"
session_id: "260801_1641_project-finalization"
theme: "project-finalization"
status: "active"
created_at: "2026-08-01T21:41:39.087Z"
updated_at: "2026-08-01T21:41:39.087Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: project-finalization

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Repair and validate the current F-32 benchmark path
- task: Run release and security closure gates
- task: Reconcile F-29, F-31, F-32 governance and open sessions

## Execution Plan

- T-01: Repair and validate the current F-32 benchmark path
- T-02: Run release and security closure gates
- T-03: Reconcile F-29, F-31, F-32 governance and open sessions
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
