---
doc_type: lesson_entry
id: lesson_20260803_dev_never_promotes_global_afol
status: active
created_at: '2026-08-03T18:20:06Z'
source: user_correction
related_workstream_id: 260803_1315_final-audit-remediation
---

# Lesson: Development Never Promotes the Global AFOL Binary

## Correction

The global AFOL binary is a release artifact from code already integrated into
`main`. A different binary hash or behavior while working on `dev` is expected
and must not be treated as development drift or repaired by installing from the
development worktree.

## Prevention Rule

- Use `bun run kernel`, `./afol`, or a repo-local build artifact for development
  validation.
- Never install, copy, replace, or promote `$HOME/.local/bin/afol` from `dev`, a
  feature branch, or an unmerged worktree.
- Promote globally only from `main` and only after an explicit user request.

## Guardrail

Repository validation on `dev` must remain repo-local. Global installation is a
separate post-merge operation and is never an implicit finalization step.
