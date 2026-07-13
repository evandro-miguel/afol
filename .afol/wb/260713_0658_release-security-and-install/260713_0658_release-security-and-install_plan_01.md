---
doc_type: "workbench_plan"
id: "260713_0658_release-security-and-install_plan_01"
session_id: "260713_0658_release-security-and-install"
theme: "release-security-and-install"
status: "active"
created_at: "2026-07-13T10:58:43.615Z"
updated_at: "2026-07-13T10:58:43.615Z"
roadmap_feature: "F-11"
feature_id: "F-11"
parent_spec: "260521_0110_validation-ci-and-benchmarks_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: release-security-and-install

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: Validate the exact committed AFOL source in a clean clone, run release and security gates, install the real binary globally, and verify outside the repository

## Execution Plan

- T-01: Validate the exact committed AFOL source in a clean clone, run release and security gates, install the real binary globally, and verify outside the repository
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
