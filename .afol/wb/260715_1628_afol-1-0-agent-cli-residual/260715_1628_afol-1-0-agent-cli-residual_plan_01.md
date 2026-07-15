---
doc_type: "workbench_plan"
id: "260715_1628_afol-1-0-agent-cli-residual_plan_01"
session_id: "260715_1628_afol-1-0-agent-cli-residual"
theme: "afol-1-0-agent-cli-residual"
status: "active"
created_at: "2026-07-15T20:28:28.886Z"
updated_at: "2026-07-15T20:28:28.886Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260521_0030_agent-command-design-system_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: afol-1-0-agent-cli-residual

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Close the F-03 residual additively without breaking legacy command paths
- feature_id: F-03
- parent_spec: 260521_0030_agent-command-design-system_spec_01
- task: Implement positional argv verification after -- with VerificationSpec modes
- task: Update hints, aliases, flags, and compatibility snapshots
- task: Validate F-03 residual and preserve all legacy paths

## Execution Plan

- T-01: Implement positional argv verification after -- with VerificationSpec modes
- T-02: Update hints, aliases, flags, and compatibility snapshots
- T-03: Validate F-03 residual and preserve all legacy paths
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
