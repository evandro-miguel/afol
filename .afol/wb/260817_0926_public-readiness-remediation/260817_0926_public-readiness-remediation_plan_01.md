---
doc_type: "workbench_plan"
id: "260817_0926_public-readiness-remediation_plan_01"
session_id: "260817_0926_public-readiness-remediation"
theme: "public-readiness-remediation"
status: "active"
created_at: "2026-08-17T14:26:32.486Z"
updated_at: "2026-08-17T14:26:32.486Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: public-readiness-remediation

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Repair release health and derived indexes
- task: Define public distribution and licensing contract
- task: Complete public documentation
- task: Add automatic CI gates
- task: Validate the unpublished release candidate

## Execution Plan

- T-01: Repair release health and derived indexes
- T-02: Define public distribution and licensing contract
- T-03: Complete public documentation
- T-04: Add automatic CI gates
- T-05: Validate the unpublished release candidate
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
