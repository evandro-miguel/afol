---
doc_type: "workbench_plan"
id: "260815_2306_afol-governance-promotion_plan_01"
session_id: "260815_2306_afol-governance-promotion"
theme: "afol-governance-promotion"
status: "active"
created_at: "2026-08-16T04:06:14.088Z"
updated_at: "2026-08-16T04:06:14.088Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: afol-governance-promotion

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-03
- parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
- task: Commit reviewed governance changes and validate clean dev SHA
- task: Open and merge dev to main PR after green checks
- task: Build and install global AFOL from clean main

## Execution Plan

- T-01: Commit reviewed governance changes and validate clean dev SHA
- T-02: Open and merge dev to main PR after green checks
- T-03: Build and install global AFOL from clean main
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
