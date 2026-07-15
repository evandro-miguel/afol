---
doc_type: "workbench_plan"
id: "260710_1631_core-integrity-execution_plan_01"
session_id: "260710_1631_core-integrity-execution"
theme: "core-integrity-execution"
status: "active"
created_at: "2026-07-10T20:31:58.295Z"
updated_at: "2026-07-10T20:31:58.295Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: core-integrity-execution

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Enforce observed completion evidence and formal task-state transitions
- task: Add resource locks, strict mutation journal, hash preconditions, and safe undo
- task: Serialize scaffold updates, replan under lock, preserve ownership, and add batch rollback
- task: Gate and transact bootstrap/init with target locking and rollback
- task: Validate and transact governance and session-context state
- task: Harden hydration, duplicate detection, status priority, runtime provenance, JSON errors, and IDs

## Execution Plan

- T-01: Enforce observed completion evidence and formal task-state transitions
- T-02: Add resource locks, strict mutation journal, hash preconditions, and safe undo
- T-03: Serialize scaffold updates, replan under lock, preserve ownership, and add batch rollback
- T-04: Gate and transact bootstrap/init with target locking and rollback
- T-05: Validate and transact governance and session-context state
- T-06: Harden hydration, duplicate detection, status priority, runtime provenance, JSON errors, and IDs
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
