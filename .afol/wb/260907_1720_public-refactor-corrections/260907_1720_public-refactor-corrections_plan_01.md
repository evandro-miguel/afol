---
doc_type: "workbench_plan"
id: "260907_1720_public-refactor-corrections_plan_01"
session_id: "260907_1720_public-refactor-corrections"
theme: "public-refactor-corrections"
status: "closed"
created_at: "2026-09-07T22:20:00.505Z"
updated_at: "2026-09-07T23:05:23.028Z"
roadmap_feature: "F-34"
feature_id: "F-34"
parent_spec: "260818_public-product-and-portfolio-readiness_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-07T23:05:23.028Z"
---

# Plan: public-refactor-corrections

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Index the canonical public engine and verify Project RAG readiness
- task: Repair public builtin benchmark provenance with observed validation
- task: Consolidate evolution serialization and SQL-only transactions
- task: Unify freshness validation without repeated snapshots
- task: Simplify command boundaries, parsing, dispatch, and internal exports
- task: Characterize lifecycle and payload boundaries and complete independent review

## Execution Plan

- T-01: Index the canonical public engine and verify Project RAG readiness
- T-02: Repair public builtin benchmark provenance with observed validation
- T-03: Consolidate evolution serialization and SQL-only transactions
- T-04: Unify freshness validation without repeated snapshots
- T-05: Simplify command boundaries, parsing, dispatch, and internal exports
- T-06: Characterize lifecycle and payload boundaries and complete independent review
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
