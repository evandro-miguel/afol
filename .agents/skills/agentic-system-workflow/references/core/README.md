---
description: Core workflow commands and processes for the agentic system
metadata:
  tags: "agentic-system, core-workflow, processes"
---

# Agentic System Core Workflow

The agentic system strictly manages workstreams via a structured directory layout under `.agents/wb/` and enforces the use of specific files to track planning, execution, and outcomes.

## 1. Workstream and File Naming

A workstream groups a cohesive set of tasks under a single directory.

- **Path Schema**: `.agents/wb/YYMMDD_HHMM_<theme>/`
- **File Schema**: `YYMMDD_HHMM_<theme>_<doc_type>_<NN>.md`
- Keep a single active workstream unless explicitly instructed otherwise by the user. "Quick modes" can reuse the active session.

## 2. Supported Documentation Types

Inside the session folder, you must use standardized templates from `.agents/a-docs/templates/`:
- `plan`: Detailed phases and action plans. Split into multiple phases if it becomes too long.
- `task`: Execution checklist. Use formatting like `- [ ] T-01 Start server`.
- `brainstorm`: Initial ideation and context discovery.
- `research`: In-depth domain exploration or file findings.
- `log`: Timeline, execution outputs, command evidence, and errors.
- `report`: Summaries of outcomes, problems found, applied fixes, and verification evidence.
- `spec`/`spec-lite`: Architecture / technical specifications.

## 3. Workflow Steps

1. Create/update plan in `<theme>_plan_{NN}.md` for significant changes.
2. Track execution checklist in `<theme>_task_{NN}.md` using task IDs.
3. Record timeline and command evidence in `<theme>_log_{NN}.md`.
4. Summarize outcomes and verification in `<theme>_report_{NN}.md`.
5. Link related artifacts (spec/plan/task/report) via frontmatter `links`.
6. Update lessons after any correction or process failure using `.agents/a-docs/lessons/entries/YYYYMMDD_HHMM_<slug>.md`.
7. Use script-driven metadata updates (`updated_at`) instead of manual edits.

## 4. Metadata Update Policy (Make `wb-touch`)

NEVER manually edit the `updated_at` timestamps in the frontmatter of these markdown files.

Use the automation command after making edits:
```bash
make wb-touch
# OR
./.agents/agents wb-update touch
# OR
./.agents/agents wb-update touch --file <path>
```
