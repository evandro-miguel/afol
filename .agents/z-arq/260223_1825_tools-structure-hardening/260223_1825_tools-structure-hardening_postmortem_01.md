---
doc_type: postmortem
id: 260223_1825_tools-structure-hardening_postmortem_01
theme: tools-structure-hardening
status: final
created_at: '2026-02-23T18:25:00Z'
updated_at: '2026-04-04T17:00:00Z'
links:
  plan: 260223_1825_tools-structure-hardening_plan_01
  task: 260223_1825_tools-structure-hardening_task_01
  report: 260223_1825_tools-structure-hardening_report_01
---

# Postmortem: tools-structure-hardening

## Goal
- Fix crashes and signal-quality issues in core scaffold tooling (lint-docs, structure-map, agents-new, verify-tasks).

## Expected Outcome
- `make doctor`, `make lint`, `make structure`, `make verify` all pass without errors.

## What Was Achieved
- Fixed 4 scripts with targeted patches; all validation commands pass cleanly.
- Generated structure docs now include previously missing directories.

## What Did Not Land
- None.

## Problems Encountered
- None blocking.

## Root Causes
- Parser crashes on non-frontmatter markdown; relative-path rendering bugs; placeholder replacement order issues.

## Useful Discoveries
- N/A

## Follow-ups for Next Rounds
- Normalize frontmatter conventions across templates to reduce historical warnings.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `docs/templates/postmortem.md`*
