---
doc_type: "workbench_plan"
id: "260806_1805_state-repair_plan_01"
session_id: "260806_1805_state-repair"
theme: "state-repair"
status: "active"
created_at: "2026-08-06T23:05:45.592Z"
updated_at: "2026-08-06T23:05:45.592Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: state-repair

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Rebuild derived project state and validate current dev SHA

## Execution Plan

- T-01: Rebuild derived project state and validate current dev SHA
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
