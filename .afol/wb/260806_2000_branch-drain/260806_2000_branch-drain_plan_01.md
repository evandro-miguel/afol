---
doc_type: "workbench_plan"
id: "260806_2000_branch-drain_plan_01"
session_id: "260806_2000_branch-drain"
theme: "branch-drain"
status: "active"
created_at: "2026-08-07T01:00:00.438Z"
updated_at: "2026-08-07T01:00:00.438Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: branch-drain

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Integrate validated release-finalization branch slices into dev baseline
- task: Drain absorbed branches and worktrees after verification

## Execution Plan

- T-01: Integrate validated release-finalization branch slices into dev baseline
- T-02: Drain absorbed branches and worktrees after verification
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
