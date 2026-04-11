---
doc_type: report
id: 260306_1815_roadmap-first-governance_report_01
theme: roadmap-first-governance
status: active
created_at: '2026-03-06T18:15:16-03:00'
updated_at: '2026-03-06T19:29:04-03:00'
roadmap_feature: F-01
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_1815_roadmap-first-governance_plan_01
  task: 260306_1815_roadmap-first-governance_task_01
related_tasks:
- T-01
- T-02
- T-03
- T-04
---

# Report: roadmap-first-governance

## Summary
- Completed the roadmap-first rollout for documentation/templates, workflow enforcement, and the remaining reliability hardening.
- The scaffold now treats roadmap/spec linkage as the default operating model for standard workstreams and ships with a truthful baseline validation path.

## Delivered Changes
- Rewrote roadmap/spec/spec-lite/plan/task/log/report templates around feature intent, user journey, and governance linkage.
- Updated workflow standards, AGENTS guidance, README usage, Make targets, and tools catalog metadata to document the mandatory model.
- Added governance validation to `agents-new`, `agents-doctor.py`, and `verify-tasks.py`.
- Added and updated script tests covering governance validation and strict verification scenarios.
- Hardened `verify-tasks.py` to treat empty optional frontmatter values consistently.
- Fixed telemetry parity so failed wrapper invocations are recorded and `session_end` can be emitted from workbench finalization.
- Updated bootstrap guidance and post-bootstrap checks to initialize and validate the roadmap-first baseline.
- Switched default script execution from `unittest discover` to pytest and added a CI workflow.

## Files Changed
- `.agents/arc/GENERAL-ROADMAP.md`
- `.agents/a-docs/templates/roadmap.md`
- `.agents/a-docs/templates/spec.md`
- `.agents/a-docs/templates/spec-lite.md`
- `.agents/a-docs/templates/plan.md`
- `.agents/a-docs/templates/task.md`
- `.agents/a-docs/templates/log.md`
- `.agents/a-docs/templates/report.md`
- `.agents/a-docs/standards/workflow.md`
- `.agents/rules/RULE-002-workstream-creation.md`
- `AGENTS.md`
- `README.md`
- `.agents/agents`
- `.agents/a-docs/standards/Makefile`
- `.agents/tools.json`
- `.agents/agents.config`
- `.agents/scripts/lib/agents_config.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/agents-doctor.py`
- `.agents/scripts/agents-telemetry.py`
- `.agents/scripts/agents-wb-update.py`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/agents-index.py`
- `.agents/scripts/verify-tasks.py`
- `.agents/scripts/tests/test_agents_new_quick_mode.py`
- `.agents/scripts/tests/test_agents_telemetry.py`
- `.agents/scripts/tests/test_agents_wb_update_task_marker.py`
- `.agents/scripts/tests/test_verify_tasks_strict.py`
- `.agents/scripts/tests/unit/test_refactored_functions.py`
- `.agents/scripts/tests/integration/test_critical_workflows.py`
- `.agents/scripts/README.md`
- `.github/workflows/agents-scaffold-ci.yml`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: 68 passed, 5 deselected
- E2E tests: `N/A` -> not run -> Evidence: scaffold governance change does not ship an E2E harness
- Typecheck: `N/A` -> not run -> Evidence: repository has no dedicated typecheck target for these scripts
- Lint: `make lint` -> pass -> Evidence: 0 markdown issues
- Additional checks:
  - `make doctor` -> pass with 1 info item -> Evidence: roadmap governance check found 5 features and no errors
  - `make sync` -> pass -> Evidence: `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` synced from `AGENTS.md`
  - `make all` -> pass -> Evidence: full scaffold validation passed without depending on active-session state

## Risks / Follow-ups
- F-02/F-03 remain open: define and enforce the exact `spec-lite` threshold and child-spec decomposition threshold.

## Lessons (if any)
- Use the dedicated `apply_patch` tool for patch application instead of routing patch text through shell execution.

---
*Template: `.agents/a-docs/templates/report.md`*
