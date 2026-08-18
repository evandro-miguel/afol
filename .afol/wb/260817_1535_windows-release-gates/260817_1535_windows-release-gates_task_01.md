---
doc_type: "workbench_task"
id: "260817_1535_windows-release-gates_task_01"
session_id: "260817_1535_windows-release-gates"
theme: "windows-release-gates"
status: "closed"
created_at: "2026-08-17T20:35:04.944Z"
updated_at: "2026-08-18T00:40:26.689Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: "User-authorized Windows AFOL enablement and release-gate repair; this maintenance does not create new roadmap product intent and the governing historical release features are final."
closed_at: "2026-08-17T20:48:47.125Z"
---


# Tasks: windows-release-gates

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Replace POSIX-only clean smoke with a platform-neutral runner attempt=1 |
| T-02 | done | worker | Make release and security test fixtures Windows-compatible attempt=1 |
