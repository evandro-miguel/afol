---
doc_type: research
id: 260402_1847_global-docs-surface-propagation_research_01
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

# Research: global-docs-surface-propagation

## Questions
- Which global Codex surfaces still encode the old repo-map destinations?
- Which local scaffold docs and skills should mirror the new separation between
  project-owned docs and `.agents/`?

## Findings
- Global drift existed in `AGENTS.md`, `repo-organizer.toml`, `code-discovery`,
  `mcp-skill`, `repo-analysis`, and the `docker-analisys-tools` plugin docs and
  prompts.
- The clean contract for this slice is:
  - `.agents/` -> agent-system surfaces
  - `docs/` -> project-owned docs
  - `docs/map/` -> current-state repository mapping and analysis evidence
- Local runtime mirrors are derived artifacts and should be overwritten from
  `AGENTS.md` rather than hand-edited.
- Residual debt remains in the scaffold itself because `.agents/a-docs` and
  `.agents/arc` still carry project-facing governance material.

## Sources
- `/home/ozy/.codex/AGENTS.md` | credibility: high | global Codex routing law
- `/home/ozy/.codex/agents/repo-organizer.toml` | credibility: high | agent role contract for repo mapping
- `/home/ozy/.codex/skills/code-discovery/SKILL.md` | credibility: high | default discovery router
- `/home/ozy/.codex/skills/mcp-skill/SKILL.md` | credibility: high | MCP routing contract
- `/home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md` | credibility: high | deep repo-analysis guidance
- `/home/ozy/.codex/plugins/docker-analisys-tools/**/*` | credibility: high | plugin-level map publication guidance
- `AGENTS.md` and `.agents/templates/AGENTS_TEMPLATE.md` | credibility: high | local scaffold canon and downstream template

## Decision Impact
- The implementation must touch both the global Codex home and the local
  scaffold, otherwise agents will keep receiving mixed routing instructions.

## Open Unknowns
- No blocker for this slice.
- Follow-up debt: decide whether `.agents/a-docs` and `.agents/arc` should be
  rehomed into `docs/` in a future migration.

---
*Template: `.agents/a-docs/templates/research.md`*
