---
doc_type: standard
id: 260426_1215_remote-agent-review_standard_01
status: active
created_at: 2026-06-14 00:00:00+00:00
updated_at: 2026-06-14 00:00:00+00:00
title: Remote Agent Review
---

# Remote Agent Review

Use this guide for review of remote-agent PRs under spec
`260426_1215_parallel-session-isolation_spec_01`.

## Contamination problem

- `.afol/wb/.active_session` is a single mutable global pointer.
- When a PR mutates that file, the merge can drift the repository-wide pointer
  away from the operator's real session.
- That creates false activity: an unrelated session can appear active after
  merge, or a remote branch can overwrite the pointer used by someone else.
- In parallel work, pointer edits are contamination, not ordinary state.

## Reject rule

- Reject any PR that changes `.afol/wb/.active_session` unless the change is
  explicitly about session management.
- Treat this as the §7.3 sweep guard: flag pointer changes unless the review
  context says the PR is intentionally updating session governance.
- If the diff mixes useful code with pointer drift, split the change and reject
  the contaminated patch.

## Salvage useful code

- Keep the code, discard the pointer mutation.
- Cherry-pick or re-apply only the useful edits into a clean branch/PR.
- Run `afol session list` to verify there are no stray bindings or unexpected
  active sessions before resuming work.
- Resume remote work with an explicit session target, for example:

```bash
afol catchup --session <id>
```

- Prefer explicit `--session` on every follow-up command when the work is not a
  single-operator local edit.

## Remote contributor guidance

- Never commit `.afol/wb/.active_session`.
- Bind the remote branch or worktree with `afol session bind`.
- Use explicit `--session` for commands that create, update, or resume work.
- Treat `.afol/wb/session-context.json` as gitignored operational state only;
  it is the safe place for context-local binding, not a review artifact.

## CI posture

- CI must validate without requiring `.afol/wb/.active_session` to point at a
  local session folder.
- `AFOL_CI=1` and `CI=1` reject global fallback behavior.
- A green CI run means the workflow is safe even when the repository-global
  pointer is absent, stale, or unrelated to the PR author.

## Review checklist

- Does the PR touch `.afol/wb/.active_session`?
- If yes, is it a deliberate session-management change with explicit scope?
- Can the useful code be kept after removing the pointer mutation?
- Was `afol session list` checked for stray bindings?
- Did the contributor resume with `afol catchup --session <id>` or another
  explicit `--session` path?
- Is context state confined to `.afol/wb/session-context.json` and not the PR?

## Rule of thumb

- Accept code that improves behavior.
- Reject code that mutates global session identity.
- When in doubt, preserve the work and delete the pointer change.
