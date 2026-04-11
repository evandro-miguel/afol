---
doc_type: postmortem
id: 260323_1813_repo-map-system_postmortem_01
theme: repo-map-system
status: final
owners:
- orchestrator
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1813_repo-map-system_plan_01
  task: 260323_1813_repo-map-system_task_01
  report: 260323_1813_repo-map-system_report_01
---

# Postmortem: repo-map-system

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Import the useful part of OpenCode `repo-organizer` into the scaffold as a native repository mapping system without creating a competing planning/workflow layer.

## What Was Achieved
- The scaffold now exposes `.agents/agents repo-map` and `make repo-map`.
- `.agents/arc/map/` now has a repeatable generation pipeline for full codemap refreshes plus raw evidence under `extra/`.
- The wrapper preserves the current-state contract after generation, so `arc/map/README.md` remains aligned with the roadmap/spec split.

## What Did Not Land
- No additional downstream adoption automation was added yet beyond the scaffold itself.

## Problems Encountered
- The raw backend output overwrote `arc/map/README.md` in a way that broke the scaffold bootstrap contract.
- Raw markdown summaries inside `arc/map/extra/` triggered frontmatter lint warnings even though they are machine-generated evidence artifacts.

## Root Causes
- The first integration treated repo-organizer output as final surface output instead of as backend material that still needs scaffold-level normalization.
- Lint exclusions were initially configured with the wrong relative prefix for `.agents`.

## Useful Discoveries
- The reusable value from OpenCode `repo-organizer` is the codemap artifact contract plus the external runner, not the multi-agent prompt/orchestration layer.
- `arc/map/extra/` should remain pipeline-owned evidence and not be forced into authored-doc conventions.

## Follow-ups for Next Rounds
- Consider adding a thin quality gate that checks the presence of the scaffold contract block in `arc/map/README.md` after every refresh.
- Evaluate whether downstream repos need optional profiles for lighter or heavier codemap generation.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
