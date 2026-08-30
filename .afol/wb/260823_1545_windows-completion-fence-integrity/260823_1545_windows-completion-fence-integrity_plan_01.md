---
doc_type: "workbench_plan"
id: "260823_1545_windows-completion-fence-integrity_plan_01"
session_id: "260823_1545_windows-completion-fence-integrity"
theme: "windows-completion-fence-integrity"
status: "closed"
created_at: "2026-08-23T20:45:25.126Z"
updated_at: "2026-08-30T22:48:18.137Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260711_c01-authorization-red-reproducers_spec-child_01"
task_ids: "T-01,T-02"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "resolved"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
parent_spec_path: ".afol/adm/specs/260711_c01-authorization-red-reproducers_spec-child_01.md"
parent_spec_sha256: "3af8e219aa25c101b9271eb0c63dd1f0dc058794f95d3da5f81180c91da3272e"
roadmap_path: ".afol/adm/roadmap/GENERAL-ROADMAP.md"
roadmap_sha256: "f97e13570628266d62e7745fc27fcf9a88b02e1d68eca2b833afa0f2f56ee97f"
closed_at: "2026-08-30T22:48:18.137Z"
---


# Plan: windows-completion-fence-integrity

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-22
- parent_spec: 260710_core-integrity-and-transaction-safety_spec_01
- task: Fix fresh completion-fence generation without weakening persisted-fence validation
- task: Build and validate a repo-local Windows AFOL binary for Obsidian-Log recovery

## Execution Plan

- T-01: Fix fresh completion-fence generation without weakening persisted-fence validation
- T-02: Build and validate a repo-local Windows AFOL binary for Obsidian-Log recovery
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
