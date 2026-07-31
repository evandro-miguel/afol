---
doc_type: "workbench_task"
id: "260716_0945_project-lifecycle-task-graph_task_01"
session_id: "260716_0945_project-lifecycle-task-graph"
theme: "project-lifecycle-task-graph"
status: "closed"
created_at: "2026-07-16T13:45:40.555Z"
updated_at: "2026-07-29T04:27:11.893Z"
roadmap_feature: ""
feature_id: ""
parent_spec: ""
task_ids: "T-01"
governance_status: "unbound"
spec_required: false
pending_spec: false
pending_spec_status: "waived"
pending_spec_missing: ""
pending_spec_resolution_hint: "run afol governance resolve-spec --session <session> --feature-id <F-id> --parent-spec <spec-id> or waive with --no-spec-required --reason \"<reason>\""
spec_waiver_reason: "Architecture handoff for AFOL-native evaluation before roadmap feature and parent spec acceptance; recipient must promote accepted scope into canonical governance before broad implementation."
closed_at: "2026-07-29T04:27:11.893Z"
---


# Tasks: project-lifecycle-task-graph

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Design and implement the smallest AFOL-native task graph slice: add blocked_by as the canonical dependency edge; derive readiness instead of storing unlocks; detect cycles; prevent starting blocked tasks; distinguish planned dependencies from unexpected problem state; define migration and compatibility for existing State Board sessions; add focused CLI, parser, template, and regression coverage. Evaluate feature/spec linkage, acceptance, verification, human_gate, risk, review, rollback, and just-in-time work-order fields, but implement only fields proved necessary for the first compatible slice. Deliver integration guidance for a future universal project-lifecycle-loop skill without adding provider-specific adapters or new shaping skills in this repo. attempt=1 |
