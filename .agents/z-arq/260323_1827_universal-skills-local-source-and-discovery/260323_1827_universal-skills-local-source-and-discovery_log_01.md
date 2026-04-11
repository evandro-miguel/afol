---
doc_type: log
id: 260323_1827_universal-skills-local-source-and-discovery_log_01
theme: universal-skills-local-source-and-discovery
status: active
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
  task: 260323_1827_universal-skills-local-source-and-discovery_task_01
---

# Log: universal-skills-local-source-and-discovery

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Timeline
- 2026-03-23T21:27:53Z - Created governed `F-10` workstream - session initialized and activated
- 2026-03-23T21:28:00Z - Reviewed current `skills-sync` config/script/docs/tests - confirmed missing discovery commands and cache-first source model
- 2026-03-23T21:28:35Z - Cloned upstream source to `/home/ozy/apps/universal-skills` - local checkout ready for integration work
- 2026-03-23T21:33:00Z - Patched `agents-skills-sync.py` and tests - added local source preference plus `list/search/ensure`
- 2026-03-23T21:35:00Z - Patched docs/config/catalog/Makefile - aligned command surface and preferred source path
- 2026-03-23T21:36:00Z - Moved 78 overlapping global Codex skills - archived to `/home/ozy/.codex/skills-archive/20260323_1836_universal-skills-global`
- 2026-03-23T21:39:00Z - Ran targeted live commands and repo validation - all required checks passed
- 2026-03-23T21:46:00Z - User clarified that overlapping universal-skills entries can be removed - prepared cleanup of the residual archive and lesson follow-up
- 2026-03-23T22:00:00Z - Patched bootstrap and runtime docs - added sibling checkout preparation for `apps/` targets and project-local skills guidance
- 2026-03-23T22:02:00Z - Ran targeted bootstrap/runtime tests - sibling checkout path verified in a real `apps/` target

## Decisions
- Prefer sibling local source checkout with compatibility fallback -> matches requested operator workflow while preserving older repos
- Archive overlapping global Codex skills instead of hard deleting -> safer cleanup with recovery path
- Remove the residual archive after explicit user clarification -> follow the requested deletion policy over extra preservation
- Bootstrap `apps/` targets should prepare `../universal-skills` explicitly -> avoids relying on post-check side effects and works even with `--skip-checks`
- Governance should state that project-local skills are preferred -> keeps Codex global state lean and repo-specific behavior explicit

## Blockers
- none

## Next Step
- Refresh timestamps, rerun strict verification, and close the extended `F-10` slice

---
*Template: `.agents/a-docs/templates/log.md`*
