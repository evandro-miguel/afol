---
doc_type: "workbench_plan"
id: "260713_0716_close-waiver-summary-conflict_plan_01"
session_id: "260713_0716_close-waiver-summary-conflict"
theme: "close-waiver-summary-conflict"
status: "active"
created_at: "2026-07-13T11:16:18.891Z"
updated_at: "2026-07-13T11:16:18.891Z"
roadmap_feature: "F-04"
feature_id: "F-04"
parent_spec: "260521_0040_governance-workbench-system_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: close-waiver-summary-conflict

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-04
- parent_spec: 260521_0040_governance-workbench-system_spec_01
- task: Reject conflicting close summary and no-report waiver flags so the waiver reason cannot be discarded

## Execution Plan

- T-01: Reject conflicting close summary and no-report waiver flags so the waiver reason cannot be discarded
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
