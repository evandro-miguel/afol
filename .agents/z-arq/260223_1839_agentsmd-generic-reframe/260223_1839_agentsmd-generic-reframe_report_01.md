---
doc_type: report
id: 260223_1839_agentsmd-generic-reframe_report_01
theme: agentsmd-generic-reframe
status: final
created_at: '2026-02-23T15:41:58-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
related_tasks:
- 260223_1839_agentsmd-generic-reframe_task_01
links:
  spec: 260223_1839_agentsmd-generic-reframe_spec-lite_01
---

# Report: agentsmd-generic-reframe

## Summary
- Root `AGENTS.md` was rewritten into a generic-first project contract format.
- The new version keeps reusable sections and fills them with current repo context.

## Delivered Changes
- Reframed `AGENTS.md` to the requested structure:
  - Project overview
  - Current stack
  - Repo structure
  - Important files
  - General rules
  - Agentic files
  - Task management
  - Commands
  - Skills
  - MCPs (including Docker gateway workflow)
  - Tools/Core principles
- Synced root AGENTS to agent-specific files (`QWEN.md`, `CLAUDE.md`, `GEMINI.md`).
- Added lesson entry for "generic-first AGENTS contract" correction pattern.

## Files Changed
- `AGENTS.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.agents/a-docs/lessons/general-lessons.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/260223_1839_agentsmd-generic-reframe_plan_01.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/260223_1839_agentsmd-generic-reframe_task_01.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/260223_1839_agentsmd-generic-reframe_spec-lite_01.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/260223_1839_agentsmd-generic-reframe_log_01.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/260223_1839_agentsmd-generic-reframe_report_01.md`

## Verification
- `make sync` -> pass -> 3 files updated (`QWEN.md`, `CLAUDE.md`, `GEMINI.md`).
- `make lint` -> pass -> 26 files checked, 0 issues.
- `make verify` -> pass -> all task files completed/skipped as expected.
- `make all` -> pass -> doctor + structure + index + verify completed.

## Risks / Follow-ups
- Commands section intentionally marks dev/test/build as `N/A` for this baseline repo. If the repo evolves into runnable software, update those commands.

## Spec Evidence
- Spec ID: `260223_1839_agentsmd-generic-reframe_spec-lite_01`
- Evidence: verification commands above satisfy spec done criteria.

---
*Template: `.agents/a-docs/templates/report.md`*
