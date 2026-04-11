---
doc_type: report
id: 260402_1847_global-docs-surface-propagation_report_01
theme: global-docs-surface-propagation
status: final
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
related_tasks:
- 260402_1847_global-docs-surface-propagation_task_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1847_global-docs-surface-propagation_plan_01
  task: 260402_1847_global-docs-surface-propagation_task_01
  postmortem: 260402_1847_global-docs-surface-propagation_postmortem_01
---

# Report: global-docs-surface-propagation

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``

## Summary
- Global Codex guidance, skills, and plugin docs now converge on the same
  current-state repo-map contract as the scaffold: project-owned repository docs
  live under `docs/`, and repo maps publish to `docs/map/`.
- The local scaffold now teaches the same boundary model in `AGENTS.md`,
  README, the AGENTS template, the repo-map standard, and the
  `agentic-system-workflow` skill.

## Delivered Changes
- Updated `/home/ozy/.codex/AGENTS.md`, the `repo-organizer` agent contract,
  discovery/MCP skills, and repo-analysis guidance to stop teaching
  `.agents/arc/map/`.
- Updated the `docker-analisys-tools` plugin docs, skills, and prompts to stop
  teaching `docs/project-overview/` and publish to `docs/map/` instead.
- Updated local scaffold entrypoints and local/source copies of
  `agentic-system-workflow` so downstream repos inherit the project-docs vs
  agent-system boundary explicitly.
- Resynced `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` from
  `AGENTS.md`.

## Files Changed
- `/home/ozy/.codex/AGENTS.md`
- `/home/ozy/.codex/agents/repo-organizer.toml`
- `/home/ozy/.codex/skills/code-discovery/SKILL.md`
- `/home/ozy/.codex/skills/mcp-skill/SKILL.md`
- `/home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md`
- `/home/ozy/.codex/plugins/docker-analisys-tools/references/repo-map-docs.md`
- `/home/ozy/.codex/plugins/docker-analisys-tools/references/analysis-tools-guide.md`
- `/home/ozy/.codex/plugins/docker-analisys-tools/skills/repo-map-docs/SKILL.md`
- `/home/ozy/.codex/plugins/docker-analisys-tools/skills/analysis-tools-guide/SKILL.md`
- `/home/ozy/.codex/plugins/docker-analisys-tools/skills/analysis-tools-guide/agents/openai.yaml`
- `/home/ozy/.codex/plugins/docker-analisys-tools/skills/repo-map-docs/agents/openai.yaml`
- `AGENTS.md`
- `OPENCODE.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`
- `README.md`
- `.agents/templates/AGENTS_TEMPLATE.md`
- `.agents/a-docs/standards/repo-map.md`
- `.agents/skills/agentic-system-workflow/SKILL.md`
- `.agents/skills/agentic-system-workflow/references/core/README.md`
- `.agents/source/universal-skills/skills/agentic-system-workflow/SKILL.md`
- `.agents/source/universal-skills/skills/agentic-system-workflow/references/core/README.md`

## Verification
- Unit tests: `N/A` -> not applicable -> Evidence: docs/prompt propagation slice
- E2E tests: `N/A` -> not applicable -> Evidence: docs/prompt propagation slice
- Typecheck: `N/A` -> not applicable -> Evidence: no code-runtime changes
- Lint: `make lint` -> pass -> Evidence: `Files checked: 369`, `Issues found: 0`
- Additional checks:
  - `./.agents/agents skills-sync check` -> pass -> Evidence: `PASS: skills structure and sync are valid`
  - `./.agents/agents sync --force` -> pass -> Evidence: `Sync complete. 4 file(s) updated.`
  - `markdownlint-cli2` on 7 global Markdown files -> pass -> Evidence: `Summary: 0 error(s)`
  - `python3` `tomllib` parse for `/home/ozy/.codex/agents/repo-organizer.toml` -> pass -> Evidence: `TOML OK`
  - `node` YAML parse for the 2 plugin `openai.yaml` files -> pass -> Evidence: two `YAML OK` lines
  - `rg -n "\.agents/arc/map|docs/project-overview" /home/ozy/.codex/AGENTS.md /home/ozy/.codex/agents /home/ozy/.codex/skills /home/ozy/.codex/plugins -S` -> pass -> Evidence: no matches
  - `markdownlint-cli2 /home/ozy/.codex/AGENTS.md ...` -> partial/fail -> Evidence: `85 error(s)` all on pre-existing `MD013` line-length debt in the global AGENTS file

## Risks / Follow-ups
- The scaffold still contains broader project-facing documentation families
  under `.agents/a-docs` and `.agents/arc`. This slice did not relocate them.
- `docs/` in this scaffold still exposes only `docs/map/`; a fuller migration to
  `docs/arc/`, `docs/specs/`, or equivalent remains future work if the policy
  should be enforced end-to-end inside the scaffold itself.

## Postmortem Link
- Postmortem: `260402_1847_global-docs-surface-propagation_postmortem_01`

## Lessons (if any)
- After a contract change in canonical repo docs, always audit the global Codex
  routers and plugin prompts too. Local convergence alone is not enough.

---
*Template: `.agents/a-docs/templates/report.md`*
