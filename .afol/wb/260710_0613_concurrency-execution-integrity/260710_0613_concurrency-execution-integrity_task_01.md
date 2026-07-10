---
doc_type: "workbench_task"
id: "260710_0613_concurrency-execution-integrity_task_01"
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

# Tasks: concurrency-execution-integrity

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Reproduce and fix file mutation authorization TOCTOU under one session lock |
| T-02 | done | worker | Reproduce and fix concurrent scoped workbench index update loss |
| T-03 | done | worker | Investigate the missing session and add non-destructive continuity health detection |
| T-04 | done | worker | Implement conservative stale session-lock recovery with live-lock safety tests |
| T-05 | done | worker | Separate declared evidence provenance from observed tool execution compatibly |
| T-06 | done | worker | Run a controlled delegated-agent behavior benchmark and classify maintenance warnings |
| T-07 | done | worker | Improve benchmark failure diagnostics only if the focused flake reproduces |
| T-08 | in_progress | worker | Run serial release, security, AFOL, and final review gates |
