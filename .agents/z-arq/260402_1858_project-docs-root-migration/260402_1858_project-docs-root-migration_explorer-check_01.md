---
doc_type: explorer-check
id: 260402_1858_project-docs-root-migration_explorer-check_01
theme: project-docs-root-migration
status: final
owners:
- explorer
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1858_project-docs-root-migration_brainstorm_01
  plan: 260402_1858_project-docs-root-migration_plan_01
---

# Explorer Check: project-docs-root-migration

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/agents.config`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/scripts/lib/agents_config.py`
  - `AGENTS.md`
  - `README.md`
  - `docs/`
- Existing docs inspected:
  - `docs/standards/bootstrap-other-repo.md`
  - `docs/standards/repo-map.md`
  - `docs/standards/workflow.md`
- Existing scripts/tools checked:
  - `.agents/agents`
  - `make doctor`
  - `make all`

## Commands Used
```bash
rg -n "\.agents/(a-docs|arc|templates)" . -S --glob '!.agents/wb/**' --glob '!.git/**'
find docs -type d | sort
git status --short
```

## Findings
- The canonical trees had already been moved into `docs/`, but many runtime and doc surfaces still pointed at `.agents/a-docs` and `.agents/arc`.
- Bootstrap and the integration/runtime tests were the highest-risk consumers because they define the downstream contract.

## Contradictions or Drift Found
- `docs/map/` still described `.agents/a-docs` until the repo-map rerun.
- Session template artifacts still pointed at `docs/templates`, but the generated workbench docs in this session were still on the old footer text.

## Impact on the Plan
- What changed in the plan because of exploration:
  - retarget config/bootstrap/tests first, then regenerate derived docs
- What remains uncertain:
  - no major uncertainty remained after the inventory pass

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `docs/templates/explorer-check.md`*
