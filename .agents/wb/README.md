# Workbench

All active workstreams live here in session folders.

The `.active_session` file is a project-local convenience pointer for one
operator. Parallel agents should target sessions explicitly with `--session` or
`AGENTS_SESSION_ID`; do not treat `.active_session` as shared synchronization.

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
| `260413_1851_just-command-runner-migration` | `just-command-runner-migration` | active |

Use `./.agents/agents session list` and `./.agents/agents session sweep` to
review local session state before resuming or closing work.

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
