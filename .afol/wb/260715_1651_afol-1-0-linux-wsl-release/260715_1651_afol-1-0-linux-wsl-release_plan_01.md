---
doc_type: "workbench_plan"
id: "260715_1651_afol-1-0-linux-wsl-release_plan_01"
session_id: "260715_1651_afol-1-0-linux-wsl-release"
theme: "afol-1-0-linux-wsl-release"
status: "active"
created_at: "2026-07-15T20:51:14.127Z"
updated_at: "2026-07-15T20:51:14.127Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: afol-1-0-linux-wsl-release

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Harden Linux x64 build and observed WSL2 release evidence
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Disable standalone dotenv and bunfig autoload and extend provenance additively
- task: Update Linux and WSL CI smoke, coverage, and runbook wording
- task: Run installed-binary benchmark plus full release and security evidence

## Execution Plan

- T-01: Disable standalone dotenv and bunfig autoload and extend provenance additively
- T-02: Update Linux and WSL CI smoke, coverage, and runbook wording
- T-03: Run installed-binary benchmark plus full release and security evidence
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
