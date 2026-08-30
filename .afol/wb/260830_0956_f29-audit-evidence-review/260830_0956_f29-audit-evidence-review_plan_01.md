---
doc_type: "workbench_plan"
id: "260830_0956_f29-audit-evidence-review_plan_01"
session_id: "260830_0956_f29-audit-evidence-review"
theme: "f29-audit-evidence-review"
status: "closed"
created_at: "2026-08-30T14:56:11.696Z"
updated_at: "2026-08-30T14:58:51.467Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-08-30T14:58:51.467Z"
---

# Plan: f29-audit-evidence-review

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: F-29 continuation of 260829_2215_comprehensive-usage-audit; supersede false-green late evidence E-20260830094915513-8c6fae and related post-close claims without deleting history.
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Validate static audit evidence against fixed source revisions and the #96 severity split
- task: Validate command-surface and downstream fleet trials with shell-safe checks
- task: Validate history/public diff and pinned-runtime regression evidence
- task: Validate synthesized findings and corrected severity classification

## Execution Plan

- T-01: Validate static audit evidence against fixed source revisions and the #96 severity split
- T-02: Validate command-surface and downstream fleet trials with shell-safe checks
- T-03: Validate history/public diff and pinned-runtime regression evidence
- T-04: Validate synthesized findings and corrected severity classification
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
