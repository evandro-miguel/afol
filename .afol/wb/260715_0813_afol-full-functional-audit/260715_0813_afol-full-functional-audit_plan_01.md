---
doc_type: "workbench_plan"
id: "260715_0813_afol-full-functional-audit_plan_01"
session_id: "260715_0813_afol-full-functional-audit"
theme: "afol-full-functional-audit"
status: "active"
created_at: "2026-07-15T12:13:10.303Z"
updated_at: "2026-07-15T12:13:10.303Z"
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

# Plan: afol-full-functional-audit

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Verify every registered AFOL tool and core mechanism, global installation, downstream bootstrap, lifecycle, safety, updates, validation, and token/latency efficiency without modifying unrelated dirty product files
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: Audit installed binary provenance, CLI registry completeness, help and command dispatch
- task: Run isolated downstream bootstrap, update, validation, and no-project smoke tests
- task: Exercise lifecycle, governance, context, rules, memory, library, state, mutation, and recovery mechanisms
- task: Run focused/full test, release, security, benchmark, and efficiency gates; report residual risks

## Execution Plan

- T-01: Audit installed binary provenance, CLI registry completeness, help and command dispatch
- T-02: Run isolated downstream bootstrap, update, validation, and no-project smoke tests
- T-03: Exercise lifecycle, governance, context, rules, memory, library, state, mutation, and recovery mechanisms
- T-04: Run focused/full test, release, security, benchmark, and efficiency gates; report residual risks
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
