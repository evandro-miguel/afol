---
doc_type: report
id: 260402_1828_docs-map-contract-migration_report_01
theme: docs-map-contract-migration
status: final
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:44-03:00'
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
  plan: 260402_1828_docs-map-contract-migration_plan_01
  task: 260402_1828_docs-map-contract-migration_task_01
  postmortem: 260402_1828_docs-map-contract-migration_postmortem_01
---

# Report: docs-map-contract-migration

## Summary
- The scaffold now uses `docs/map/` as the canonical current-state map surface.
  Runtime defaults, bootstrap, wrapper help, tests, standards, roadmap/specs,
  and the current repo artifacts were migrated accordingly.

## Delivered Changes
- Retargeted `paths.map_dir` and the `repo-map` command family from
  `.agents/arc/map` to `docs/map`.
- Updated bootstrap so downstream repos receive a generic `docs/map/README.md`
  baseline instead of source-repo current-state map artifacts.
- Preserved the bootstrap safety contract: downstream repos still get an empty
  `.agents/wb/` directory, but no source-session content or `.active_session`
  pointer.
- Regenerated the current repo codemap under `docs/map/` and refreshed
  `.agents/arc/structure/` after the move.
- Aligned canonical docs, F-11 specs, usage guides, and the compatibility
  `deep-code-analisys` skill to the new path.
- Fixed the `agentic-system-workflow` source-seed drift so `skills-sync check`
  returns green again.

## Verification
- Unit tests:
  - `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_repo_map.py -q` -> pass -> `4 passed`
  - `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py -q` -> pass -> `17 passed`
- Integration tests:
  - `uv run --project .agents/scripts pytest .agents/scripts/tests/integration/test_critical_workflows.py -q` -> pass -> `6 passed`
- Repo gates:
  - `./.agents/agents skills-sync check` -> pass -> `PASS: skills structure and sync are valid`
  - `make doctor` -> pass -> `No issues found`
  - `make all` -> pass -> `164 passed in 4.05s` and final banner `All validations passed`
- Current-state artifacts:
  - `./.agents/agents repo-map . --dry-run` -> pass -> final output root resolves to `docs/map`
  - `./.agents/agents repo-map .` -> pass -> generated codemap now lands under `docs/map`
  - `./.agents/agents structure-map . --output .agents/arc/structure/` -> pass
- Downstream proof:
  - full bootstrap target -> pass -> `docs/map/README.md` present, `docs/map/ARCHITECTURE.md` absent before repo-map, `.agents/wb/` empty, no `.active_session`, no `.agents/arc/map`
  - full target `repo-map` -> pass -> `docs/map/ARCHITECTURE.md` created
  - partial bootstrap target -> pass -> `docs/map/README.md` present, `.agents/wb/` empty, no `.active_session`, no `.agents/arc/map`
  - partial target local `make all` -> pass -> preserved host output `host-local-all`
  - partial target `make agents-all` -> pass

## Risks / Follow-ups
- Global Codex skills such as the newer MCP/router docs still mention the old
  `.agents/arc/map` convention. This repo is now consistent internally, but the
  machine-global skill layer should be migrated separately so operators do not
  see mixed guidance across repos.
