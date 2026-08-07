---
doc_type: "workbench_plan"
id: "260806_2147_legacy-reconcile-atomic-close_plan_01"
session_id: "260806_2147_legacy-reconcile-atomic-close"
theme: "legacy-reconcile-atomic-close"
status: "active"
created_at: "2026-08-07T02:47:45.096Z"
updated_at: "2026-08-07T02:47:45.096Z"
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

# Plan: legacy-reconcile-atomic-close

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Atomic legacy reconcile: admit + close pre-cutoff all-done historical-unverifiable sessions in one transaction

## Execution Plan

- T-01: Atomic legacy reconcile: admit + close pre-cutoff all-done historical-unverifiable sessions in one transaction
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
