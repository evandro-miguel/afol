---
doc_type: report
id: 260306_2240_session-close-command_report_01
theme: session-close-command
status: final
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2240_session-close-command_plan_01
  task: 260306_2240_session-close-command_task_01
  postmortem: 260306_2240_session-close-command_postmortem_01
---

# Report: session-close-command

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``

## Summary
- Added an explicit session-closure command for governed workstreams. Agents can now close a session through one governed command that reuses strict verification and optionally repoints `.active_session`.

## Delivered Changes
- Added a dedicated `agents-session.py` command with `close` semantics.
- Wired the new command into the wrapper, docs, tests, and tool catalog.
- Preserved existing closure semantics by delegating eligibility to `verify-tasks --strict` instead of creating a new state model.
- Kept pointer mutation explicit through `--next-session` while leaving the current pointer unchanged by default.

## Files Changed
- `.agents/agents`
- `.agents/scripts/agents-session.py`
- `.agents/scripts/tests/test_execution_command_flow.py`
- `.agents/scripts/README.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-usage.md`
- `.agents/tools.json`
- `README.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: `93 passed, 5 deselected`
- E2E tests: `./.agents/agents session close --session 260306_2128_context-driven-execution-commands --next-session 260306_2240_session-close-command --json` -> pass -> Evidence: `"closed": true`, `"strict_verify": "passed"`
- Typecheck: `python3 -m py_compile .agents/scripts/agents-session.py` -> pass
- Lint: `make lint` -> pass -> Evidence: `Files checked: 261`, `Issues found: 0`
- Additional checks:
  - `make lint-scripts` -> pass -> Evidence: `All checks passed!`
  - `make all` -> pass -> Evidence: `✓ All validations passed`
  - `./.agents/agents status --json` -> pass -> Evidence: current session context resolved and task board reflected governed progress

## Risks / Follow-ups
- The default closure path keeps `.active_session` pointed at the closed session until another session is started or explicitly selected. This is intentional to avoid doctor warnings from an empty pointer.

## Postmortem Link
- Postmortem: `260306_2240_session-close-command_postmortem_01`

## Lessons (if any)
- Explicit lifecycle commands should reuse the strict verifier instead of duplicating closure rules.

---
*Template: `.agents/a-docs/templates/report.md`*
