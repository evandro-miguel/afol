---
doc_type: "workbench_plan"
id: "260812_1508_fleet-operations_plan_01"
session_id: "260812_1508_fleet-operations"
theme: "fleet-operations"
status: "active"
created_at: "2026-08-12T20:08:54.919Z"
updated_at: "2026-08-12T20:08:54.919Z"
roadmap_feature: "F-33"
feature_id: "F-33"
parent_spec: "260812_2006_fleet-safe-downstream-updates_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: fleet-operations

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-33
- parent_spec: 260812_2006_fleet-safe-downstream-updates_spec_01
- task: Implement bounded fleet discovery and classification
- task: Implement derived-state repair preview and guarded apply
- task: Add command registry, help, JSON, and focused tests
- task: Validate against representative local AFOL projects

## Execution Plan

- T-01: Implement bounded fleet discovery and classification
- T-02: Implement derived-state repair preview and guarded apply
- T-03: Add command registry, help, JSON, and focused tests
- T-04: Validate against representative local AFOL projects
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
