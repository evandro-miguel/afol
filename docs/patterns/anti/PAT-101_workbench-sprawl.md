---
doc_type: pattern
id: "PAT-101"
type: "anti"
status: "active"
tags: ["process", "workbench", "organization"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-06-09T21:10:00-03:00"
---

# Anti-Pattern: Workbench Sprawl

## Context

Creating multiple AFOL sessions without completing or explicitly pausing current
work.

## Anti-Pattern

```bash
afol new auth-refactor --feature-id F-01 --parent-spec .afol/adm/specs/auth.md
afol new oauth-integration --feature-id F-02 --parent-spec .afol/adm/specs/oauth.md
afol new session-management --feature-id F-03 --parent-spec .afol/adm/specs/session.md
```

## Better Approach

- Run `afol status` before opening another session.
- Reuse the current session when the work is related.
- Run `afol verify-tasks --strict .afol/wb/<session-id>` before closeout.
- Archive retained legacy material only under `.afol/data/migrations/`.

Do not use retired `.agents/wb` or `.agents/z-arq` surfaces.
