---
doc_type: report
id: 260323_1813_repo-map-system_report_01
theme: repo-map-system
status: final
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
related_tasks:
- T-01
- T-02
- T-03
- T-04
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1813_repo-map-system_plan_01
  task: 260323_1813_repo-map-system_task_01
  postmortem: 260323_1813_repo-map-system_postmortem_01
---

# Report: repo-map-system

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: `260323_1750_current-state-map-contract_spec_01`

## Summary
- Implemented a scaffold-native `repo-map` command based on the OpenCode `repo-organizer` backend contract without importing a second orchestration layer.
- Validated the command end-to-end on this repository and established `.agents/arc/map/` as a durable current-state codemap surface.

## Delivered Changes
- Added `.agents/agents repo-map` and `make repo-map` as first-class refresh commands.
- Added `repo_map` config defaults and tool catalog entries so the command is discoverable and validated by the scaffold.
- Added the `repo-map` standard and linked the command across script usage, standards, and root documentation.
- Added post-generation normalization so `.agents/arc/map/README.md` preserves the scaffold contract: current-state only, descriptive only, goal-state canon lives elsewhere.
- Excluded `.agents/arc/map/extra/` from frontmatter lint enforcement because it is pipeline-owned raw evidence, not canonical authored docs.
- Generated the real codemap for `agentic_start_folder`, including root summaries, domain docs, and raw evidence.

## Files Changed
- `.agents/scripts/agents-repo-map.py`
- `.agents/scripts/tests/test_agents_repo_map.py`
- `.agents/scripts/lib/agents_config.py`
- `.agents/agents.config`
- `.agents/tools.json`
- `.agents/a-docs/standards/repo-map.md`
- `.agents/arc/map/README.md`
- `.agents/arc/map/*.md`
- `.agents/arc/map/extra/`

## Verification
- Unit tests: `make test-scripts` -> passed -> Evidence: `134 passed, 6 deselected`
- E2E tests: `N/A` -> not run -> Evidence: not applicable
- Typecheck: `N/A` -> not run -> Evidence: not applicable
- Lint: `make lint` -> passed -> Evidence: `0 issues found`
- Additional checks:
  - `make doctor` -> passed -> Evidence: `No issues found`
  - `./.agents/agents tools validate` -> passed -> Evidence: `Catalog is valid`
  - `.agents/agents repo-map .` -> passed -> Evidence: generated `README.md`, `ARCHITECTURE.md`, `FEATURES.md`, `DEPENDENCY_GRAPH.md`, `HOTSPOTS.md`, `SYMBOLS.md`, `domains/`, and `extra/`

## Risks / Follow-ups
- The map quality still depends on the external `run-repo-map.sh` pipeline and Docker image; the scaffold intentionally wraps that dependency rather than vendoring it.
- If the repo-organizer backend contract changes upstream, the scaffold wrapper may need to update its normalization logic and expected artifact list.

## Postmortem Link
- Postmortem: `260323_1813_repo-map-system_postmortem_01`

## Lessons (if any)
- Treat generated codemap docs as operational surfaces, not as pure passthrough artifacts; the scaffold still needs a thin postprocess layer to preserve current-vs-goal-state semantics.

---
*Template: `.agents/a-docs/templates/report.md`*
