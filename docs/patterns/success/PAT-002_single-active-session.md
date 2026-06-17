---
doc_type: pattern
id: "PAT-002"
type: "success"
status: "active"
tags: ["process", "workbench", "focus"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-06-09T21:10:00-03:00"
---

# Pattern: Single Active AFOL Session

## Context

Managing multiple tasks or workstreams with AFOL.

## Pattern

1. Check current focus with `afol status`.
2. Prefer completing or extending the current session before creating another.
3. Create a new session with `afol new` only when the work is materially separate.
4. Target explicit sessions with `--session` in parallel work.

## Example

```bash
afol status
afol new oauth-integration --feature-id F-02 --parent-spec .afol/adm/specs/oauth.md
afol evidence --session 260224_1200_feature-a --task-id T-01 --command "bun test" --result passed
afol done --session 260224_1200_feature-a --task-id T-01
```

AFOL allows multiple sessions, but uncontrolled session sprawl still makes
verification and closeout harder.
