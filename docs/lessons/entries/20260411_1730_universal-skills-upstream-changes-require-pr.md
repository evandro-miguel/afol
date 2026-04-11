---
id: lesson_20260411_1730_universal_skills_upstream_changes_require_pr
title: Universal skills upstream changes require PR
status: active
created_at: '2026-04-11T17:30:00-03:00'
updated_at: '2026-04-11T17:30:00-03:00'
owner: orchestrator
---

# Lesson: Universal Skills Upstream Changes Require PR

Workbench context: `260411_1559_uv-fastapi-script-refactor`.

## What happened

- I stopped the repo-local cache flow, but still left a controlled path that could write straight to the universal-skills base branch.
- That did not match the intended boundary: this scaffold should consume and sync skills, not overwrite universal `main`.

## Prevention Rule

- Never push project-local skill edits directly to universal-skills `main`.
- Use the scaffold to refresh local skills from the configured source.
- When a local skill change should go upstream, create a proposal branch in the external universal-skills checkout and open a PR.

## Guardrail

- `skills-sync push` now targets proposal branches only.
- The command refuses protected branch targets such as `main` and `master`.
- `--pr` pushes the proposal branch and invokes `gh pr create` instead of writing directly to the upstream base branch.
