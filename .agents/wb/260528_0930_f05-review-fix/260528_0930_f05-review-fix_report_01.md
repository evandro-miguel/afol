---
doc_type: report
id: 260528_0930_f05-review-fix_report_01
theme: f05-review-fix
status: final
owners:
- worker
workstream_intent: delivery
artifact_purpose: Summarize delivered changes and verification after review-fix work lands.
created_at: 2026-05-28T09:45:05-03:00
updated_at: '2026-05-28T09:45:05-03:00'
roadmap_feature: F-05
parent_spec: 260521_0050_smart-rules-and-skills-routing_spec_01
child_spec:
related_tasks:
- 260528_0930_f05-review-fix_task_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260528_0930_f05-review-fix_plan_01
  task: 260528_0930_f05-review-fix_task_01
output_artifacts:
  primary:
    report: 260528_0930_f05-review-fix_report_01
    task: 260528_0930_f05-review-fix_task_01
  sidecars:
    brainstorm: null
    research: null
    explorer_check: null
    postmortem: null
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Report: f05-review-fix

## Governance Context

- Roadmap feature: `F-05`
- Parent spec: `260521_0050_smart-rules-and-skills-routing_spec_01`
- Child spec: ``

## Summary

- Template parity now includes the F-05 rules catalog and skills metadata surfaces.
- Optional missing feature rules now warn-and-skip instead of hard-failing.
- `skills-sync update-metadata` now requires an existing skill unless `--create` is explicit.

## Delivered Changes

- Mirrored the F-05 execution bundle into `src/project-template/.agents/scripts/lib/execution_commands.py`.
- Added warning emission in `agents-implement.py` for skipped optional rules.
- Added explicit create gating and metadata helpers to `agents-skills-sync.py`.
- Added focused negative tests for optional rule skips, required rule failures, and metadata creation.
- Added `src/project-template/.agents/rules/index.json`, `RULE-006-applicable-rule-resolution.md`, and `RULE-007-postmortem-governance-review.md`.

## Files Changed

- `.agents/scripts/lib/execution_commands.py`
- `.agents/scripts/agents-implement.py`
- `.agents/scripts/agents-skills-sync.py`
- `.agents/scripts/tests/test_execution_command_scenarios.py`
- `.agents/scripts/tests/test_agents_skills_sync.py`
- `src/project-template/.agents/scripts/lib/execution_commands.py`
- `src/project-template/.agents/scripts/agents-implement.py`
- `src/project-template/.agents/scripts/agents-skills-sync.py`
- `src/project-template/.agents/scripts/tests/test_execution_command_scenarios.py`
- `src/project-template/.agents/scripts/tests/test_agents_skills_sync.py`
- `src/project-template/.agents/rules/index.json`
- `src/project-template/.agents/rules/RULE-006-applicable-rule-resolution.md`
- `src/project-template/.agents/rules/RULE-007-postmortem-governance-review.md`

## Verification

- Root focused pytest: passed
- Template focused pytest: passed
- `just lint`: passed
- `just lint-scripts`: passed
- `just test-scripts-all`: passed, coverage `83.70%`
- `bun run typecheck`: passed
- `bun test`: passed
- `git diff --check`: passed
- `./.agents/agents verify-tasks .agents/wb/260528_0911_smart-rules-and-skills-routing --strict`: passed
- `./.agents/agents verify-tasks .agents/wb/260528_0930_f05-review-fix --strict`: failed while task was still in_progress, then expected to pass after closeout

## Risks / Follow-ups

- None in the current slice.

## Lessons (if any)

- Template parity needs explicit tests, not just code mirroring.
