---
doc_type: plan
id: 260402_1847_global-docs-surface-propagation_plan_01
theme: global-docs-surface-propagation
status: final
owners:
- orchestrator
created_at: 2026-04-02 18:47:19-03:00
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: null
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1847_global-docs-surface-propagation_brainstorm_01
  explorer_check: 260402_1847_global-docs-surface-propagation_explorer-check_01
  research: 260402_1847_global-docs-surface-propagation_research_01
  task: 260402_1847_global-docs-surface-propagation_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: global-docs-surface-propagation

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make Codex global guidance, plugin docs, and local scaffold entrypoints teach
  the same boundary model for repository documentation.
- Ensure repo-map publication always points to `docs/map/` and that `.agents/`
  is described as the agent-system surface rather than the home for project
  repository docs.

## Progress
- [x] 2026-04-02 18:47-03:00 - Created the workbench session and audited the
  relevant global Codex and local scaffold surfaces.
- [x] 2026-04-02 18:55-03:00 - Updated Codex global guidance, repo-organizer,
  discovery/MCP skills, and plugin docs/prompts to converge on `docs/map/`.
- [x] 2026-04-02 19:05-03:00 - Updated local scaffold guidance, template
  guidance, and the `agentic-system-workflow` skill to teach the same boundary.
- [x] 2026-04-02 19:10-03:00 - Regenerated runtime mirrors from `AGENTS.md`
  and ran local/global verification checks.

## Surprises & Discoveries
- Observation: the global Codex home had already partly moved away from
  `.agents/arc/map/`, but it had split into two competing destinations:
  `docs/map/` in the scaffold and `docs/project-overview/` in plugin guidance.
  Evidence: `/home/ozy/.codex/plugins/docker-analisys-tools/**/*`
- Observation: `./.agents/agents sync` refused to run non-interactively because
  the runtime mirrors had local drift.
  Evidence: the command required `--force`, then synced all four mirrors cleanly.
- Observation: `/home/ozy/.codex/AGENTS.md` has large pre-existing `MD013`
  line-length debt, so global markdown lint cannot be used as a clean all-files
  gate for this slice.
  Evidence: `markdownlint-cli2 /home/ozy/.codex/AGENTS.md ...` -> `85 error(s)`
  all on `MD013`.

## Decision Log
- Decision: standardize the global and local repo-map publication target on
  `docs/map/`.
  Rationale: this is already the scaffold contract and cleanly separates
  project-owned current-state docs from `.agents/`.
  Date/Author: 2026-04-02 / Codex
- Decision: update local runtime mirrors by forcing sync from `AGENTS.md`.
  Rationale: the repo declares `AGENTS.md` as the source of truth for those
  files, so drift should be removed rather than preserved.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective
- Outcome: global Codex guidance, repo-organizer, discovery/MCP skills, and the
  `docker-analisys-tools` plugin now all point repo-map publication to
  `docs/map/`.
- Outcome: the local scaffold now states the project-docs vs agent-system
  boundary more clearly in `AGENTS.md`, the template, README, repo-map
  standard, and `agentic-system-workflow`.
- Remaining: the scaffold still has broader project-facing documentation trees
  under `.agents/a-docs` and `.agents/arc`, which should be treated as a future
  migration program rather than silently assumed solved here.
- Lesson: path migrations of canonical docs need a second pass across global
  routers and plugin prompts, not just the local scaffold.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1847_global-docs-surface-propagation_brainstorm_01`
- Explorer check artifact: `260402_1847_global-docs-surface-propagation_explorer-check_01`
- Research artifact: `260402_1847_global-docs-surface-propagation_research_01`
- Knowledge lookup performed:
  - Reviewed the F-11 roadmap/spec set and the earlier
    `260402_1828_docs-map-contract-migration` session artifacts.

## Context and Orientation
- The local scaffold already uses `docs/map/` for current-state repo maps, but
  global Codex guidance and plugin-level repo-map docs were still teaching
  `.agents/arc/map/` or `docs/project-overview/`.
- The request is not a code-runtime change; it is a system-wide guidance
  propagation so future agents install and document the scaffold consistently.
- Runtime mirrors `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` are
  derived artifacts and must be regenerated from `AGENTS.md` after local policy
  changes.

## Scope
- In scope:
  - Global Codex guidance and skills that route repo-map work.
  - Global plugin docs/prompts for repo-map publication.
  - Local scaffold docs, template guidance, operational skill wording, and
    runtime mirror sync.
- Out of scope:
  - Full relocation of `.agents/a-docs` or `.agents/arc` into `docs/`.
  - Runtime or bootstrap behavior changes beyond documentation and sync.

## Plan of Work
- Update the global Codex home first so routers and specialist guidance stop
  teaching legacy repo-map destinations.
- Update the plugin docs/prompts next so repo-organizer-style flows publish to
  `docs/map/`.
- Align the local scaffold policy surfaces that downstream agents actually read:
  `AGENTS.md`, README, the AGENTS template, repo-map standard, and the
  `agentic-system-workflow` skill.
- Regenerate runtime mirrors and run local/global validation checks.

## Concrete Steps
1. Edit `/home/ozy/.codex/AGENTS.md`,
   `/home/ozy/.codex/agents/repo-organizer.toml`,
   `/home/ozy/.codex/skills/code-discovery/SKILL.md`,
   `/home/ozy/.codex/skills/mcp-skill/SKILL.md`, and
   `/home/ozy/.codex/skills/mcp-skill/mcp/repo-analysis/README.md`.
2. Edit the `docker-analisys-tools` plugin docs, skills, and prompts to replace
   `docs/project-overview/` with `docs/map/`.
3. Edit local `AGENTS.md`, `README.md`,
   `.agents/templates/AGENTS_TEMPLATE.md`,
   `.agents/a-docs/standards/repo-map.md`, and the local/source copies of
   `agentic-system-workflow`.
4. Run `./.agents/agents sync --force`.
5. Validate with local lint, skills-sync consistency, targeted global markdown
   lint, and syntax checks for TOML/YAML.

## Interfaces and Dependencies
- Tools:
  - `rg`
  - `sed`
  - `markdownlint-cli2`
  - `python3`
  - `node`
- MCPs:
  - `repo-analysis` for earlier repo mapping context
  - `rag-docs` was attempted for project search but not needed for the final
    patch set
- Skills:
  - `agentic-system-workflow`
  - `workbench-agent-teams`
  - `docs-operations`
  - `code-discovery`
  - `mcp-skill`
- Files and interfaces that must exist at the end:
  - `/home/ozy/.codex/AGENTS.md`
  - `/home/ozy/.codex/agents/repo-organizer.toml`
  - `/home/ozy/.codex/skills/**/repo-map guidance`
  - local `AGENTS.md` and synced runtime mirrors

## Risks and Mitigations
- Risk: runtime mirrors contain local drift -> Mitigation: use the supported
  sync flow and keep `AGENTS.md` canonical.
- Risk: global AGENTS lint appears red because of historical line-length debt ->
  Mitigation: isolate the changed files and report the pre-existing debt
  explicitly.
- Risk: readers assume the entire scaffold has already moved all docs out of
  `.agents/` -> Mitigation: record the remaining migration debt in the report.

## Validation and Acceptance
- Unit: N/A
- E2E: N/A
- Typecheck: N/A
- Lint: `make lint`
- Behavioral acceptance:
  - Targeted global search finds no remaining `.agents/arc/map/` or
    `docs/project-overview/` references in canonical Codex guidance and plugin
    surfaces.
  - Local runtime mirrors match the updated `AGENTS.md`.
  - Local/source skill copies stay in sync after the wording update.

## Idempotence and Recovery
- The docs and prompt edits are safe to re-run.
- `./.agents/agents sync --force` is safe to re-run whenever `AGENTS.md`
  changes and the mirrors should be overwritten.
- Global search and lint checks are safe to repeat after any future policy edit.

## Artifacts and Notes
- Global propagation touched only documentation, prompts, and agent guidance.
- The runtime/system separation is now taught in both the global Codex home and
  the local scaffold entrypoints that downstream repos inherit.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
