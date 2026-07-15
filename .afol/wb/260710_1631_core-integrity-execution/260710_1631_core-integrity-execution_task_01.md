---
doc_type: "workbench_task"
id: "260710_1631_core-integrity-execution_task_01"
session_id: "260710_1631_core-integrity-execution"
theme: "core-integrity-execution"
status: "closed"
created_at: "2026-07-10T20:31:58.295Z"
updated_at: "2026-07-10T23:11:28.696Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-07-10T23:11:28.696Z"
---

# Tasks: core-integrity-execution

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Enforce observed completion evidence and formal task-state transitions |
| T-02 | done | worker | Add resource locks, strict mutation journal, hash preconditions, and safe undo |
| T-03 | done | worker | Serialize scaffold updates, replan under lock, preserve ownership, and add batch rollback |
| T-04 | done | worker | Gate and transact bootstrap/init with target locking and rollback |
| T-05 | done | worker | Validate and transact governance and session-context state |
| T-06 | done | worker | Harden hydration, duplicate detection, status priority, runtime provenance, JSON errors, and IDs |
