---
doc_type: "workbench_plan"
id: "260817_1535_windows-release-gates_plan_01"
session_id: "260817_1535_windows-release-gates"
theme: "windows-release-gates"
status: "closed"
created_at: "2026-08-17T20:35:04.944Z"
updated_at: "2026-08-18T00:40:26.689Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: "User-authorized Windows AFOL enablement and release-gate repair; this maintenance does not create new roadmap product intent and the governing historical release features are final."
closed_at: "2026-08-17T20:48:47.125Z"
---


# Plan: windows-release-gates

- Created by native CLI workbench lifecycle.

## Native command metadata
- task: Replace POSIX-only clean smoke with a platform-neutral runner
- task: Make release and security test fixtures Windows-compatible

## Execution Plan

- T-01: Replace POSIX-only clean smoke with a platform-neutral runner
- T-02: Make release and security test fixtures Windows-compatible
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
