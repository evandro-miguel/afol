---
doc_type: "workbench_plan"
id: "260729_0000_session-resolution-reliability_plan_01"
session_id: "260729_0000_session-resolution-reliability"
theme: "session-resolution-reliability"
status: "active"
created_at: "2026-07-29T05:00:48.386Z"
updated_at: "2026-07-29T05:00:48.386Z"
roadmap_feature: "F-20"
feature_id: "F-20"
parent_spec: "260426_1215_parallel-session-isolation_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: session-resolution-reliability

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-20
- parent_spec: 260426_1215_parallel-session-isolation_spec_01
- task: Unify implicit session resolution and recovery
- task: Implement create-select and close cleanup
- task: Prove write-path latency, token economy, and regressions
- task: Complete adversarial review and closure

## Execution Plan

- T-01: Unify implicit session resolution and recovery
- T-02: Implement create-select and close cleanup
- T-03: Prove write-path latency, token economy, and regressions
- T-04: Complete adversarial review and closure
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
