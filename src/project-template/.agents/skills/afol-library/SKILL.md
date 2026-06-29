# AFOL Library

Use when work involves AFOL Library, sourced claims, knowledge notes, library
cleanup, source freshness, or claim validation.

## First Moves

- Run `afol health --area library --json` before trusting library content.
- Run `afol maintenance review --area library --dry-run` when checking review
  cadence or weekly maintenance warnings.
- Prefer `afol lb ...` commands over direct `.afol/library/**` reads when the
  command answers the question.
- Treat missing sources, stale `accessed_at`, unsupported claims, duplicate
  aliases, and broken links as review warnings.

## Rules

- Never delete or archive library content automatically.
- Do not promote unsupported claims into specs, roadmap, or reports.
- Cleanup is staged: inspect, classify, propose, then mutate only with explicit
  approval.
- Record a completed review only after real inspection:
  `afol maintenance review --area library --note "<summary>"`.

## Validation

- `afol health --area library --json`
- `afol maintenance review --area library --dry-run`
