---
doc_type: "workbench_plan"
id: "260811_1422_cross-project-real-tools-validation_plan_01"
session_id: "260811_1422_cross-project-real-tools-validation"
theme: "cross-project-real-tools-validation"
status: "active"
created_at: "2026-08-11T19:22:55.584Z"
updated_at: "2026-08-11T19:22:55.584Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: cross-project-real-tools-validation

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Track and remediate AFOL defects found during real library workflows
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Record reproducible cross-project AFOL issues
- task: Fix blocking AFOL defects found by the campaign
- task: Add regressions for confirmed AFOL defects
- task: Audit coverage and validate AFOL source after campaign

## Execution Plan

- T-01: Record reproducible cross-project AFOL issues
- T-02: Fix blocking AFOL defects found by the campaign
- T-03: Add regressions for confirmed AFOL defects
- T-04: Audit coverage and validate AFOL source after campaign
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
