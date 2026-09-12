---
doc_type: "workbench_plan"
id: "260907_1650_slop-cleanup_plan_01"
session_id: "260907_1650_slop-cleanup"
theme: "slop-cleanup"
status: "closed"
created_at: "2026-09-07T21:50:44.181Z"
updated_at: "2026-09-07T21:57:22.023Z"
roadmap_feature: "F-34"
feature_id: "F-34"
parent_spec: "260818_public-product-and-portfolio-readiness_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-07T21:57:22.023Z"
---

# Plan: slop-cleanup

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Behavior-preserving cleanup in afol-public.refactor-slop-cleanup under the public architecture and code-quality workstream; focused local validation only.
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Remove redundant state and benchmark wrappers, simplify status handling, and replace self-confirming hash tests in the public engine

## Execution Plan

- T-01: Remove redundant state and benchmark wrappers, simplify status handling, and replace self-confirming hash tests in the public engine
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
