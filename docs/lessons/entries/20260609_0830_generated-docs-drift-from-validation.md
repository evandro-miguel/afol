---
doc_type: lesson_entry
id: 20260609_0830_generated-docs-drift-from-validation
status: active
created_at: '2026-06-09T08:30:00-03:00'
updated_at: '2026-06-09T08:30:00-03:00'
tags: [validation, docs, drift]
---

# Validation Runs Can Create Docs/Map Drift

## Context

During merge-pr20-pr24 and multiple other sessions, running validation or
`make all` produced generated map/index/docs deltas that needed explicit review
and sometimes reversion. These deltas were not intentional changes.

## Lesson

Generated validation artifacts (maps, indexes, structure docs) can drift from
the intended state when validation runs execute generators. These deltas must
be reviewed and reverted unless intentionally changed.

## Prevention

- Review generated map/index/docs deltas before final closeout.
- Treat unexpected generated diffs as validation artifacts, not product changes.
- Revert unintended generated docs drift before commit.
