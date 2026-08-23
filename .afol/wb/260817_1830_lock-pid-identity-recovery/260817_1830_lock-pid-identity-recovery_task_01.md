---
doc_type: "workbench_task"
id: "260817_1830_lock-pid-identity-recovery_task_01"
session_id: "260817_1830_lock-pid-identity-recovery"
theme: "lock-pid-identity-recovery"
status: "closed"
created_at: "2026-08-17T23:30:22.376Z"
updated_at: "2026-08-17T23:35:47.485Z"
roadmap_feature: "F-22"
feature_id: "F-22"
parent_spec: "260710_core-integrity-and-transaction-safety_spec_01"
task_ids: "T-01"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "catalog resolution deferred: Parent spec is final without one active residual child: 260710_core-integrity-and-transaction-safety_spec_01; run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: "Regression fix for final F-22 lock integrity; parent cannot be reopened and focused evidence is recorded."
closed_at: "2026-08-17T23:35:06.020Z"
---


# Tasks: lock-pid-identity-recovery

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Prevent stale session locks from surviving PID reuse and prove automatic recovery attempt=1 |
