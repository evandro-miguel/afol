# AFOL Maintenance

Use when work involves AFOL maintenance cadence, health warnings, weekly or
monthly reviews, workbench backlog, cleanup, rotation, roadmap/spec/manifest
freshness, or rule/skill pruning.

## First Moves

- Run `afol maintenance weekly --dry-run` for routine cleanup and archive
  candidates.
- Run `afol maintenance monthly --dry-run` for roadmap, spec, manifest, rule,
  skill, log, and long-retention checks.
- Run `afol health --json` or a narrow `afol health --area <area> --json` when
  a warning needs diagnosis.
- Use `afol session list` before proposing workbench archive or closure action.

## Required Warnings

- Weekly review must surface stale PSTR, stale indexes, old workbench sessions,
  and due maintenance areas including memory and library.
- Monthly review must surface log rotation, closed-session archive candidates,
  roadmap/spec/manifest alignment, and obsolete rule/skill review.
- If several workbench sessions are stale or open, tell the user to review,
  close, archive, and reflect durable decisions back into specs, roadmap, and
  manifest.

## Rules

- Maintenance commands are plan-first. Do not perform destructive cleanup
  unless the user explicitly approves the exact action.
- Keep warnings visible in final reports; do not bury them as incidental output.
- Use AFOL commands before raw file reads for supported health, maintenance,
  session, memory, and library checks.

## Validation

- `afol maintenance weekly --dry-run`
- `afol maintenance monthly --dry-run`
- `afol validate project --json`
