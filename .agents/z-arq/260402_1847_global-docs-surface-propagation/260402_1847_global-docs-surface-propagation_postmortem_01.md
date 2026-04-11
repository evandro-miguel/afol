---
doc_type: postmortem
id: 260402_1847_global-docs-surface-propagation_postmortem_01
theme: global-docs-surface-propagation
status: final
owners:
- orchestrator
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1847_global-docs-surface-propagation_plan_01
  task: 260402_1847_global-docs-surface-propagation_task_01
  report: 260402_1847_global-docs-surface-propagation_report_01
---

# Postmortem: global-docs-surface-propagation

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Propagate the repo-doc boundary strategy beyond the current repo so Codex
  global guidance, skills, and plugins stop teaching legacy repo-map
  destinations.

## What Was Achieved
- Global Codex guidance, the repo-organizer agent contract, discovery/MCP
  skills, and the `docker-analisys-tools` plugin now publish repo maps to
  `docs/map/`.
- The local scaffold now states more clearly that project-owned docs belong
  under `docs/` and that `.agents/` is the agent-system surface.
- Runtime mirrors were resynced cleanly from `AGENTS.md`.

## What Did Not Land
- Full relocation of `.agents/a-docs` and `.agents/arc` into `docs/`.

## Problems Encountered
- `/home/ozy/.codex/AGENTS.md` has pre-existing line-length lint debt, which
  prevents a clean all-files markdownlint gate.
- The runtime mirrors were dirty, so sync required `--force`.

## Root Causes
- Repo-map contract changes had been applied locally before the global Codex
  home and plugin prompts were normalized.
- The global AGENTS file has accumulated formatting debt over time.

## Useful Discoveries
- `docs/map/` is now the only repo-map publication target across the global
  Codex home and the local scaffold surfaces touched in this slice.
- `./.agents/agents sync --force` is the correct non-interactive way to
  realign runtime mirrors after `AGENTS.md` changes.

## Follow-ups for Next Rounds
- Decide whether the scaffold should migrate `.agents/a-docs` and `.agents/arc`
  into `docs/` as a broader architecture move.
- Clean the historical `MD013` debt in `/home/ozy/.codex/AGENTS.md` if a clean
  global markdown gate becomes important.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: yes, if
  the team decides to rehome the remaining project-facing canon out of
  `.agents/`.

---
*Template: `.agents/a-docs/templates/postmortem.md`*
