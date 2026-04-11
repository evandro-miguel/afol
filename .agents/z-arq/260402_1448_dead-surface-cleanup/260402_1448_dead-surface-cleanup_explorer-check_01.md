---
doc_type: explorer-check
id: 260402_1448_dead-surface-cleanup_explorer-check_01
theme: dead-surface-cleanup
status: final
owners:
- explorer
created_at: '2026-04-02T14:48:32-03:00'
updated_at: '2026-04-02T15:01:21-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1448_dead-surface-cleanup_brainstorm_01
  plan: 260402_1448_dead-surface-cleanup_plan_01
---

# Explorer Check: dead-surface-cleanup

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/`
  - `.agents/scripts/migrate-task-board.py`
  - `README.md`
  - `.agents/arc/structure/`
- Existing docs inspected:
  - `.agents/scripts/tests/TEST_STRATEGY.md`
  - `.agents/a-docs/lessons/entries/20260227_0900_task-board-simplification.md`
- Existing scripts/tools checked:
  - `rg`
  - `git status`
  - `uv run --project .agents/scripts python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/`

## Commands Used
```bash
rg -n "DEFAULT_UNIVERSAL_SKILLS_REPO|DEFAULT_UNIVERSAL_SKILLS_REF|load_universal_skills_source_contract" .agents/scripts/agents-bootstrap.py
rg -n "migrate-task-board|scenarios\.yaml|tests/e2e/__init__" . README.md AGENTS.md .agents
git status --short .coverage .agents/scripts/tests README.md .agents/arc/structure
uv run --project .agents/scripts python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/
```

## Findings
- `load_universal_skills_source_contract()` and its remote-default constants were
  left behind in bootstrap and had no live caller after the repo-local seed flow landed.
- `.agents/scripts/migrate-task-board.py` had no live consumer outside a historical lesson entry.
- `.agents/scripts/tests/e2e/__init__.py` and `.agents/scripts/tests/test_data/scenarios.yaml`
  were tracked leftovers with no executable consumer in the current suite.
- `.agents/scripts/tests/TEST_STRATEGY.md` was documenting a large non-existent test tree.

## Contradictions or Drift Found
- Generated structure docs still listed deleted files until the structure map was regenerated.
- Historical lesson entries still mention the deleted migration script; they were kept as historical evidence.

## Impact on the Plan
- What changed in the plan because of exploration:
  - Scope was reduced to high-confidence dead surfaces only.
  - Generated structure docs were added to the cleanup pass so the repo map would stay truthful.
- What remains uncertain:
  - Compatibility cache content under `.agents/cache/universal-skills` still deserves a separate review.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
