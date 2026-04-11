---
doc_type: log
id: 260402_1847_global-docs-surface-propagation_log_01
theme: global-docs-surface-propagation
status: final
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:54-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1847_global-docs-surface-propagation_plan_01
  task: 260402_1847_global-docs-surface-propagation_task_01
---

# Log: global-docs-surface-propagation

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``

## Timeline
- 2026-04-02 18:47-03:00 - Created the session under `.agents/wb/` -
  workstream opened with F-11 governance.
- 2026-04-02 18:49-03:00 - Audited local skills and workbench guidance -
  confirmed the propagation should touch both global Codex and local scaffold
  surfaces.
- 2026-04-02 18:52-03:00 - Spawned `repo-organizer` and `doc-updater` for
  parallel audit - both confirmed global drift and a deeper local follow-up
  debt.
- 2026-04-02 18:53-03:00 - Audited global Codex home and plugin docs -
  identified mixed use of `.agents/arc/map/`, `docs/project-overview/`, and
  `docs/map/`.
- 2026-04-02 18:54-03:00 - Patched global Codex guidance, skills, repo-organizer,
  and plugin docs/prompts - converged repo-map publication on `docs/map/`.
- 2026-04-02 18:55-03:00 - Patched local `AGENTS.md`, README, template, repo-map
  standard, and the local/source copies of `agentic-system-workflow`.
- 2026-04-02 18:55-03:00 - Forced runtime mirror sync from `AGENTS.md` -
  regenerated `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md`.
- 2026-04-02 18:55-03:00 - Ran validation checks - all targeted checks passed
  except the known global `MD013` debt in `/home/ozy/.codex/AGENTS.md`.

## Decisions
- Use `docs/map/` as the single current-state repo-map destination across
  global and local guidance -> it matches the scaffold contract and keeps
  project docs outside `.agents/`.
- Treat the broader relocation of `.agents/a-docs` and `.agents/arc` as a
  follow-up migration -> too large for a policy propagation slice.

## Blockers
- none

## Next Step
- Close the workbench session with the residual migration debt recorded
  explicitly.

---
*Template: `.agents/a-docs/templates/log.md`*
