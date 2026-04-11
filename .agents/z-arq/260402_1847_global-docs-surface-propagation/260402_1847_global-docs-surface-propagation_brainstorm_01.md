---
doc_type: brainstorm
id: 260402_1847_global-docs-surface-propagation_brainstorm_01
theme: global-docs-surface-propagation
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1847_global-docs-surface-propagation_plan_01
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
---

# Brainstorm: global-docs-surface-propagation

## Problem Statement
- Global Codex guidance, skills, and plugin references still teach mixed repo
  map destinations such as `.agents/arc/map/` and `docs/project-overview/`.
- The new contract is stricter: project-owned repository docs belong under
  `docs/`, with `docs/map/` as the canonical current-state mapping surface,
  while `.agents/` must stay reserved for agent-system surfaces.

## Repo Context to Validate
- Files/areas likely involved:
  - `/home/ozy/.codex/AGENTS.md`
  - `/home/ozy/.codex/agents/repo-organizer.toml`
  - `/home/ozy/.codex/skills/code-discovery/SKILL.md`
  - `/home/ozy/.codex/skills/mcp-skill/SKILL.md`
  - `/home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/**/*`
  - local `AGENTS.md`, `README.md`, `.agents/templates/AGENTS_TEMPLATE.md`
  - local `agentic-system-workflow` skill and repo-map standard
- Existing patterns or constraints to confirm:
  - `AGENTS.md` is the source for `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and
    `GEMINI.md`.
  - The local scaffold already uses `docs/map/` for current-state repo maps.

## Assumptions
- Updating global Codex guidance is in scope because the user explicitly asked
  for system-wide propagation.
- A documentation-only propagation slice is enough here; a full relocation of
  `.agents/a-docs` or `.agents/arc` is larger follow-up work.

## Options
1. Option A - update only the local scaffold docs and leave global Codex
   guidance unchanged
2. Option B - propagate the new rule across global Codex guidance, skills,
   plugins, and local scaffold entrypoints
3. Option C - immediately migrate every project-facing doc tree out of
   `.agents/` in the scaffold itself

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Smallest edit | Leaves global drift active | High | Low |
| B | Aligns routers, skills, plugins, and scaffold-facing docs now | Does not solve the deeper `.agents/arc` / `.agents/a-docs` placement debt yet | Medium | Medium |
| C | Reaches the end-state more fully | Too large for a docs propagation slice; high breakage risk | High | High |

## Preferred Direction
- Selected: Option B
- Why: it closes the system-wide instruction drift immediately without turning
  this slice into a risky structural migration of the scaffold itself.
- Rejected options:
  - Option A -> too weak; downstream agents would still learn the wrong
    contract from global Codex guidance.
  - Option C -> valid follow-up, but too broad for a targeted propagation task.

## Decision Criteria
- The canonical destination for current-state repo mapping must become
  `docs/map/` everywhere.
- `.agents/` must be described as the agent-system surface, not the home for
  project-owned repository docs.
- Local mirrors and local operational skill docs must stay coherent after the
  propagation.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether any global plugin skill still points to `docs/project-overview/`.
  - Whether local runtime mirrors need forced resync from `AGENTS.md`.
- Knowledge to reuse before planning:
  - F-11 roadmap/spec set
  - previous `docs-map-contract-migration` session evidence

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
