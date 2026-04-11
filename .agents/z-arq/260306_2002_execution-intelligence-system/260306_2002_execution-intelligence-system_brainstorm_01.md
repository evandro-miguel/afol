---
doc_type: brainstorm
id: 260306_2002_execution-intelligence-system_brainstorm_01
theme: execution-intelligence-system
status: active
roadmap_feature: F-07
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2002_execution-intelligence-system_plan_01
created_at: '2026-03-06T20:02:07-03:00'
updated_at: '2026-03-06T20:34:07-03:00'
---

# Brainstorm: execution-intelligence-system

## Problem Statement
- The scaffold lacks enforced pre-plan exploration, reusable prior-research discovery, structured multi-plan packs, and mandatory postmortem closure.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/a-docs/templates/`
  - `.agents/tools.json`
- Existing patterns or constraints to confirm:
  - backward compatibility with flat session folders
  - strict verification should not break unrelated completed sessions by default

## Assumptions
- Lightweight markdown-based indexing is sufficient for reusable knowledge discovery.
- The best place to enforce report closure is `wb-update status`.

## Options
1. Add docs only and rely on discipline.
2. Add templates plus validation gates, but no search tool.
3. Add templates, validation gates, recursive session support, and a lightweight knowledge tool.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| 1 | Fastest | No enforcement, no real improvement | High | low |
| 2 | Better than docs alone | Still wastes tokens repeating research | Medium | medium |
| 3 | Enforceable and reusable | Touches several scripts and docs | Medium | medium |

## Preferred Direction
- Selected: option 3
- Why: it improves planning quality and knowledge reuse without adding external infrastructure.
- Rejected options:
  - option 1 -> too weak
  - option 2 -> does not solve info reuse or multi-plan structure

## Decision Criteria
- Low-token discovery
- Backward compatibility
- Enforceable workflow quality

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - which scripts still assume flat session folders
  - which validators need new doc types
- Knowledge to reuse before planning:
  - `260306_1937_primary-runtime-compatibility_research_01`
  - `260306_1815_roadmap-first-governance_report_01`

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
