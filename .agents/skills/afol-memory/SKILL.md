---
name: afol-memory
description: Use when work involves AFOL Memory, continuity notes, stale memories, memory cleanup, consolidation, or retention review.
---

# AFOL Memory

Use when work involves AFOL Memory, continuity notes, stale memories, memory
cleanup, consolidation, or retention review.

## First Moves

- Run `afol health --area memory --json` before trusting memory state.
- Run `afol maintenance review --area memory --dry-run` when checking review
  cadence or weekly maintenance warnings.
- Prefer `afol mm ...` commands over direct `.afol/memory/**` reads when the
  command answers the question.
- If memory is stale, oversized, duplicated, or suspect, tell the user which
  review is needed before using it as current truth.

## Rules

- Never delete, archive, or rewrite memory automatically.
- Consolidation is review-first: identify useful, stale, duplicate, and
  conflicting entries, then ask for explicit approval before mutation.
- Record a completed review only after real inspection:
  `afol maintenance review --area memory --note "<summary>"`.
- Summaries must preserve exact references, dates, and decision owners.

## Validation

- `afol health --area memory --json`
- `afol maintenance review --area memory --dry-run`
