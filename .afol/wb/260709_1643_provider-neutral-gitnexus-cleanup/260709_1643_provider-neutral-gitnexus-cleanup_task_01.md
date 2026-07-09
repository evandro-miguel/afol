---
doc_type: "workbench_task"
id: "260709_1643_provider-neutral-gitnexus-cleanup_task_01"
session_id: "260709_1643_provider-neutral-gitnexus-cleanup"
theme: "provider-neutral-gitnexus-cleanup"
status: "active"
created_at: "2026-07-09T20:43:42.284Z"
updated_at: "2026-07-09T20:43:42.284Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01,T-02,T-03"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "spec requirement waived with explicit reason"
spec_waiver_reason: "Maintenance follow-up to final F-19: align repository context with the disabled Claude adapter; no new product behavior or governing spec is required."
---

# Tasks: provider-neutral-gitnexus-cleanup

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Archive disabled Claude adapter artifacts and replace the generated GitNexus block in AGENTS.md with provider-neutral guidance. |
| T-02 | done | worker | Verify the adapter contract, GitNexus change scope, and absence of provider-specific residue. |
| T-03 | in_progress | worker | Run AFOL and release validation, close the session, and version the verified result on dev. |
