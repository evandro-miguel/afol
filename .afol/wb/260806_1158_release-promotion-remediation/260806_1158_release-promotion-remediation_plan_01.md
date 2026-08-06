---
doc_type: "workbench_plan"
id: "260806_1158_release-promotion-remediation_plan_01"
session_id: "260806_1158_release-promotion-remediation"
theme: "release-promotion-remediation"
status: "active"
created_at: "2026-08-06T16:58:09.613Z"
updated_at: "2026-08-06T16:58:09.613Z"
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

# Plan: release-promotion-remediation

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Implement explicit hash-bound legacy evidence compatibility
- task: Make compiled release artifact reproducible and provenance atomic
- task: Update fast-uri security override and release gates

## Execution Plan

- T-01: Implement explicit hash-bound legacy evidence compatibility
- T-02: Make compiled release artifact reproducible and provenance atomic
- T-03: Update fast-uri security override and release gates
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
