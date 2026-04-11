---
id: lesson_20260411_1712_universal_skills_cache_must_not_be_nested_git
title: Universal skills cache must not be nested git
status: active
created_at: '2026-04-11T17:12:00-03:00'
updated_at: '2026-04-11T17:12:00-03:00'
owner: orchestrator
---

## Lesson: Universal Skills Cache Must Not Be Nested Git

Workbench context: `260411_1559_uv-fastapi-script-refactor`.

### What happened

- I treated `.agents/cache/universal-skills` as a publishable git checkout while working inside the scaffold repository.
- That path was a broken gitlink without `.gitmodules`, which made it easy to confuse scaffold state with the upstream universal-skills repository.

### Prevention Rule

- Never create, refresh, commit, or push a universal-skills git checkout under `.agents/cache/universal-skills`.
- Keep `.agents/source/universal-skills` as a repo-local seed only; if Git is needed, use an explicit external checkout through `AGENTS_UNIVERSAL_SKILLS_SOURCE` or `skills_sync.external_source_dir`.
- Keep `skills-sync push` disabled by default and publish through the upstream universal-skills repository's own tools.

### Guardrail

- `agents-skills-sync.py` no longer clones or falls back to `.agents/cache/universal-skills`.
- The scaffold blocks repo-local nested git sources for universal-skills and requires an external checkout for Git-backed refresh.
