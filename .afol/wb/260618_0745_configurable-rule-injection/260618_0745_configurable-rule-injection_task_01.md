---
doc_type: task
id: "260618_0745_configurable-rule-injection_task_01"
theme: "configurable-rule-injection"
status: active
owners: ["worker", "tester"]
created_at: "2026-06-18T11:45:26Z"
updated_at: "2026-06-18T11:59:18Z"
---

# Tasks: configurable-rule-injection

Each task is executable now. No task here exists just to make another plan.

## Task List

- [x] T-01 Lock the plan and split the execution lanes
- [x] T-02 Implement the shared rule schema and resolver contract
- [x] T-03 Implement first-use injection state and budget enforcement
- [x] T-04 Validate the end-to-end flow and close the WB

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | planner | Plan rebuilt into execution form; session path retained |
| T-02 | done | builder | Touch config, rule index, catalog resolver, and rule catalog tests only |
| T-03 | done | builder | Touch context/preflight wiring, rule injection state, and runtime tests only |
| T-04 | done | tester | Audit complete; strict verify passed, session close command withheld due write-scope limit |

## State Marker Rules

- `[ ]` pending
- `[/]` in progress
- `[!]` problem
- `[>]` moved
- `[%]` implemented_untested
- `[&]` tested_needs_spec_validation
- `[x]` done
