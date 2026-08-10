---
doc_type: "workbench_plan"
id: "260810_0841_durable-authorizing-evidence_plan_01"
session_id: "260810_0841_durable-authorizing-evidence"
theme: "durable-authorizing-evidence"
status: "active"
created_at: "2026-08-10T13:41:36.814Z"
updated_at: "2026-08-10T13:41:36.814Z"
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

# Plan: durable-authorizing-evidence

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Make all authorizing evidence appends durable without new recovery state

## Execution Plan

- T-01: Make all authorizing evidence appends durable without new recovery state
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
