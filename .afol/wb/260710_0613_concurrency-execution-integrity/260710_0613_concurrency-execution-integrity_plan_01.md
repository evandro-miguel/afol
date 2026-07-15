---
doc_type: "workbench_plan"
id: "260710_0613_concurrency-execution-integrity_plan_01"
session_id: "260710_0613_concurrency-execution-integrity"
theme: "concurrency-execution-integrity"
status: "active"
created_at: "2026-07-10T10:13:06.026Z"
updated_at: "2026-07-10T10:13:06.026Z"
roadmap_feature: "F-18"
feature_id: "F-18"
parent_spec: "260612_workbench-hydration-and-markdown-projection_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06,T-07,T-08"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: concurrency-execution-integrity

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Harden AFOL concurrency, continuity, evidence provenance, and delegated execution behavior using deterministic tests and serial release validation.
- feature_id: F-18
- parent_spec: 260612_workbench-hydration-and-markdown-projection_spec-child_01
- task: Reproduce and fix file mutation authorization TOCTOU under one session lock
- task: Reproduce and fix concurrent scoped workbench index update loss
- task: Investigate the missing session and add non-destructive continuity health detection
- task: Implement conservative stale session-lock recovery with live-lock safety tests
- task: Separate declared evidence provenance from observed tool execution compatibly
- task: Run a controlled delegated-agent behavior benchmark and classify maintenance warnings
- task: Improve benchmark failure diagnostics only if the focused flake reproduces
- task: Run serial release, security, AFOL, and final review gates

## Execution Plan

- T-01: Reproduce and fix file mutation authorization TOCTOU under one session lock
- T-02: Reproduce and fix concurrent scoped workbench index update loss
- T-03: Investigate the missing session and add non-destructive continuity health detection
- T-04: Implement conservative stale session-lock recovery with live-lock safety tests
- T-05: Separate declared evidence provenance from observed tool execution compatibly
- T-06: Run a controlled delegated-agent behavior benchmark and classify maintenance warnings
- T-07: Improve benchmark failure diagnostics only if the focused flake reproduces
- T-08: Run serial release, security, AFOL, and final review gates
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
