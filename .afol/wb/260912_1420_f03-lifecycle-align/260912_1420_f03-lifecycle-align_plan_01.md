---
doc_type: "workbench_plan"
id: "260912_1420_f03-lifecycle-align_plan_01"
session_id: "260912_1420_f03-lifecycle-align"
theme: "f03-lifecycle-align"
status: "closed"
created_at: "2026-09-12T19:20:01.958Z"
updated_at: "2026-09-12T19:39:14.245Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-12T19:39:14.245Z"
---

# Plan: f03-lifecycle-align

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-03
- parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
- task: Emit nextCommandHint on n/st/d success; reject qt no-op; fix done JSON parse recovery
- task: Add tests for hints, qt no-op, JSON recovery, and scenario flows
- task: Record governed and qt user journeys plus public/template command docs
- task: Calibrate AFOL skills to d -x fast path and isolated fixture tests
- task: Review alignment of code, tests, docs, and skills

## Execution Plan

- T-01: Emit nextCommandHint on n/st/d success; reject qt no-op; fix done JSON parse recovery
- T-02: Add tests for hints, qt no-op, JSON recovery, and scenario flows
- T-03: Record governed and qt user journeys plus public/template command docs
- T-04: Calibrate AFOL skills to d -x fast path and isolated fixture tests
- T-05: Review alignment of code, tests, docs, and skills
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
