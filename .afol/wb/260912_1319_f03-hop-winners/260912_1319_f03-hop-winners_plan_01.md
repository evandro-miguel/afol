---
doc_type: "workbench_plan"
id: "260912_1319_f03-hop-winners_plan_01"
session_id: "260912_1319_f03-hop-winners"
theme: "f03-hop-winners"
status: "closed"
created_at: "2026-09-12T18:19:31.480Z"
updated_at: "2026-09-12T18:24:29.902Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-12T18:24:29.902Z"
---

# Plan: f03-hop-winners

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-03
- parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
- task: M3 collapse evidence hint to d -x
- task: M4 compact status session id and next command
- task: M2 start --help leads with st T-01
- task: M5 verify omit-session uses bound session or fail-closed
- task: M6 ls hints afol ss
- task: Run focused tests and hop-oracle winner check

## Execution Plan

- T-01: M3 collapse evidence hint to d -x
- T-02: M4 compact status session id and next command
- T-03: M2 start --help leads with st T-01
- T-04: M5 verify omit-session uses bound session or fail-closed
- T-05: M6 ls hints afol ss
- T-06: Run focused tests and hop-oracle winner check
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
