---
doc_type: "workbench_plan"
id: "260811_1532_real-tools-followups_plan_01"
session_id: "260811_1532_real-tools-followups"
theme: "real-tools-followups"
status: "active"
created_at: "2026-08-11T20:32:19.438Z"
updated_at: "2026-08-11T20:32:19.438Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: real-tools-followups

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: I-002 owner AFOL CLI: add structured JSON support to init dry-run; next add contract test and implementation
- task: I-003 owner AFOL registry: correct adr and changelog side-effect metadata; next update registry parity tests
- task: I-004 owner AFOL evolution: reconcile evolve analyze blocked status with green state health; next reproduce and fix diagnostic dependency
- task: I-005 owner AFOL context: resolve active session in ctx bundle after hydrate and rebuild; next add active-binding regression
- task: I-006 owner AFOL scaffold: manage downstream .afol/wb/.locks ignore rule; next define safe project-owned gitignore update

## Execution Plan

- T-01: I-002 owner AFOL CLI: add structured JSON support to init dry-run; next add contract test and implementation
- T-02: I-003 owner AFOL registry: correct adr and changelog side-effect metadata; next update registry parity tests
- T-03: I-004 owner AFOL evolution: reconcile evolve analyze blocked status with green state health; next reproduce and fix diagnostic dependency
- T-04: I-005 owner AFOL context: resolve active session in ctx bundle after hydrate and rebuild; next add active-binding regression
- T-05: I-006 owner AFOL scaffold: manage downstream .afol/wb/.locks ignore rule; next define safe project-owned gitignore update
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
