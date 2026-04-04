---
doc_type: task
id: YYMMDD_HHMM_<theme>_task_01
theme: <theme>
status: active
owners:
- worker
- tester
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:12-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
depends_on:
- <plan_doc_id>
links:
  plan: <plan_doc_id>
  roadmap: <roadmap_path>
---

# Tasks: <theme>

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | worker | <note> |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] <rule-1>
- Docs useful for this task:
  - [ ] <doc-1>
- Skills useful for this task:
  - [ ] <skill-1>
- Integrations useful for this task:
  - [ ] <integration-1>

## Implementation Checkpoint
- Files touched:
  - <path>
- Key decisions:
  - <decision>

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `<command>`
- Result: <pass/fail>
- Evidence: <paste output snippet or link>

---
*Template: `docs/templates/task.md`*
