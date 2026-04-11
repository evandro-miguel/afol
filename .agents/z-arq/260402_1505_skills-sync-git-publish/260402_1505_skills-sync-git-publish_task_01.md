---
doc_type: task
id: 260402_1505_skills-sync-git-publish_task_01
theme: skills-sync-git-publish
status: done
owners:
- worker
- tester
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:56-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
depends_on:
- 260402_1505_skills-sync-git-publish_plan_01
links:
  plan: 260402_1505_skills-sync-git-publish_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: skills-sync-git-publish

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implement git mirror refresh and publish flow in skills-sync |
| T-02 | done | worker | Update canonical docs, wrapper-facing docs, and Make targets |
| T-03 | done | tester | Revalidate with focused tests and full repo gate |

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
- Reviewed `AGENTS.md` local-first and validation rules.
- Reused prior F-10 local-first context instead of redesigning the skills contract from scratch.

### Useful Resources
- Rules useful for this task:
  - `AGENTS.md`
- Docs useful for this task:
  - `.agents/a-docs/standards/skills-sync.md`
- Skills useful for this task:
  - `workbench-agent-teams`
- Integrations useful for this task:
  - none

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/tools.json`
  - `README.md`
  - `AGENTS.md`
- Key decisions:
  - Keep `pull` as source refresh and make `sync/update` the actual installer path.
  - Use `.agents/cache/universal-skills` as git mirror when the local source is only a seed.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make all`
- Result: pass
- Evidence: `158 passed in 4.81s` and final banner `✓ All validations passed`
