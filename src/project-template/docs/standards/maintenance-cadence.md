---
doc_type: standard
id: maintenance-cadence
status: active
created_at: '2026-06-27T00:00:00Z'
updated_at: '2026-06-27T00:00:00Z'
title: Maintenance Cadence Standard
---

# Maintenance Cadence Standard

AFOL agents must keep maintenance visible as a normal operating habit. Routine
cleanup, archive, review, and rotation warnings should appear before project
state becomes stale or misleading.

## Weekly Cadence

Command:

```bash
afol maintenance weekly --dry-run
```

Expected behavior:

- Report stale PSTR and stale index candidates.
- Report old or accumulated workbench sessions that need review or archive.
- Report due maintenance areas, including `memory` and `library`.
- Avoid destructive cleanup; dry-run output is advisory.

## Monthly Cadence

Command:

```bash
afol maintenance monthly --dry-run
```

Expected behavior:

- Report log rotation and closed-session archive candidates.
- Report roadmap, spec, and manifest alignment review.
- Report obsolete rule and skill review.
- Recheck stale indexes and durable state freshness.

## Memory And Library Reviews

Use AFOL commands before raw file reads:

```bash
afol health --area memory --json
afol maintenance review --area memory --dry-run
afol health --area library --json
afol maintenance review --area library --dry-run
```

Memory review should identify old `updated_at`, oversized memory, duplicate or
unsupported active memories, and proposals without origin.

Library review should identify stale docs, invalidated or unsupported claims,
broken wikilinks, duplicate aliases, missing `accessed_at`, invalid tags, and
oversized docs without summaries.

## Workbench Backlog

Use `afol session list` and the weekly dry-run before proposing workbench
cleanup. Agents may recommend closing, archiving, or summarizing old sessions,
but must not delete, archive, or rewrite workbench content without explicit user
approval.

Durable decisions from old sessions should be reflected back into roadmap,
specs, manifest, rules, or skills instead of staying only in execution history.

## Benchmark Coverage

The live-agent benchmark catalog must include a maintenance cadence scenario
that exercises:

- `afol maintenance weekly --dry-run`
- `afol maintenance monthly --dry-run`
- `afol maintenance review --area memory --dry-run`
- `afol maintenance review --area library --dry-run`

The scenario should reject direct reads of `.afol/memory`, `.afol/library`,
`.afol/wb`, or `.afol/adm` when AFOL commands answer the task.

---

*Standard: `docs/standards/maintenance-cadence.md`*
