---
doc_type: "workbench_plan"
id: "260710_2018_review-followup-integrity_plan_01"
session_id: "260710_2018_review-followup-integrity"
theme: "review-followup-integrity"
status: "active"
created_at: "2026-07-11T00:18:21.795Z"
updated_at: "2026-07-11T00:18:21.795Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: review-followup-integrity

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Fix bootstrap and update mutation guards
- task: Fix lifecycle parsing warnings and repository verification
- task: Fix governance binding and locked patch audit correctness

## Execution Plan

- T-01: Fix bootstrap and update mutation guards
- T-02: Fix lifecycle parsing warnings and repository verification
- T-03: Fix governance binding and locked patch audit correctness
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
