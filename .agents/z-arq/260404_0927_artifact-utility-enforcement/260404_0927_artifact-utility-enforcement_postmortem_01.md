---
doc_type: postmortem
id: 260404_0927_artifact-utility-enforcement_postmortem_01
theme: artifact-utility-enforcement
status: final
owners:
- orchestrator
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:35-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0927_artifact-utility-enforcement_plan_01
  task: 260404_0927_artifact-utility-enforcement_task_01
  report: 260404_0927_artifact-utility-enforcement_report_01
---

# Postmortem: artifact-utility-enforcement

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Stop the scaffold from creating workbench artifacts just because the template package exists, and prove the new behavior with tests and docs.

## What Was Achieved
- The workbench now creates only the minimum artifact seed for the selected intent by default.
- Delivery sessions seed `task` instead of `plan` + `task`, closure sessions seed `report` instead of `report` + `postmortem`, and extra artifacts must be justified with explicit intent, later materialization, or real closure work.
- Placeholder-only artifacts are now rejected semantically in readiness and strict verification, and the repo passed `make all` after the change.

## What Did Not Land
- No dedicated lazy-close command was added for automatically materializing a postmortem during session closure; that can be a later ergonomic slice if needed.

## Problems Encountered
- The first utility checker implementation passed behaviorally but failed Ruff complexity limits.
- Several docs and tests still described the old package-default model and had to be realigned after the policy change.

## Root Causes
- The scaffold had evolved from hardcoded file creation into a manifest-driven system, but the defaults still encoded an older assumption that every governed session should start with the same package of artifacts.
- Validation previously focused on existence and status, which allowed empty or template-shaped artifacts to look usable.

## Useful Discoveries
- A separate artifact catalog plus intent policy is the right split: catalog answers “what artifacts exist,” policy answers “why may they exist now.”
- Strict verification needs to run even when task files are absent, otherwise research-only or closure-only sessions can bypass semantic checks.
- Minimal defaults plus conservative theme-based intent inference removes a large class of accidental over-creation without blocking explicit power-user flows.

## Follow-ups for Next Rounds
- Consider a dedicated helper for late-stage artifact materialization during session close, especially for postmortems.
- Keep future artifact additions behind the same rule: no new default creation unless the artifact is necessary at session start.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `docs/templates/postmortem.md`*
