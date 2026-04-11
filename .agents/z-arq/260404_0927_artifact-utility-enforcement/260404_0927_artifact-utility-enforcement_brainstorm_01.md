---
doc_type: brainstorm
id: 260404_0927_artifact-utility-enforcement_brainstorm_01
theme: artifact-utility-enforcement
status: final
workstream_intent: delivery
artifact_purpose: Capture the real option analysis for eliminating useless workbench
  artifacts.
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0927_artifact-utility-enforcement_plan_01
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:34-03:00'
---

# Brainstorm: artifact-utility-enforcement

## Problem Statement
- The scaffold still materializes too many workbench artifacts by default.
- Presence and non-draft status are still treated as weak proxies for usefulness.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/lib/workflow_manifest.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/verify-tasks.py`
- Existing patterns or constraints to confirm:
  - Workbench docs are governed and must stay linkable and verifiable.
  - The fix must not break quick mode, status, session catchup, or bootstrap defaults.

## Assumptions
- The real issue is over-materialization, not template existence by itself.
- A useful fix needs both creation policy and semantic verification.

## Options
1. Keep the full package default and only improve docs.
2. Make creation intent-based but keep readiness status-based.
3. Split the model into artifact catalog + artifact policy and add semantic utility checks.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Low implementation cost | Does not stop useless files from existing | High | Low |
| B | Reduces over-creation | Still lets placeholder artifacts look valid later | Medium | Medium |
| C | Solves creation and validation together | Touches more commands and tests | Medium | Medium |

## Preferred Direction
- Selected: Option C
- Why: The user requirement is about real utility, not only generation order, so the system must understand both why an artifact may exist and whether it is substantively filled.
- Rejected options:
  - Option A -> Too weak; it preserves the current anti-pattern.
  - Option B -> Still lets `status=active/final` hide placeholder-only artifacts.

## Decision Criteria
- Research-only requests must stop creating plan/task wrappers.
- Empty `log`/`report`/`postmortem` artifacts must stop counting as valid progress.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Which commands still assume every session has `plan`, `task`, `log`, and `report`.
- Knowledge to reuse before planning:
  - Existing manifest/readiness work from the prior `artifact-manifest-readiness` session.

---
*Template: `docs/templates/brainstorm.md`*
