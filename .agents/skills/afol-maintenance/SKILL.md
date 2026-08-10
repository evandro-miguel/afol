---
name: afol-maintenance
description: Use when running AFOL weekly or monthly maintenance, health backlog review, session cleanup planning, rotation, roadmap/spec/manifest freshness, or rule and skill pruning. Do not use for one narrow memory or library review.
metadata:
  category: operations
  tags: "afol, maintenance, health, weekly, monthly, workbench, cleanup, rotation, roadmap, specs, skills"
  triggers: "AFOL maintenance, weekly review, monthly review, health backlog, stale session, archive candidate, log rotation, rule pruning, skill pruning, maintenance review"
  references: "health, maintenance, sessions, roadmap, specs, rules, skills"
  version: "1.1.0"
  updated_at: "2026-08-10T00:00:00Z"
  target_provider: universal
  tier: 1
---

# AFOL Maintenance

Use when work involves AFOL maintenance cadence, health warnings, weekly or
monthly reviews, workbench backlog, cleanup, rotation, roadmap/spec/manifest
freshness, or rule/skill pruning.

## First Moves

- Run `afol mt weekly --dry-run` for routine cleanup and archive
  candidates.
- Run `afol mt monthly --dry-run` for roadmap, spec, manifest, rule,
  skill, log, and long-retention checks.
- Run `afol mt review --area <area> --dry-run` for overdue rules, skills, docs,
  commands, memory, library, or organization review.
- Run `afol health` or a narrow `afol health --area <area>` when a warning
  needs diagnosis; request JSON only for machine parsing.
- Use `afol ss list` before proposing workbench archive or closure action.

## Required Warnings

- Weekly review must surface stale PSTR, stale indexes, old workbench sessions,
  and due maintenance areas including memory and library.
- Monthly review must surface log rotation, closed-session archive candidates,
  roadmap/spec/manifest alignment, and obsolete rule/skill review.
- If several workbench sessions are stale or open, tell the user to review,
  close, archive, and reflect durable decisions back into specs, roadmap, and
  manifest.

## Rules

- Maintenance commands are plan-first. Always run the applicable `--dry-run`
  and inspect its exact candidates before any cleanup mutation.
- Authorization to use tools is not approval to archive, delete, close, rotate,
  or prune. Require separate user approval for the exact targets and action.
- Keep warnings visible in final reports; do not bury them as incidental output.
- Hygiene warnings, due reviews, and open `pending_spec` sessions do not stop an
  active feature lifecycle. Hard lifecycle failures remain blocking.
- Use AFOL commands before raw file reads for supported health, maintenance,
  session, memory, and library checks.

## Validation

- `afol mt weekly --dry-run`
- `afol mt monthly --dry-run`
- `afol mt review --area skills --dry-run`
- `afol v project`
