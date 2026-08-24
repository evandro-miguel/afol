---
doc_type: "workbench_plan"
id: "260823_1551_completion-fence-integrity-recovery_plan_01"
session_id: "260823_1551_completion-fence-integrity-recovery"
theme: "completion-fence-integrity-recovery"
status: "active"
created_at: "2026-08-23T20:51:53.230Z"
updated_at: "2026-08-23T20:51:53.230Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "pending_spec"
spec_required: true
pending_spec: true
pending_spec_status: "open"
pending_spec_missing: ""
pending_spec_resolution_hint: "catalog resolution deferred: Parent spec must resolve uniquely: 260710_core-integrity-and-transaction-safety_spec_01; run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: ""
---

# Plan: completion-fence-integrity-recovery

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Fix CRLF canonical spec resolution and resolve F-22 governance binding
- task: Fix fresh completion-fence generation without weakening persisted-fence validation
- task: Build and validate a repo-local AFOL binary for downstream recovery

## Execution Plan

- T-01: Fix CRLF canonical spec resolution and resolve F-22 governance binding
- T-02: Fix fresh completion-fence generation without weakening persisted-fence validation
- T-03: Build and validate a repo-local AFOL binary for downstream recovery
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
