---
doc_type: "workbench_plan"
id: "260823_1545_windows-completion-fence-integrity_plan_01"
session_id: "260823_1545_windows-completion-fence-integrity"
theme: "windows-completion-fence-integrity"
status: "active"
created_at: "2026-08-23T20:45:25.126Z"
updated_at: "2026-08-23T20:45:25.126Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02"
governance_status: "pending_spec"
spec_required: true
pending_spec: true
pending_spec_status: "open"
pending_spec_missing: ""
pending_spec_resolution_hint: "catalog resolution deferred: Parent spec must resolve uniquely: 260710_core-integrity-and-transaction-safety_spec_01; run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: ""
---

# Plan: windows-completion-fence-integrity

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Fix fresh completion-fence generation without weakening persisted-fence validation
- task: Build and validate a repo-local Windows AFOL binary for Obsidian-Log recovery

## Execution Plan

- T-01: Fix fresh completion-fence generation without weakening persisted-fence validation
- T-02: Build and validate a repo-local Windows AFOL binary for Obsidian-Log recovery
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
