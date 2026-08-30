---
doc_type: "workbench_plan"
id: "260830_0826_audit-readiness-fixes_plan_01"
session_id: "260830_0826_audit-readiness-fixes"
theme: "audit-readiness-fixes"
status: "closed"
created_at: "2026-08-30T13:26:01.831Z"
updated_at: "2026-08-30T14:36:05.509Z"
roadmap_feature: "F-34"
feature_id: "F-34"
parent_spec: "260818_public-product-and-portfolio-readiness_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-08-30T14:36:05.509Z"
---

# Plan: audit-readiness-fixes

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-34
- parent_spec: 260818_public-product-and-portfolio-readiness_spec_01
- task: Port and verify terminal transition admission in the canonical public engine
- task: Bound repeated-state health JSON fixture output to 20,000 bytes with regression coverage; global hard token ceiling unverified
- task: Restore pinned Bun 1.3.14 evolution database compatibility
- task: Document approved scanner-path provisioning; release-gate execution not evidenced in this session

## Execution Plan

- T-01: Port and verify terminal transition admission in the canonical public engine
- T-02: Bound repeated-state health JSON fixture output to 20,000 bytes with regression coverage; global hard token ceiling unverified
- T-03: Restore pinned Bun 1.3.14 evolution database compatibility
- T-04: Document approved scanner-path provisioning; release-gate execution not evidenced in this session
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
