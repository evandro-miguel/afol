---
doc_type: "workbench_plan"
id: "260823_1745_windows-template-manifest-classifier_plan_01"
session_id: "260823_1745_windows-template-manifest-classifier"
theme: "windows-template-manifest-classifier"
status: "active"
created_at: "2026-08-23T22:45:54.412Z"
updated_at: "2026-08-23T22:45:54.412Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Narrow repo-local Windows candidate preflight recovery; no core.autocrlf, general Windows, or public release claim."
---

# Plan: windows-template-manifest-classifier

- Created by native CLI workbench lifecycle.

## Native command metadata
- no_spec_required_reason: Narrow repo-local Windows candidate preflight recovery; no core.autocrlf, general Windows, or public release claim.
- task: Normalize template manifest path classification across Windows separators

## Execution Plan

- T-01: Normalize template manifest path classification across Windows separators
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
