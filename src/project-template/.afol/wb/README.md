# Plans

Versioned execution plans and governed task evidence live here.

Use this directory for durable ExecPlans and workbench artifacts that should
survive local runtime state cleanup. The active-session pointer is
`.afol/wb/.active_session`; events, caches, indexes, and disposable runtime
state stay under `.afol/data/` or the configured mutable data directory.

Legacy `.agents/wb/` content is discontinued and local-only.

## Naming Convention

```text
YYMMDD_HHMM_<theme>/
```

Example: `260223_1200_auth-refactor/`

## Session Contents

Each session folder can contain:

- `*_plan_*.md` - planning documents
- `*_task_*.md` - task tracking
- `*_log_*.md` - progress logs
- `*_report_*.md` - final reports
- `*_research_*.md` - research documents
- `*_brainstorm_*.md` - ideation notes
- `.evidence.jsonl` - task-scoped closure evidence

Use `afol` commands for lifecycle updates. Do not create new workbench content
under `.agents/wb/`.
