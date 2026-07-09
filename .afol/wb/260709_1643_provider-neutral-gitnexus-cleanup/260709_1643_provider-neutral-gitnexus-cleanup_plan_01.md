---
doc_type: "workbench_plan"
id: "260709_1643_provider-neutral-gitnexus-cleanup_plan_01"
session_id: "260709_1643_provider-neutral-gitnexus-cleanup"
theme: "provider-neutral-gitnexus-cleanup"
status: "active"
created_at: "2026-07-09T20:43:42.284Z"
updated_at: "2026-07-09T20:43:42.284Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Maintenance follow-up to final F-19: align repository context with the disabled Claude adapter; no new product behavior or governing spec is required."
---

# Plan: provider-neutral-gitnexus-cleanup

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Remove disabled Claude adapter artifacts, retain intentional AGENTS.md updates, replace generated provider-specific GitNexus guidance with provider-neutral global-skill guidance, and restore a clean release gate.
- no_spec_required_reason: Maintenance follow-up to final F-19: align repository context with the disabled Claude adapter; no new product behavior or governing spec is required.
- task: Archive disabled Claude adapter artifacts and replace the generated GitNexus block in AGENTS.md with provider-neutral guidance.
- task: Verify the adapter contract, GitNexus change scope, and absence of provider-specific residue.
- task: Run AFOL and release validation, close the session, and version the verified result on dev.

## Execution Plan

- T-01: Archive disabled Claude adapter artifacts and replace the generated GitNexus block in AGENTS.md with provider-neutral guidance.
- T-02: Verify the adapter contract, GitNexus change scope, and absence of provider-specific residue.
- T-03: Run AFOL and release validation, close the session, and version the verified result on dev.
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
