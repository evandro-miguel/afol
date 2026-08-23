---
doc_type: "workbench_plan"
id: "260823_0722_reliability-simplicity-remediation_plan_01"
session_id: "260823_0722_reliability-simplicity-remediation"
theme: "reliability-simplicity-remediation"
status: "active"
created_at: "2026-08-23T12:22:34.916Z"
updated_at: "2026-08-23T12:22:34.916Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: reliability-simplicity-remediation

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Repair manifest and derived-state validation drift
- task: Fix canonical context index correctness regressions
- task: Fix validation benchmark regressions and isolate live fixtures
- task: Reduce redundant validation JSON output without breaking stable envelope data
- task: Classify project-local skill drift and prepare approval-safe remediation
- task: Run integrated quality and security gates

## Execution Plan

- T-01: Repair manifest and derived-state validation drift
- T-02: Fix canonical context index correctness regressions
- T-03: Fix validation benchmark regressions and isolate live fixtures
- T-04: Reduce redundant validation JSON output without breaking stable envelope data
- T-05: Classify project-local skill drift and prepare approval-safe remediation
- T-06: Run integrated quality and security gates
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
