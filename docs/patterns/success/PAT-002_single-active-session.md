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

1. Check current focus with `afol s`.
2. Prefer completing or extending the current session before creating another.
3. Create a new session with `afol n` only when the work is materially separate.
4. Pass `-S` / `--session` only for CI or multi-agent work when the session is
   ambiguous.

## Example

```bash
afol s
afol n oauth-integration -F F-02 -P .afol/adm/specs/oauth.md -t "Implement OAuth"
afol st T-01
afol d T-01 -x "bun test"
afol c
```

`e` is diagnostic only. Do not require `evidence` then `done` as two hops.
Long `--session` / `-S` forms remain valid for CI and parallel sessions:

```bash
afol st -S 260224_1200_feature-a -T T-01
afol d -S 260224_1200_feature-a -T T-01 -x "bun test"
```

AFOL allows multiple sessions, but uncontrolled session sprawl still makes
verification and closeout harder.
