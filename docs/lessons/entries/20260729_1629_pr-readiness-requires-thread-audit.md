---
doc_type: lesson_entry
id: lesson_20260729_1629_pr_readiness_requires_thread_audit
status: active
created_at: '2026-07-29T16:29:30-05:00'
updated_at: '2026-07-29T16:29:30-05:00'
source: user_correction
tags:
  - pull-requests
  - review
  - release-readiness
---

# Lesson: PR Readiness Requires a Thread Audit

## Correction

The user required checking every PR comment before merging. Aggregate review
status and local validation were insufficient because actionable inline review
comments still existed.

## Prevention Rule

- Inspect issue comments, submitted reviews, and inline review comments.
- Classify every actionable comment against the current head.
- Correct confirmed findings and add regression coverage.
- Obtain independent reviewer approval on the final commit before merge.
- Treat CI failures that never started separately from code failures.

## Guardrail

Before calling a PR ready, query both `gh pr view` and the pull-request review
comments API, then confirm the reviewed commit matches the merge head.
