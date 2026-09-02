---
name: afol-library
description: Use when reviewing AFOL Library knowledge notes, sourced claims, source freshness, claim validation, aliases, or library cleanup. Do not use for continuity memory or general documentation link checks.
metadata:
  category: knowledge
  tags: "afol, library, sourced-claims, knowledge-notes, source-freshness, claim-validation, cleanup"
  triggers: "AFOL library, knowledge note, sourced claim, source freshness, accessed_at, claim validation, library cleanup, broken source, duplicate alias"
  references: "health, maintenance, library, governance"
  version: "1.1.0"
  updated_at: "2026-08-10T00:00:00Z"
  target_provider: universal
  tier: 1
---

# AFOL Library

Use when work involves AFOL Library, sourced claims, knowledge notes, library
cleanup, source freshness, or claim validation.

## Required Order

1. Run `afol health --area library` before trusting library content. Add
   `--json` only when a machine-readable field is needed.
2. Run `afol mt review --area library --dry-run` before recording review
   freshness or proposing cleanup.
3. Prefer `afol lb ...` commands over direct `.afol/library/**` reads when the
   command answers the question.
4. Classify missing sources, stale `accessed_at`, unsupported claims, duplicate
   aliases, and broken links before proposing mutation. Do not skip health or
   dry-run checks under time pressure.

## Rules

- Never delete or archive library content automatically.
- Do not promote unsupported claims into specs, roadmap, or reports.
- Cleanup is staged: inspect, classify, propose, then mutate only with explicit
  approval for the exact targets.
- Record a completed review only after real inspection:
  `afol mt review --area library --note "<summary>"`.
- Keep repository specs, ADRs, roadmap, and observed evidence authoritative.
  Library notes support decisions; they do not override current canon.

## Validation

- `afol health --area library`
- `afol mt review --area library --dry-run`
