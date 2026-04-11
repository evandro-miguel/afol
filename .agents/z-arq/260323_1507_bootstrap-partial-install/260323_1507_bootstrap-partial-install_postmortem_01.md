---
doc_type: postmortem
id: 260323_1507_bootstrap-partial-install_postmortem_01
theme: bootstrap-partial-install
status: draft
owners:
- orchestrator
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1507_bootstrap-partial-install_plan_01
  task: 260323_1507_bootstrap-partial-install_task_01
  report: 260323_1507_bootstrap-partial-install_report_01
---

# Postmortem: bootstrap-partial-install

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Make the scaffold installable into already-running projects with a first-class partial-install path and remove bootstrap-created validation noise.

## What Was Achieved
- Added explicit `--partial` support to bootstrap and `PARTIAL=1` support to the Make wrapper.
- Generated a different adoption baseline for existing projects so the target does not inherit fresh-project backlog placeholders.
- Removed target bootstrap noise from doctor/lint by handling zero-session targets correctly, excluding imported skill docs from markdown lint, and normalizing generated IDs.
- Updated the project/system docs to describe the explicit partial-install contract.

## What Did Not Land
- No known planned item was left out of scope.

## Problems Encountered
- Documentation initially described partial install as an implicit behavior, which lagged the clearer operator contract added in code.
- A legacy workbench file in this scaffold still used a non-standard ID and produced informational doctor noise during validation.

## Root Causes
- Bootstrap behavior evolved incrementally before the install modes were formalized.
- Historical docs predated the stricter current naming/validation expectations.

## Useful Discoveries
- Clean bootstrap validation requires treating imported upstream skill docs differently from project-owned docs.
- New targets without any workstreams should not be forced to carry an active-session pointer.
- Existing-project adoption benefits from its own starter roadmap/spec baseline instead of the fresh-repo placeholder narrative.

## Follow-ups for Next Rounds
- Consider adding a dedicated regression test for the Make wrapper `PARTIAL=1` path if bootstrap wrapper behavior changes again.
- Replace adoption placeholder specs in installed target repos before starting non-trivial delivery work.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
