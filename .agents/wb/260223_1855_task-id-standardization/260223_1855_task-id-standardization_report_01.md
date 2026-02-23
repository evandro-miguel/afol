---
doc_type: report
id: 260223_1855_task-id-standardization_report_01
theme: task-id-standardization
status: final
created_at: '2026-02-23T15:56:33-03:00'
updated_at: '2026-02-23T17:38:41-03:00'
related_tasks:
- 260223_1855_task-id-standardization_task_01
links:
  spec: 260223_1855_task-id-standardization_spec-lite_01
  ops: wb-update
---

# Report: task-id-standardization

## Summary
- Checklist tasks now have a formal ID pattern (`T-01`/`T-001`) for reliable automation.
- Verification now reports open tasks with exact `ID + file + line`.
- Session intake now supports `quick` tasks in one active session, reducing WB folder sprawl.
- WB metadata updates are now automatable (`updated_at` and `Files Changed`) without manual file edits.

## Delivered Changes
- Updated `.agents/scripts/verify-tasks.py`:
  - parse only checklist lines with explicit task IDs (`T-01` and `T-001`)
  - ignore table checkbox noise
  - print open task inventory with location
- Updated `.agents/scripts/agents-new.py`:
  - enforce one active session via `.agents/wb/.active_session`
  - add `--quick` mode (no new folder for small changes)
  - require `--force-new` for significant parallel/new streams
- Added `.agents/scripts/agents-wb-update.py`:
  - `touch` command updates `updated_at` for session docs
  - `files-changed` refreshes report `## Files Changed` from `git status`
- Updated task template ID examples in `.agents/a-docs/templates/task.md`.
- Updated docs in `.agents/a-docs/standards/agents-usage.md`.
- Updated make workflow with `make quick THEME=<name>`.
- Added make commands: `make wb-touch` and `make wb-files-changed`.
- Updated `AGENTS.md` template key rule to require marker + ID.
- Added lessons entries for task IDs and session-sprawl prevention.

## Files Changed

- `.agents/a-docs/lessons/general-lessons.md`
- `.agents/a-docs/standards/Makefile`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/checkbox-protocol.md`
- `.agents/a-docs/standards/evolution.md`
- `.agents/a-docs/standards/frontmatter.md`
- `.agents/a-docs/standards/metrics.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/a-docs/standards/template-standards.md`
- `.agents/a-docs/standards/workflow.md`
- `.agents/a-docs/templates/retrospective.md`
- `.agents/a-docs/templates/spec-lite.md`
- `.agents/a-docs/templates/task.md`
- `.agents/arc/structure/README.md`
- `.agents/arc/structure/backend.md`
- `.agents/arc/structure/tests.md`
- `.agents/scripts/README.md`
- `.agents/scripts/agents-doctor.py`
- `.agents/scripts/agents-index.py`
- `.agents/scripts/agents-lint-docs.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/agents-structure-map.py`
- `.agents/scripts/agents-tools-smoke.py`
- `.agents/scripts/agents-wb-update.py`
- `.agents/scripts/lib/`
- `.agents/scripts/sync-agent-docs.py`
- `.agents/scripts/verify-tasks.py`
- `.agents/tools.json`
- `.agents/z-arq/20260223_id-fix-check-temp/`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `QWEN.md`
## Verification
- `python3 -m py_compile .agents/scripts/verify-tasks.py` -> pass.
- `python3 -m py_compile .agents/scripts/agents-new.py` -> pass.
- `python3 -m py_compile .agents/scripts/agents-wb-update.py` -> pass.
- `make quick THEME=tiny-adjustment` -> pass; reused active session and created no folder.
- `./.agents/agents new should-block` -> expected block when active session exists.
- `make wb-touch` -> pass; updated `updated_at` in active session docs.
- `make wb-files-changed` -> pass; refreshed report file list from git state.
- `make verify` -> pass; report shows open tasks by ID + file + line when applicable.
- `make lint` -> pass.
- `make all` -> pass.

## Risks / Follow-ups
- Legacy task lines without IDs are no longer parsed as tasks. Keep templates and reviews enforcing ID format.
- Teams must manage `.active_session` lifecycle intentionally (clear/set when changing primary stream).
- `wb-files-changed` currently reflects full repo git state; teams can filter or post-edit for narrower scope.

## Spec Evidence
- Spec ID: `260223_1855_task-id-standardization_spec-lite_01`
- Evidence: command outputs above satisfy done criteria.

---
*Template: `.agents/a-docs/templates/report.md`*
