---
doc_type: report
id: 260323_1753_execplan-native-planning-system_report_01
theme: execplan-native-planning-system
status: final
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
roadmap_feature: F-12
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
child_spec: ''
related_tasks:
- T-01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1753_execplan-native-planning-system_plan_01
  task: 260323_1753_execplan-native-planning-system_task_01
  postmortem: 260323_1753_execplan-native-planning-system_postmortem_01
---

# Report: execplan-native-planning-system

## Governance Context
- Roadmap feature: `F-12`
- Parent spec: `260323_1815_execplan-native-planning-system_spec_01`
- Child spec: ``

## Summary
- The scaffold plan system is now ExecPlan-native. Major workbench plans are explicitly treated as living ExecPlans, the repository has a canonical `PLANS.md` contract, bootstrap exports that contract downstream, and strict verification rejects finalized plans that do not maintain the new required sections and progress checklist.

## Delivered Changes
- Added root `PLANS.md` adapted from the official OpenAI cookbook guidance to this scaffold's workbench-based governance model.
- Updated `AGENTS.md` and the AGENTS template so major plans are explicitly treated as ExecPlans.
- Reworked `.agents/a-docs/templates/plan.md` into a living ExecPlan template with required sections for progress, discoveries, decisions, outcomes, context, work, steps, and acceptance.
- Added config flags plus strict verifier enforcement for final-plan ExecPlan sections and checkbox-based `Progress`.
- Added tests covering missing ExecPlan sections, missing progress checkboxes, and bootstrap export of `PLANS.md`.
- Updated bootstrap and operator docs so downstream repos receive and understand the same planning contract.

## Files Changed
- `PLANS.md`
- `AGENTS.md`
- `.agents/templates/AGENTS_TEMPLATE.md`
- `.agents/agents.config`
- `.agents/scripts/lib/agents_config.py`
- `.agents/a-docs/templates/plan.md`
- `.agents/scripts/verify-tasks.py`
- `.agents/scripts/tests/test_verify_tasks_strict.py`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/a-docs/standards/workflow.md`
- `.agents/a-docs/agentic/verify-tasks.md`
- `.agents/a-docs/agentic/agents-new.md`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/scripts/README.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `README.md`

## Verification
- Unit tests: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_verify_tasks_strict.py -q` -> pass -> Evidence: `26 passed`
- E2E tests: `./.agents/agents bootstrap <tmpdir> --skip-checks` -> pass -> Evidence: target repo bootstrapped successfully with `PLANS.md`
- Typecheck: `N/A` -> `N/A` -> Evidence: not applicable for this change set
- Lint: `make lint && make lint-scripts` -> pass -> Evidence: markdown and Python lint both passed
- Additional checks:
  - `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q` -> pass -> `14 passed`
  - `./.agents/agents sync --force` -> pass
  - `make all` -> pass
  - `./.agents/scripts/.venv/bin/python .agents/scripts/verify-tasks.py --strict .agents/wb/260323_1753_execplan-native-planning-system` -> pass

## Risks / Follow-ups
- The new verifier focuses on finalized plans. If the roadmap later demands earlier enforcement during active execution, that should land as a bounded follow-on change.

## Postmortem Link
- Postmortem: `260323_1753_execplan-native-planning-system_postmortem_01`

## Lessons (if any)
- none

---
*Template: `.agents/a-docs/templates/report.md`*
