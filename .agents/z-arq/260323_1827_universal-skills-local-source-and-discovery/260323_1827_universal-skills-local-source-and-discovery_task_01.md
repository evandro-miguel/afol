---
doc_type: task
id: 260323_1827_universal-skills-local-source-and-discovery_task_01
theme: universal-skills-local-source-and-discovery
status: final
owners:
- worker
- tester
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
depends_on:
- 260323_1827_universal-skills-local-source-and-discovery_plan_01
links:
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: universal-skills-local-source-and-discovery

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Reworked source resolution and command surface in `agents-skills-sync.py` |
| T-02 | done | orchestrator | Archived overlapping universal-skills payload out of `/home/ozy/.codex/skills` |
| T-03 | done | orchestrator | Updated docs, validated end-to-end, and closed session artifacts |
| T-04 | done | orchestrator | Removed the residual archive after user clarified deletion is acceptable |
| T-05 | done | orchestrator | Extended bootstrap to prepare sibling `../universal-skills` for `apps/` targets |
| T-06 | done | orchestrator | Updated canonical docs to prefer project-local skills and lean global Codex skills |

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
  - [x] `.agents/a-docs/standards/primary-runtime-compatibility.md`
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/skills-sync.md`
  - [x] `.agents/a-docs/agentic/agents-skills-sync.md`
- Skills useful for this task:
  - [x] `agentic-system-workflow`
- Integrations useful for this task:
  - [x] local checkout `/home/ozy/apps/universal-skills`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/agents.config`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/tools.json`
  - `README.md`
  - `.agents/scripts/README.md`
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
  - `.agents/a-docs/standards/scripts-reference.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `AGENTS.md`
  - `.agents/templates/AGENTS_TEMPLATE.md`
  - `OPENCODE.md`
  - `QWEN.md`
  - `CLAUDE.md`
  - `GEMINI.md`
- Key decisions:
  - Prefer sibling checkout over repo-local cache when both exist.
  - Archive global Codex overlap instead of deleting it.
  - Bootstrap should materialize the sibling checkout proactively for `apps/` targets instead of depending on post-check side effects.
  - The canonical runtime contract should explicitly favor repo-local skills over a large global Codex skill inventory.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q`
- Result: pass
- Evidence: `8 passed`

- Command: `make lint-scripts`
- Result: pass
- Evidence: `All checks passed!`

- Command: `make test-scripts`
- Result: pass
- Evidence: `137 passed, 6 deselected`

- Command: `make lint`
- Result: pass
- Evidence: `Issues found: 0`

- Command: `make doctor`
- Result: pass
- Evidence: `No issues found`

- Command: `PATH=/usr/bin:/bin ./.agents/agents doctor`
- Result: pass
- Evidence: `No issues found`

- Command: `make all`
- Result: pass
- Evidence: `All validations passed`

- Command: `rm -rf /home/ozy/.codex/skills-archive/20260323_1836_universal-skills-global && test ! -e /home/ozy/.codex/skills-archive/20260323_1836_universal-skills-global`
- Result: pass
- Evidence: archive path no longer exists

- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q`
- Result: pass
- Evidence: `16 passed`

- Command: `./.agents/agents sync --force`
- Result: pass
- Evidence: `4 file(s) updated`

- Command: `./.agents/agents bootstrap <tmp>/apps/demo-repo --skip-checks`
- Result: pass
- Evidence: bootstrap log showed `prepare sibling universal-skills source: .../apps/universal-skills`

---
*Template: `.agents/a-docs/templates/task.md`*
