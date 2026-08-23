---
doc_type: "workbench_plan"
id: "260817_1952_windows-suite-portability_plan_01"
session_id: "260817_1952_windows-suite-portability"
theme: "windows-suite-portability"
status: "active"
created_at: "2026-08-18T00:52:32.407Z"
updated_at: "2026-08-18T00:52:32.407Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Release-blocking Windows test portability discovered during user-authorized AFOL finalization; historical validation feature is final."
---

# Plan: windows-suite-portability

- Created by native CLI workbench lifecycle.

## Native command metadata
- no_spec_required_reason: Release-blocking Windows test portability discovered during user-authorized AFOL finalization; historical validation feature is final.
- task: Repair Windows path, context-binding, and governance-fixture failures without weakening contracts.
- task: Make symlink security tests host-safe while preserving proof on capable Windows executors.
- task: Repair template/hash/archive parity failures against canonical current sources.
- task: Run focused batches, full suite, typecheck, build, security, and release gates from a clean reviewed state.

## Execution Plan

- T-01: Repair Windows path, context-binding, and governance-fixture failures without weakening contracts.
- T-02: Make symlink security tests host-safe while preserving proof on capable Windows executors.
- T-03: Repair template/hash/archive parity failures against canonical current sources.
- T-04: Run focused batches, full suite, typecheck, build, security, and release gates from a clean reviewed state.
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
