---
doc_type: "workbench_plan"
id: "260818_1617_public-engine-boundary-cutover_plan_01"
session_id: "260818_1617_public-engine-boundary-cutover"
theme: "public-engine-boundary-cutover"
status: "closed"
created_at: "2026-08-18T21:17:27.971Z"
updated_at: "2026-08-18T21:27:05.077Z"
roadmap_feature: "F-34"
feature_id: "F-34"
parent_spec: "260818_public-product-and-portfolio-readiness_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-08-18T21:27:05.077Z"
---

# Plan: public-engine-boundary-cutover

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Integrate PR 94 release hardening
- task: Make package metadata canonical and classify runtime dependencies
- task: Remove private root state from manifest and release validation
- task: Expose stable experimental and compatibility command metadata

## Execution Plan

- T-01: Integrate PR 94 release hardening
- T-02: Make package metadata canonical and classify runtime dependencies
- T-03: Remove private root state from manifest and release validation
- T-04: Expose stable experimental and compatibility command metadata
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
