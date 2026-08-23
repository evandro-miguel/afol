---
doc_type: "workbench_plan"
id: "260817_1521_windows-support_plan_01"
session_id: "260817_1521_windows-support"
theme: "windows-support"
status: "closed"
created_at: "2026-08-17T20:21:49.677Z"
updated_at: "2026-08-18T00:40:26.529Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: "User-authorized Windows AFOL enablement and release-gate repair; this maintenance does not create new roadmap product intent and the governing historical release features are final."
closed_at: "2026-08-17T20:31:44.948Z"
---


# Plan: windows-support

- Created by native CLI workbench lifecycle.

## Native command metadata
- task: Fix Windows release build and binary provenance recognition
- task: Fix Windows task completion lock lifecycle
- task: Audit and validate Windows-specific test coverage and remaining failures

## Execution Plan

- T-01: Fix Windows release build and binary provenance recognition
- T-02: Fix Windows task completion lock lifecycle
- T-03: Audit and validate Windows-specific test coverage and remaining failures
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
