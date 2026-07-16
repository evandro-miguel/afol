---
doc_type: "workbench_plan"
id: "260715_1651_afol-1-0-local-diagnostics_plan_01"
session_id: "260715_1651_afol-1-0-local-diagnostics"
theme: "afol-1-0-local-diagnostics"
status: "active"
created_at: "2026-07-15T20:51:08.828Z"
updated_at: "2026-07-15T20:51:08.828Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: afol-1-0-local-diagnostics

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Implement offline local diagnostics without changing existing envelopes
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Add thin unexpected and integrity boundary with redacted diagnostic metadata
- task: Implement offline feedback SQLite storage and root-free commands
- task: Prove redaction, contention bounds, and fault atomicity

## Execution Plan

- T-01: Add thin unexpected and integrity boundary with redacted diagnostic metadata
- T-02: Implement offline feedback SQLite storage and root-free commands
- T-03: Prove redaction, contention bounds, and fault atomicity
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
