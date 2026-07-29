---
doc_type: "workbench_plan"
id: "260728_1558_evolution-review-remediation_plan_01"
session_id: "260728_1558_evolution-review-remediation"
theme: "evolution-review-remediation"
status: "active"
created_at: "2026-07-28T18:58:47.067Z"
updated_at: "2026-07-28T18:58:47.067Z"
roadmap_feature: "F-30"
feature_id: "F-30"
parent_spec: "260716_2155_afol-evolution-system_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: evolution-review-remediation

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-30
- parent_spec: 260716_2155_afol-evolution-system_spec_01
- task: Version external session snapshots and preserve canonical retry links
- task: Align preference journal events with the canonical schema
- task: Harden bounded tail readers against short reads
- task: Add regression coverage for unqualified observations

## Execution Plan

- T-01: Version external session snapshots and preserve canonical retry links
- T-02: Align preference journal events with the canonical schema
- T-03: Harden bounded tail readers against short reads
- T-04: Add regression coverage for unqualified observations
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
