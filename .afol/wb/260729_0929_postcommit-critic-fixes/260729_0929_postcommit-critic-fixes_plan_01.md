---
doc_type: "workbench_plan"
id: "260729_0929_postcommit-critic-fixes_plan_01"
session_id: "260729_0929_postcommit-critic-fixes"
theme: "postcommit-critic-fixes"
status: "active"
created_at: "2026-07-29T14:29:55.798Z"
updated_at: "2026-07-29T14:29:55.798Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Post-close verification fixes requested by independent critics"
---

# Plan: postcommit-critic-fixes

- Created by native CLI workbench lifecycle.

## Native command metadata
- no_spec_required_reason: Post-close verification fixes requested by independent critics
- task: Make verification output path-independent and keep session list diagnostic on corrupt context

## Execution Plan

- T-01: Make verification output path-independent and keep session list diagnostic on corrupt context
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
