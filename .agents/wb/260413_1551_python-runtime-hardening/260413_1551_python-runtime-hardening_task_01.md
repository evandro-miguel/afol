---
doc_type: task
id: 260413_1551_python-runtime-hardening_task_01
theme: python-runtime-hardening
status: done
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track implementation tasks for RAG-backed Python script quality
  remediation.
created_at: 2026-04-13 18:09:48-03:00
updated_at: '2026-04-13T18:28:38-03:00'
roadmap_feature: F-16
parent_spec: 260413_1250_project-template-source-separation_spec_01
child_spec: null
depends_on:
- 260413_1551_python-runtime-hardening_plan_01
- 260413_1551_python-runtime-hardening_plan_02
links:
  plan: 260413_1551_python-runtime-hardening_plan_02
  roadmap: docs/arc/GENERAL-ROADMAP.md
---

# Tasks: RAG-backed Python script quality remediation

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Validate telemetry JSON object contract and add focused tests. |
| T-02 | done | worker | Validate tools catalog schema and preserve existing valid catalog behavior. |
| T-03 | done | tester | Add repo-map destination overwrite/failure behavior tests. |
| T-04 | done | tester | Add skills-sync trailer idempotence and commit-message tests. |
| T-05 | done | tester | Add bootstrap seed skip/error branch tests. |
| T-06 | done | tester | Add process_utils passthrough and non-timeout exception tests. |
| T-07 | done | worker | Centralize duplicated time/session helpers where tests protect behavior. |
| T-08 | done | worker | Performance/resource follow-up reviewed; no bounded change was safe without benchmark evidence, deferred to follow-up plan. |
| T-09 | done | tester | Run full scripts/runtime/ruff/make lint gates and runtime tests with updated evidence. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ...

## Governance Context

- Roadmap feature: `F-16`
- Parent spec: `260413_1250_project-template-source-separation_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules

- [ ] Check `docs/lessons/general-lessons.md`
- [ ] Check lesson entries in `docs/lessons/entries/`

### Useful Resources

- Rules useful for this task:
- [ ] `.agents/rules/RULE-001-tool-discovery.md`
- [ ] `.agents/rules/RULE-003-documentation-standards.md`
- [ ] `.agents/rules/RULE-004-validation-linting.md`
- Docs useful for this task:
  - [x] `.agents/wb/260413_1551_python-runtime-hardening/260413_1551_python-runtime-hardening_plan_02.md`
- Skills useful for this task:
- [ ] `evandro-rag-system`
- [ ] `python-type-safety`
- [ ] `python-testing-patterns`
- [ ] `python-design-patterns`
- [x] `python-performance-optimization`
  - [ ] `python-resource-management`
  - [ ] `python-code-style`
- Integrations useful for this task:
  - [ ] Project RAG project ID `md7608d8126cjr7mxyb7w6f9jd84szzy`

## Implementation Checkpoint

- Files touched:
  - TBD during execution
- Key decisions:
  - Execute correctness/test guardrails before large refactors.
  - Treat mirror RAG paths as evidence and edit real `.agents/scripts/...` files.

## Test Gate

- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence

- Command: `uv run --project .agents/scripts --locked pytest .agents/scripts/tests -q`
- Result: pass
- Evidence: 261 passed in 20.75s
- Command: `uv run --project .agents/runtime --locked pytest .agents/runtime/tests -q`
- Result: pass
- Evidence: 27 passed in 0.80s
- Command: `uv run --project .agents/scripts --locked ruff check .agents/scripts`
- Result: pass
- Evidence: All checks passed
- Command: `uv run --project .agents/runtime --locked ruff check .agents/runtime/src .agents/runtime/tests`
- Result: pass
- Evidence: All checks passed
- Command: `make lint`
- Result: pass
- Evidence: Files checked: 99, Issues found: 0
- Command: `make all`
- Result: pass
- Evidence: full aggregate gate passed; scripts 261 passed with 81.94% coverage; runtime 27 passed; runtime/MCP smoke passed.
- Command: `make verify-active-if-present`
- Result: pass
- Evidence: 9 completed tasks.
- Command: `make verify-strict-if-present`
- Result: pass
- Evidence: strict checks passed for evidence, coherence, governance, planning gates, ExecPlan, closure artifact, and final-doc checklist.

---

*Template: `docs/templates/task.md`*
