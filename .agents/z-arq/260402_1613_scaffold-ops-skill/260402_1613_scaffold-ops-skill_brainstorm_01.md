---
doc_type: brainstorm
id: 260402_1613_scaffold-ops-skill_brainstorm_01
theme: scaffold-ops-skill
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1613_scaffold-ops-skill_plan_01
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
---

# Brainstorm: scaffold-ops-skill

## Problem Statement
- Agents need a simple, local, reproducible way to install and operate this
  scaffold, refresh skills through git when necessary, and keep the repo-local
  seed self-contained without leaking responsibility to files outside the repo.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/skills/agentic-system-workflow/`
  - `.agents/skills-sync.manifest.json`
- Existing patterns or constraints to confirm:
  - local-first bootstrap
  - git-backed mirror only as optional refresh/publish source
  - governed workbench closure and repo-local evidence

## Assumptions
- The committed local source under `.agents/source/universal-skills` should be a
  valid subset source, not just an arbitrary partial copy.
- Agents should not need to know internal workaround steps to discover skills or
  bootstrap a fresh repo.

## Options
1. Option A - keep local-first bootstrap and harden the repo-local seed plus
   git mirror behavior.
2. Option B - revert to always preferring the git source for discovery and
   install.
3. Option C - introduce a brand-new plugin/init layer immediately.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Preserves sandboxed bootstrap, small diff, matches current design | Needs better local metadata rules | low | medium |
| B | Simpler catalog model | Breaks the local-first bootstrap contract | medium | low |
| C | Best UX long-term | Larger surface change, more docs/runtime work | medium | high |

## Preferred Direction
- Selected: Option A
- Why: it closes the correctness gaps without redesigning the scaffold around a
  remote-first or plugin-first model.
- Rejected options:
  - Option B -> it weakens the self-contained downstream story.
  - Option C -> valuable later, but unnecessary for fixing the real runtime debt.

## Decision Criteria
- Keep bootstrap self-contained for downstream repos.
- Make git-backed discovery and refresh practical for agents.
- Leave the repo with passing validations and no local-source drift.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether the committed local source seed is internally consistent.
  - Whether discovery commands can see the git catalog when a mirror already exists.
- Knowledge to reuse before planning:
  - Prior F-10 workbench sessions and the current `skills-sync` tests.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
