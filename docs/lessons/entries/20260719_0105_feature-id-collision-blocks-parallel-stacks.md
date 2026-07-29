---
doc_type: lesson_entry
id: 20260719_0105_feature-id-collision-blocks-parallel-stacks
status: active
created_at: '2026-07-19T01:05:00-03:00'
updated_at: '2026-07-19T01:05:00-03:00'
tags: [governance, roadmap, merge, evolution, f-30, f-31, adr]
---

# Feature Id Collision Blocks Parallel Stacks

## Context

While Evolution loops (docs/core through capability marker) were stacked on
feature branches claiming **F-30** and **ADR-007**, `dev` merged Agent
Submission governance as **F-30** with **ADR-007**. Parallel open PRs and a
dirty orchestration worktree also treated F-30 as submission/orchestration.
Merging the Evolution tip without renumber would fight `GENERAL-ROADMAP.md`,
specs INDEX, decisions INDEX, and ADR-007 content.

## Lesson

Roadmap feature ids and ADR numbers are global scarce resources. Two parallel
product lanes must not invent the same F-id or ADR-id. When a lane is still
open on a stack, reserve the next free id on `dev` before the other lane lands,
or renumber the open stack before merge. Git `MERGEABLE` on a PR does not mean
governance canon is conflict-free.

## Prevention

- On `dev`, F-30 + ADR-007 = Agent Submission only.
- Evolution System must land as **F-31** with a new ADR (recommended ADR-008).
- Before opening a multi-PR stack, allocate the F-id and ADR on `dev` (even as
  `reserved`) so parallel agents cannot steal them.
- After merges that claim a new F-id, reindex Project RAG (`afol-dev`) and
  GitNexus so retrieval matches canon.
- Do not "fix" a collision by overwriting INDEX rows; renumber the late stack.
