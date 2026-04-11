---
doc_type: explorer-check
id: 260402_1847_global-docs-surface-propagation_explorer-check_01
theme: global-docs-surface-propagation
status: final
owners:
- explorer
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1847_global-docs-surface-propagation_brainstorm_01
  plan: 260402_1847_global-docs-surface-propagation_plan_01
---

# Explorer Check: global-docs-surface-propagation

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `/home/ozy/.codex/AGENTS.md`
  - `/home/ozy/.codex/agents/`
  - `/home/ozy/.codex/skills/`
  - `/home/ozy/.codex/plugins/docker-analisys-tools/`
  - local `AGENTS.md`, `README.md`, `.agents/templates/AGENTS_TEMPLATE.md`
  - local `.agents/skills/agentic-system-workflow/`
- Existing docs inspected:
  - `.agents/a-docs/standards/repo-map.md`
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
- Existing scripts/tools checked:
  - `./.agents/agents sync`
  - `./.agents/agents skills-sync check`

## Commands Used
```bash
rg -n "\.agents/arc/map|docs/project-overview|docs/map" /home/ozy/.codex/AGENTS.md /home/ozy/.codex/agents /home/ozy/.codex/skills /home/ozy/.codex/plugins -S
sed -n '1,260p' /home/ozy/.codex/AGENTS.md
sed -n '1,220p' /home/ozy/.codex/agents/repo-organizer.toml
sed -n '1,240p' /home/ozy/.codex/skills/code-discovery/SKILL.md
sed -n '1,220p' /home/ozy/.codex/skills/mcp-skill/SKILL.md
sed -n '1,220p' /home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md
sed -n '1,220p' /home/ozy/.codex/plugins/docker-analisys-tools/skills/repo-map-docs/SKILL.md
sed -n '1,220p' /home/ozy/.codex/plugins/docker-analisys-tools/skills/analysis-tools-guide/SKILL.md
```

## Findings
- Global Codex guidance still referenced `.agents/arc/map/` for repo-map work.
- Global plugin docs and skills still referenced `docs/project-overview/`,
  which conflicts with the newer `docs/map/` contract already adopted in the
  scaffold.
- The local scaffold already teaches `docs/map/`, but local `AGENTS.md`,
  template guidance, and the `agentic-system-workflow` skill needed stronger
  wording about the boundary between project-owned docs and `.agents/`.
- Runtime mirrors `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` were
  stale and needed forced regeneration from `AGENTS.md`.

## Contradictions or Drift Found
- Global Codex surfaces and the local scaffold were no longer teaching the same
  repo-map destination.
- The local scaffold still has deeper legacy governance trees under `.agents/`,
  so this slice can only propagate the policy and close obvious drift; it does
  not relocate every project-facing doc family yet.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Expand the propagation beyond four files to include plugin docs, skill
    agent prompts, local scaffold entrypoints, and runtime mirror regeneration.
- What remains uncertain:
  - Whether the broader relocation of `.agents/a-docs` and `.agents/arc` into
    `docs/` should become its own migration program.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
