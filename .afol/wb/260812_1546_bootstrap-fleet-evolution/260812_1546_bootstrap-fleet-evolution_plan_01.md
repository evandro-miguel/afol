---
doc_type: "workbench_plan"
id: "260812_1546_bootstrap-fleet-evolution_plan_01"
session_id: "260812_1546_bootstrap-fleet-evolution"
theme: "bootstrap-fleet-evolution"
status: "active"
created_at: "2026-08-12T20:46:56.144Z"
updated_at: "2026-08-12T20:46:56.144Z"
roadmap_feature: "F-33"
feature_id: "F-33"
parent_spec: "260812_2006_fleet-safe-downstream-updates_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: bootstrap-fleet-evolution

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-33
- parent_spec: 260812_2006_fleet-safe-downstream-updates_spec_01
- task: Re-audit canonical and legacy AFOL projects with fleet check
- task: Design authority-aware bootstrap conflict classes and recovery plans
- task: Implement bootstrap preview improvements without fleet-wide apply
- task: Test current, legacy, dirty, missing-lock, and high-conflict projects
- task: Review rollback, output bounds, migration retention, and operator UX

## Execution Plan

- T-01: Re-audit canonical and legacy AFOL projects with fleet check
- T-02: Design authority-aware bootstrap conflict classes and recovery plans
- T-03: Implement bootstrap preview improvements without fleet-wide apply
- T-04: Test current, legacy, dirty, missing-lock, and high-conflict projects
- T-05: Review rollback, output bounds, migration retention, and operator UX
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
