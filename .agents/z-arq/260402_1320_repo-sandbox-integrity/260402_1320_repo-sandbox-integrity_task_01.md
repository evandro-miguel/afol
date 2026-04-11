---
doc_type: task
id: 260402_1320_repo-sandbox-integrity_task_01
theme: repo-sandbox-integrity
status: active
owners:
- worker
- tester
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T14:34:51-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
depends_on:
- 260402_1320_repo-sandbox-integrity_plan_01
links:
  plan: 260402_1320_repo-sandbox-integrity_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: repo-sandbox-integrity

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Contract audit completed and folded into the implementation slices and final validation matrix. |
| T-02 | done | worker | Validation semantics now reflect the real suite, including integration coverage in the aggregate gate. |
| T-03 | done | worker | Critical integration workflows now run against isolated temp repos and custom session pointers. |
| T-04 | done | worker | Bootstrap and skills-sync now resolve a repo-local source seed without requiring external file pulls. |
| T-05 | done | tester | Docs, workbench state, and validation evidence were updated; repo and downstream bootstrap both passed the matrix. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] `.agents/rules/RULE-004-validation-linting.md`
  - [x] `.agents/rules/RULE-005-folder-structure.md`
- Docs useful for this task:
  - [x] `README.md`
  - [x] `AGENTS.md`
  - [x] `.agents/a-docs/standards/bootstrap-other-repo.md`
  - [x] `.agents/scripts/README.md`
- Skills useful for this task:
  - [x] `workbench-agent-teams`
  - [x] `contemplative-orchestrator`
  - [x] `code-discovery`
- Integrations useful for this task:
  - [x] local `.agents/scripts/.venv`
  - [x] bootstrap targets in temporary downstream repos

## Implementation Checkpoint
- Files touched:
  - validation, bootstrap, skills-sync, repo-map, docs, and governed workbench artifacts updated to enforce a local-first sandbox contract
- Key decisions:
  - Use `F-10` as the governing feature and capture the stricter repo-sandbox contract in a local `spec-lite`.
  - Parallel execution is split across disjoint write sets so validation/integration and bootstrap/skills can move independently.
  - Bootstrap must seed `.agents/source/universal-skills` from committed repo assets and fail fast rather than silently pulling external files.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py .agents/scripts/tests/test_agents_skills_sync.py`
- Result: pass
- Evidence: 27 tests passed, covering repo-local source seeding and local-source `skills-sync pull` semantics.
- Command: `make all`
- Result: pass
- Evidence: full scaffold validation passed in the canonical repo with 154 tests green.
- Command: `./.agents/agents bootstrap <tmp-target> && PATH=/usr/bin:/bin <tmp-target>/.agents/agents doctor && make -C <tmp-target> agents-all`
- Result: pass
- Evidence: downstream bootstrap seeded `.agents/source/universal-skills` locally, `skills-sync sync` skipped remote refresh, wrapper worked without `uv` on `PATH`, and downstream `agents-all` passed with 154 tests green.

---
*Template: `.agents/a-docs/templates/task.md`*
