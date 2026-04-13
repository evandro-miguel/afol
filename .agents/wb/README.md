# Workbench

All active workstreams live here in session folders.

The `.active_session` file points to the live session folder and should be
treated as the source of truth when the table and folders drift.

## Naming convention

```text
wb/YYMMDD_HHMM_<theme>/
```

Example: `wb/260223_1200_auth-refactor/`

## Session contents

Each session folder contains:

- `*_plan_*.md` - Planning documents
- `*_task_*.md` - Task tracking
- `*_log_*.md` - Progress logs
- `*_report_*.md` - Final reports
- `*_research_*.md` - Research documents
- `*_brainstorm_*.md` - Ideation notes
- `*_explorer-check_*.md` - Proof that the plan was checked against the current repo
- `*_postmortem_*.md` - Final closure artifact required before report finalization

Optional pack folders for multiple major tracks:

- `packs/<pack-slug>/` - grouped plan/task/brainstorm/research/log/report/postmortem docs

## Active sessions

| Session | Theme | Status |
|---------|-------|--------|
| `260412_2115_project-finalization-orchestration` | `project-finalization-orchestration` | active |

## Archive

Completed sessions should be marked complete in their report frontmatter.

Session folders usually contain:

- `*_plan_*.md` - planning documents
- `*_task_*.md` - task tracking
- `*_log_*.md` - progress logs
- `*_report_*.md` - final or interim reports
- `*_research_*.md` - research documents
- `*_brainstorm_*.md` - ideation notes
- `*_explorer-check_*.md` - proof that the plan was checked against the current repo
- `*_postmortem_*.md` - final closure artifact required before report finalization

---

*Workbench: `.agents/wb/`*
