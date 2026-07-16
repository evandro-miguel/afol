---
doc_type: "workbench_plan"
id: "260715_1628_afol-1-0-integrity-closeout_plan_01"
session_id: "260715_1628_afol-1-0-integrity-closeout"
theme: "afol-1-0-integrity-closeout"
status: "active"
created_at: "2026-07-15T20:28:22.824Z"
updated_at: "2026-07-15T20:28:22.824Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: afol-1-0-integrity-closeout

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Re-evaluate and close F-22 only with current branch evidence
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Map AFOL 1.0 collision surfaces and missing integrity coverage
- task: Add only missing multiprocess and fault-injection coverage
- task: Re-evaluate F-22 against current full evidence

## Execution Plan

- T-01: Map AFOL 1.0 collision surfaces and missing integrity coverage
- T-02: Add only missing multiprocess and fault-injection coverage
- T-03: Re-evaluate F-22 against current full evidence
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
