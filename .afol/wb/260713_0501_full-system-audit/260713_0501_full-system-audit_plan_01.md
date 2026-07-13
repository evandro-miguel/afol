---
doc_type: "workbench_plan"
id: "260713_0501_full-system-audit_plan_01"
session_id: "260713_0501_full-system-audit"
theme: "full-system-audit"
status: "active"
created_at: "2026-07-13T09:01:47.634Z"
updated_at: "2026-07-13T09:01:47.634Z"
roadmap_feature: "F-11"
feature_id: "F-11"
parent_spec: "260521_0110_validation-ci-and-benchmarks_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: full-system-audit

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Audit current AFOL source, installed binary, lifecycle, release gates, security, and critical correctness without modifying product code
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: Validate current project state, global binary contract, and lifecycle operations
- task: Run code quality, test, build, release, benchmark, and security gates
- task: Perform bounded independent static reviews and reproduce credible critical findings
- task: Consolidate evidence, verify task state, and close with an exact readiness verdict

## Execution Plan

- T-01: Validate current project state, global binary contract, and lifecycle operations
- T-02: Run code quality, test, build, release, benchmark, and security gates
- T-03: Perform bounded independent static reviews and reproduce credible critical findings
- T-04: Consolidate evidence, verify task state, and close with an exact readiness verdict
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
