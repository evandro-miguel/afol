---
doc_type: "workbench_plan"
id: "260812_1402_archive-reverify-guard_plan_01"
session_id: "260812_1402_archive-reverify-guard"
theme: "archive-reverify-guard"
status: "active"
created_at: "2026-08-12T19:02:31.668Z"
updated_at: "2026-08-12T19:02:31.668Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: archive-reverify-guard

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Block closed-task reverification while a session is archived

## Execution Plan

- T-01: Block closed-task reverification while a session is archived
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
