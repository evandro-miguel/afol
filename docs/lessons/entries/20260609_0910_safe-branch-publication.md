---
doc_type: lesson_entry
id: 20260609_0910_safe-branch-publication
status: active
created_at: '2026-06-09T09:10:00-03:00'
updated_at: '2026-06-09T09:10:00-03:00'
tags: [git, branching, merge]
---

# Publish From Safe Executor Branch When Target Diverges

## Context

During merge-pr20-pr24 session, direct push to `main_dev` failed with
non-fast-forward because the target had diverged. The solution was to create
a safe executor branch (`main_dev_merge/pr20-pr24`) for integration.

## Lesson

When the target branch has diverged, publish from an executor/merge branch
rather than attempting direct push or force-push. This preserves history and
allows safe conflict resolution.

## Prevention

- Detect divergence before attempting push.
- Create an executor branch for safe integration.
- Merge PRs in explicit order with metadata refresh between each.
