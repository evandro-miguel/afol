---
doc_type: "workbench_plan"
id: "260716_0945_project-lifecycle-task-graph_plan_01"
session_id: "260716_0945_project-lifecycle-task-graph"
theme: "project-lifecycle-task-graph"
status: "active"
created_at: "2026-07-16T13:45:40.555Z"
updated_at: "2026-07-16T13:45:47.143Z"
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
---


# Plan: project-lifecycle-task-graph

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: Close the AFOL lifecycle gap identified during the universal-skills architecture review: AFOL must persist dependency-aware task readiness and risk-based gates while the universal skill remains a thin router. Preserve current AFOL-only architecture, backward compatibility, low-token CLI behavior, and evidence-based closure.
- task: Design and implement the smallest AFOL-native task graph slice: add blocked_by as the canonical dependency edge; derive readiness instead of storing unlocks; detect cycles; prevent starting blocked tasks; distinguish planned dependencies from unexpected problem state; define migration and compatibility for existing State Board sessions; add focused CLI, parser, template, and regression coverage. Evaluate feature/spec linkage, acceptance, verification, human_gate, risk, review, rollback, and just-in-time work-order fields, but implement only fields proved necessary for the first compatible slice. Deliver integration guidance for a future universal project-lifecycle-loop skill without adding provider-specific adapters or new shaping skills in this repo.

## Execution Plan

- T-01: Design and implement the smallest AFOL-native task graph slice: add blocked_by as the canonical dependency edge; derive readiness instead of storing unlocks; detect cycles; prevent starting blocked tasks; distinguish planned dependencies from unexpected problem state; define migration and compatibility for existing State Board sessions; add focused CLI, parser, template, and regression coverage. Evaluate feature/spec linkage, acceptance, verification, human_gate, risk, review, rollback, and just-in-time work-order fields, but implement only fields proved necessary for the first compatible slice. Deliver integration guidance for a future universal project-lifecycle-loop skill without adding provider-specific adapters or new shaping skills in this repo.
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
