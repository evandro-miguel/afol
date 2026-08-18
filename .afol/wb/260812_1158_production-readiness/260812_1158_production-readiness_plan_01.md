---
doc_type: "workbench_plan"
id: "260812_1158_production-readiness_plan_01"
session_id: "260812_1158_production-readiness"
theme: "production-readiness"
status: "active"
created_at: "2026-08-12T16:58:50.849Z"
updated_at: "2026-08-12T16:58:50.849Z"
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

# Plan: production-readiness

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Repair evolution state and reconcile historical evidence issues
- task: Integrate and validate AFOL Evolve universal skill
- task: Commit and validate AFOL changes on dev
- task: Run clean-SHA release and security gates
- task: Promote dev to main and install verified global binary

## Execution Plan

- T-01: Repair evolution state and reconcile historical evidence issues
- T-02: Integrate and validate AFOL Evolve universal skill
- T-03: Commit and validate AFOL changes on dev
- T-04: Run clean-SHA release and security gates
- T-05: Promote dev to main and install verified global binary
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
