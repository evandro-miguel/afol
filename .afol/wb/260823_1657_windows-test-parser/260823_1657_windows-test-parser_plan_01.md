---
doc_type: "workbench_plan"
id: "260823_1657_windows-test-parser_plan_01"
session_id: "260823_1657_windows-test-parser"
theme: "windows-test-parser"
status: "active"
created_at: "2026-08-23T21:57:09.044Z"
updated_at: "2026-08-23T21:57:09.044Z"
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
spec_waiver_reason: "F-22 governance has no parent spec for this narrow Windows parser recovery; scope is limited to the shell:false --test tokenizer and its regression tests."
---

# Plan: windows-test-parser

- Created by native CLI workbench lifecycle.

## Native command metadata
- no_spec_required_reason: F-22 governance has no parent spec for this narrow Windows parser recovery; scope is limited to the shell:false --test tokenizer and its regression tests.
- task: Preserve Windows argv backslashes in --test parser

## Execution Plan

- T-01: Preserve Windows argv backslashes in --test parser
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
