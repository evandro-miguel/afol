---
doc_type: "workbench_plan"
id: "260907_1636_public-quality-repair_plan_01"
session_id: "260907_1636_public-quality-repair"
theme: "public-quality-repair"
status: "closed"
created_at: "2026-09-07T21:36:58.716Z"
updated_at: "2026-09-07T22:19:27.177Z"
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
closed_at: "2026-09-07T22:19:27.177Z"
---

# Plan: public-quality-repair

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Repair shipped workflow commands and help output budget
- task: Restore verifiable public benchmark provenance and release checks
- task: Align private routing and derived state; resolve proven maintenance issues
- task: Verify integrated fixes and inspect additional regressions

## Execution Plan

- T-01: Repair shipped workflow commands and help output budget
- T-02: Restore verifiable public benchmark provenance and release checks
- T-03: Align private routing and derived state; resolve proven maintenance issues
- T-03 includes the user-approved repair of the stale Project RAG index reported in the audit: project `afol-dev` (ID 1707), root `/home/ozy/01_projects/dev/afol/afol.dev`, include roots `cli,src,docs`, at most 100 processed files per native delta-ingest call. Verify after each call. Do not start services or register the temporary public feature checkout.
- The first 100-file call could not consume its snapshot (74 adds, 233 updates, one deletion; 208 operations remained). The verifier confirmed that the batch did not publish the pending updates. Complete the same scope with a reviewed positive cap of 350 operations, covering the observed 308-operation plan without a force rebuild.
- T-04: Verify integrated fixes and inspect additional regressions
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
