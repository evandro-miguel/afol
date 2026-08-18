---
doc_type: "workbench_task"
id: "260817_1952_windows-suite-portability_task_01"
session_id: "260817_1952_windows-suite-portability"
theme: "windows-suite-portability"
status: "active"
created_at: "2026-08-18T00:52:32.407Z"
updated_at: "2026-08-18T00:52:32.407Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03,T-04"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Release-blocking Windows test portability discovered during user-authorized AFOL finalization; historical validation feature is final."
---

# Tasks: windows-suite-portability

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Repair Windows path, context-binding, and governance-fixture failures without weakening contracts. attempt=1 |
| T-02 | done | worker | Make symlink security tests host-safe while preserving proof on capable Windows executors. attempt=1 |
| T-03 | done | worker | Repair template/hash/archive parity failures against canonical current sources. attempt=1 |
| T-04 | in_progress | worker | Run focused batches, full suite, typecheck, build, security, and release gates from a clean reviewed state. attempt=1 |
