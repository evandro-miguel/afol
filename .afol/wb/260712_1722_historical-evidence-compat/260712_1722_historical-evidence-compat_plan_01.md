---
doc_type: "workbench_plan"
id: "260712_1722_historical-evidence-compat_plan_01"
session_id: "260712_1722_historical-evidence-compat"
theme: "historical-evidence-compat"
status: "active"
created_at: "2026-07-12T21:22:51.129Z"
updated_at: "2026-07-12T21:22:51.129Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: historical-evidence-compat

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Preserve strict evidence for active sessions while excluding closed legacy sessions from project-readiness failure

## Execution Plan

- T-01: Preserve strict evidence for active sessions while excluding closed legacy sessions from project-readiness failure
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
