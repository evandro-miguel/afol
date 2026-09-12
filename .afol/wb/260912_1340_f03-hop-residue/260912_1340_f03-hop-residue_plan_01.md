---
doc_type: "workbench_plan"
id: "260912_1340_f03-hop-residue_plan_01"
session_id: "260912_1340_f03-hop-residue"
theme: "f03-hop-residue"
status: "closed"
created_at: "2026-09-12T18:40:54.390Z"
updated_at: "2026-09-12T18:47:53.234Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-12T18:47:53.234Z"
---

# Plan: f03-hop-residue

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-03
- parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
- task: Reject d -x true as no-op with copy-paste hint
- task: Omit-session repair hints and n/c --help
- task: Status next command: ss when sessions exist, qt when empty
- task: Measure hops tokens latency vs confused-agent baseline

## Execution Plan

- T-01: Reject d -x true as no-op with copy-paste hint
- T-02: Omit-session repair hints and n/c --help
- T-03: Status next command: ss when sessions exist, qt when empty
- T-04: Measure hops tokens latency vs confused-agent baseline
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
