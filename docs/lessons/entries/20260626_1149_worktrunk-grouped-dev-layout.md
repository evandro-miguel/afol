---
doc_type: lesson_entry
id: 20260626_1149_worktrunk-grouped-dev-layout
status: active
created_at: '2026-06-26T11:49:25-03:00'
updated_at: '2026-06-26T11:49:25-03:00'
tags: [git, worktrunk, worktrees]
---

# Use Grouped Worktrunk Layout With Dev Branch

## Context

During the AFOL rename, the first migration used a sibling `afol.main_dev`
layout. User correction clarified that Worktrunk standard should group the
main checkout and dev worktree under the project folder.

## Lesson

For new or migrated projects, use `~/01_projects/dev/<repo>/<repo>` for the
main checkout and `~/01_projects/dev/<repo>/<repo>.dev` for the standard
development worktree. The integration branch is `dev`, not `main_dev`.

## Prevention

- Check the intended Worktrunk folder shape before moving worktrees.
- Use branch `dev` for ongoing agent work unless the user asks otherwise.
- Treat nested `.worktree/` directories and `main_dev` branches as legacy
  migration targets.
