---
doc_type: explorer-check
id: 260323_1813_repo-map-system_explorer-check_01
theme: repo-map-system
status: final
owners:
- explorer
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1813_repo-map-system_brainstorm_01
  plan: 260323_1813_repo-map-system_plan_01
---

# Explorer Check: repo-map-system

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/tools.json`
  - `.agents/scripts/`
  - `.agents/a-docs/standards/`
- Existing docs inspected:
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/arc/map/README.md`
  - `README.md`
- Existing scripts/tools checked:
  - `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`
  - `~/.config/opencode/agent/repo-organizer.md`

## Commands Used
```bash
rg -n "arc/map|repo-map|run-repo-map|analysis-find-" /home/ozy/apps/agentic_start_folder -g '!**/.git/**'
sed -n '1,260p' /home/ozy/.config/opencode/agent/repo-organizer.md
sed -n '1,260p' /home/ozy/apps/docker-analisys-tools/scripts/run-repo-map.sh
```

## Findings
- The scaffold had no first-class `repo-map` command; only `structure-map` existed.
- OpenCode's `repo-organizer` relies on an external runner and generated artifacts under `.agents/arc/map/extra/`, which fits the new `F-11` contract.
- Bootstrap already provisions `.agents/arc/map/`, so the missing piece is operational wiring, not another architecture tree.

## Contradictions or Drift Found
- `arc/map/` had governance language, but the repo had no concrete codemap refresh command to back that promise.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Add a scaffold-native `agents-repo-map.py` wrapper instead of documenting an ad-hoc shell recipe.
  - Add a dedicated `repo-map` standard so the heavy codemap workflow stays distinct from `structure-map`.
- What remains uncertain:
  - Whether the external toolbox will run cleanly against this repository on the first attempt.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
