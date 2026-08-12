---
name: afol-memory
description: Use when reviewing AFOL Memory continuity notes, freshness, conflicts, consolidation, retention, or cleanup. Do not use for sourced library claims or broad maintenance sweeps.
metadata:
  category: knowledge
  tags: "afol, memory, continuity, freshness, consolidation, retention, cleanup"
  triggers: "AFOL memory, continuity note, stale memory, conflicting memory, memory cleanup, memory consolidation, retention review"
  references: "health, maintenance, memory, repository-canon"
  version: "1.1.0"
  updated_at: "2026-08-10T00:00:00Z"
  target_provider: universal
  tier: 1
---

# AFOL Memory

Use when work involves AFOL Memory, continuity notes, stale memories, memory
cleanup, consolidation, or retention review.

## Required Order

1. Run `afol health --area memory` before trusting memory state. Add `--json`
   only when a machine-readable field is needed.
2. Run `afol mt review --area memory --dry-run` before recording review
   freshness or proposing consolidation.
3. Prefer `afol mm ...` commands over direct `.afol/memory/**` reads when the
   command answers the question.
4. Classify useful, stale, duplicate, and conflicting entries before proposing
   any mutation. Do not skip health or dry-run checks under time pressure.

## Rules

- Never delete, archive, or rewrite memory automatically.
- Consolidation is review-first: identify useful, stale, duplicate, and
  conflicting entries, then ask for explicit approval for the exact mutation.
- Record a completed review only after real inspection:
  `afol mt review --area memory --note "<summary>"`.
- Summaries must preserve exact references, dates, and decision owners.
- Current repository canon and observed evidence outrank memory. Use stale or
  conflicting memory only as historical context or a verification lead.

## Validation

- `afol health --area memory`
- `afol mt review --area memory --dry-run`
