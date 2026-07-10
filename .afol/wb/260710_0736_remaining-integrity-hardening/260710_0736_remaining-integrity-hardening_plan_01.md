---
doc_type: "workbench_plan"
id: "260710_0736_remaining-integrity-hardening_plan_01"
session_id: "260710_0736_remaining-integrity-hardening"
theme: "remaining-integrity-hardening"
status: "active"
created_at: "2026-07-10T11:36:30.791Z"
updated_at: "2026-07-10T11:36:30.791Z"
roadmap_feature: "F-18"
feature_id: "F-18"
parent_spec: "260612_workbench-hydration-and-markdown-projection_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: remaining-integrity-hardening

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: delivery
- feature_id: F-18
- parent_spec: 260612_workbench-hydration-and-markdown-projection_spec-child_01
- task: Harden session lock identity and ownership-safe cleanup
- task: Constrain local-state worker execution with an explicit worker kind
- task: Remove repeated migration-tree scans from workbench health indexing and prove bounded behavior
- task: Repair orphaned lifecycle continuity using an AFOL-owned archive or migration fallback
- task: Run final council, benchmarks, release validations, commit, and push dev

## Execution Plan

- T-01: Harden session lock identity and ownership-safe cleanup
- T-02: Constrain local-state worker execution with an explicit worker kind
- T-03: Remove repeated migration-tree scans from workbench health indexing and prove bounded behavior
- T-04: Repair orphaned lifecycle continuity using an AFOL-owned archive or migration fallback
- T-05: Run final council, benchmarks, release validations, commit, and push dev
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
