---
description: Standard workbench directory layout and naming conventions.
metadata:
  tags: "workbench, structure, naming, sessions, active-session, roadmap, specs"
---

# Workbench Structure

## Base Path

- Use `.agents/wb/` as the project-local workbench root.
- When the scaffold provides `.agents/wb/.active_session`, use it as the canonical pointer for the current session.

## Session Folder

- Create one session folder per workstream:
- `YYMMDD_HHMM_<theme>/`
- `<theme>` should be kebab-case and concise.
- Some scaffolds also support nested `packs/<pack-slug>/` folders for grouped multi-track work inside a single session.

## Required Document Types

- `plan`
- `task`
- `log`
- `report`

These are the minimum files that should exist in nearly every active session.

## Common Companion Artifacts

- `brainstorm` for option analysis before major planning
- `explorer-check` for proof that the current repo was inspected
- `research` for targeted investigation or evidence gathering
- `postmortem` for session closure and reusable lessons
- `spec-lite` or `spec` when the workstream needs local execution-level specification
- `blocks` when the repo uses extra coordination/checklist documents
- roadmap/spec linkage fields when the repository uses governed delivery

## Session-Level Helper Files

- `.active_session` at `.agents/wb/.active_session` when the scaffold tracks the active session explicitly
- `.evidence.jsonl` or similar generated evidence files when the repo records structured proof alongside markdown artifacts
- `packs/<pack-slug>/` when one session contains multiple major tracks with their own document sets

## File Naming

- `YYMMDD_HHMM_<theme_of_PRD>_<type>_<number>.md`
- `<number>` starts at `01` and increments when splitting large content.
- Common `<type>` values in richer scaffolds include:
  - `plan`
  - `task`
  - `log`
  - `report`
  - `brainstorm`
  - `research`
  - `explorer-check`
  - `postmortem`
  - `spec-lite`
  - `spec`
  - `blocks`

## Example

```text
.agents/wb/
  .active_session
  260214_1630_checkout-redesign/
    260214_1630_checkout-redesign_plan_01.md
    260214_1630_checkout-redesign_task_01.md
    260214_1630_checkout-redesign_brainstorm_01.md
    260214_1630_checkout-redesign_explorer-check_01.md
    260214_1630_checkout-redesign_spec-lite_01.md
    260214_1630_checkout-redesign_report_01.md
    260214_1630_checkout-redesign_log_01.md
    260214_1630_checkout-redesign_research_01.md
    260214_1630_checkout-redesign_postmortem_01.md
    packs/
      backend/
      rollout/
```
