---
doc_type: "workbench_task"
id: "260716_2233_evolution-core_task_01"
session_id: "260716_2233_evolution-core"
theme: "evolution-core"
status: "closed"
created_at: "2026-07-17T02:33:20.599Z"
updated_at: "2026-07-17T13:13:12.185Z"
roadmap_feature: "F-30"
feature_id: "F-30"
parent_spec: "260716_2155_afol-evolution-system_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-07-17T13:13:12.185Z"
---

# Tasks: evolution-core

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | principal | Config compatibility, separate DB migration, production-day ledger, health, and evolve status attempt=1 |

## T-01 Acceptance

- Stable UUID and IANA timezone contracts are validated when configured.
- Legacy schema-version-1 projects receive in-memory defaults without silent
  config mutation.
- `evolution.db` uses explicit migrations and `PRAGMA user_version`.
- A local date receives at most one monotonic production ordinal.
- `afol evolve status` supports compact text and `afol.result/v1` JSON output.
- Doctor/health exposes invalid config, unavailable DB, and stale migration
  state with actionable messages.
- Focused tests, full release validation, and two independent critics pass.
