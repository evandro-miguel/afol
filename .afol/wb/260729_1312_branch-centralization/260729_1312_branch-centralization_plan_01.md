---
doc_type: "workbench_plan"
id: "260729_1312_branch-centralization_plan_01"
session_id: "260729_1312_branch-centralization"
theme: "branch-centralization"
status: "active"
created_at: "2026-07-29T18:12:40.185Z"
updated_at: "2026-07-29T18:12:40.185Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Repository hygiene: integrate verified exclusive branch work before deleting obsolete branches"
---

# Plan: branch-centralization

- Created by native CLI workbench lifecycle.

## Native command metadata
- no_spec_required_reason: Repository hygiene: integrate verified exclusive branch work before deleting obsolete branches
- task: Integrate factual close-report commits into dev
- task: Port and verify git-aware file indexing onto current dev
- task: Remove obsolete branches/worktrees and verify only dev/main remain

## Execution Plan

- T-01: Integrate factual close-report commits into dev
- T-02: Port and verify git-aware file indexing onto current dev
- T-03: Remove obsolete branches/worktrees and verify only dev/main remain
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
