---
doc_type: lesson_entry
id: lesson_20260404_0905_tmp_workspaces_must_be_lint_excluded
status: active
created_at: '2026-04-04T09:05:00-03:00'
updated_at: '2026-04-04T10:08:12-03:00'
source: user_correction
related_session: 260404_0854_artifact-manifest-readiness
---

# Lesson: Temporary Workspaces Must Never Count as Lint Debt

## Correction

Markdown lint was still scanning content under `.agents/tmp/` because the
configured exclusion prefix did not match the normalized relative path used by
the linter. Imported comparison repos and disposable workspace content then
showed up as false documentation warnings.

## Prevention Rule

Treat any repo-local `tmp` workspace as non-canonical by default.

- Always exclude `.agents/tmp/`, `.tmp/`, and repo-local `tmp/` paths from markdown lint.
- When implementing path-based exclusions, normalize both the candidate path and
  configured prefixes before comparing them.
- If a feature introduces disposable imported content, verify that lint still
  ignores it before treating warning counts as meaningful.

## Guardrail

- Keep the canonical lint exclusions in `.agents/agents.config`.
- Keep default fallbacks aligned in `.agents/scripts/lib/agents_config.py`.
- Cover the behavior with a deterministic test in
  `.agents/scripts/tests/test_agents_lint_noise_reduction.py`.
