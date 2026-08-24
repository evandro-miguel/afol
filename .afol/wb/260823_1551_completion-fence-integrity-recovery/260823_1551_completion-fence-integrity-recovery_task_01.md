---
doc_type: "workbench_task"
id: "260823_1551_completion-fence-integrity-recovery_task_01"
session_id: "260823_1551_completion-fence-integrity-recovery"
theme: "completion-fence-integrity-recovery"
status: "active"
created_at: "2026-08-23T20:51:53.230Z"
updated_at: "2026-08-23T20:51:53.230Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "pending_spec"
spec_required: true
pending_spec: true
pending_spec_status: "open"
pending_spec_missing: ""
pending_spec_resolution_hint: "catalog resolution deferred: Parent spec must resolve uniquely: 260710_core-integrity-and-transaction-safety_spec_01; run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: ""
---

# Tasks: completion-fence-integrity-recovery

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Fix CRLF canonical spec resolution and resolve F-22 governance binding attempt=1 |
| T-02 | done | worker | Fix fresh completion-fence generation without weakening persisted-fence validation attempt=1 |
| T-03 | in_progress | worker | Build and validate a repo-local AFOL binary for downstream recovery attempt=1 |
