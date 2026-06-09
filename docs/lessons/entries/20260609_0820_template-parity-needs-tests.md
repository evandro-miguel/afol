---
doc_type: lesson_entry
id: 20260609_0820_template-parity-needs-tests
status: active
created_at: '2026-06-09T08:20:00-03:00'
updated_at: '2026-06-09T08:20:00-03:00'
tags: [template, testing, parity]
---

# Template Parity Must Be Test-Covered, Not Assumed

## Context

During F-05 review-fix session, live scaffold vs template mismatch was
discovered despite files being mirrored. The template had correct files but
behavioral parity was not verified by tests.

## Lesson

Template/live parity needs explicit tests, not just file mirroring. Having the
same files in both locations does not guarantee behavioral parity. Surface
parity drift is a recurring problem that affects CLI, docs, and template
exports.

## Prevention

- Add parity tests for every new template surface.
- Treat live-vs-template mismatches as a test gap, not a mirroring issue.
- Run `bun run validate:template` after template surface changes.
