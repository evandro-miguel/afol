---
doc_type: "workbench_plan"
id: "260816_2020_simplicity-preserving-integrity-remediation_plan_01"
session_id: "260816_2020_simplicity-preserving-integrity-remediation"
theme: "simplicity-preserving-integrity-remediation"
status: "active"
created_at: "2026-08-17T01:20:45.380Z"
updated_at: "2026-08-17T01:20:52.916Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "resolved"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
parent_spec_path: ".afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md"
parent_spec_sha256: "3dd78382bcebd119551ffa68a0e8047811bc32abed320d0d786eb17b1f7d668e"
roadmap_path: ".afol/adm/roadmap/GENERAL-ROADMAP.md"
roadmap_sha256: "c6ab558334d31eb8e83ad8ee37d1e699acb4b94c8b4ba188a38cc8712d570f96"
---


# Plan: simplicity-preserving-integrity-remediation

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260816_simplicity-preserving-integrity-remediation_spec-child_01
- task: Make mutation rollback and legacy undo failure-atomic
- task: Preserve user scaffold data and narrow fleet blockers
- task: Make adoption review decisions durable and terminal
- task: Enforce per-sample token policy and coherent close recovery
- task: Reduce status fast-path overhead and localize platform fixes
- task: Run independent review, full gates, security scans, and delivery

## Execution Plan

- T-01: Make mutation rollback and legacy undo failure-atomic
- T-02: Preserve user scaffold data and narrow fleet blockers
- T-03: Make adoption review decisions durable and terminal
- T-04: Enforce per-sample token policy and coherent close recovery
- T-05: Reduce status fast-path overhead and localize platform fixes
- T-06: Run independent review, full gates, security scans, and delivery
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
