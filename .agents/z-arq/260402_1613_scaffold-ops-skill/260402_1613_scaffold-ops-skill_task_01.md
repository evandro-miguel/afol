---
doc_type: task
id: 260402_1613_scaffold-ops-skill_task_01
theme: scaffold-ops-skill
status: done
owners:
- worker
- tester
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
depends_on:
- 260402_1613_scaffold-ops-skill_plan_01
links:
  plan: 260402_1613_scaffold-ops-skill_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: scaffold-ops-skill

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Canonicalized the operational skill and scaffold docs |
| T-02 | done | worker | Hardened `skills-sync` source validation, catalog discovery, ensure fallback, and default manifest behavior |
| T-03 | done | worker | Fixed bootstrap full-target creation and local source reseeding |
| T-04 | done | tester | Revalidated with focused tests, skill guards, RAG-backed debt review, and `make all` |

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
- Reviewed `AGENTS.md` validation and local-first rules.
- Reused prior F-10 workbench context before changing the runtime contract again.

### Useful Resources
- Rules useful for this task:
  - `AGENTS.md`
- Docs useful for this task:
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
- Skills useful for this task:
  - `workbench-agent-teams`
  - `writing-skills`
- Integrations useful for this task:
  - `rag-docs`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/skills/agentic-system-workflow/SKILL.md`
  - `.agents/skills/agentic-system-workflow/references/troubleshooting/README.md`
  - `.agents/skills/agentic-system-workflow/gotchas.md`
  - `.agents/skills-sync.manifest.json`
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
  - `.agents/scripts/README.md`
  - `README.md`
- Key decisions:
  - Use the git-backed mirror for discovery and ensure fallback when present, while keeping install/apply local-first.
  - Treat a local source seed as invalid if its profiles reference skills that do not exist locally.
  - Let full bootstrap create a missing target directory; keep `--partial` strict.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make all`
- Result: pass
- Evidence: `PASS: skills structure and sync are valid`, `164 passed in 4.37s`, and final banner `All validations passed`

---
*Template: `.agents/a-docs/templates/task.md`*
