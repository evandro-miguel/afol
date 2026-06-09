---
doc_type: lesson_entry
id: 20260609_0810_duplicate-session-reconciliation
status: active
created_at: '2026-06-09T08:10:00-03:00'
updated_at: '2026-06-09T08:10:00-03:00'
tags: [workbench, governance, sessions]
---

# Duplicate Governed Sessions Must Reconcile to Canonical Closeout

## Context

Sessions 260528_1251 and 260528_1255 (template-update-and-versioning) were
stale duplicates of the F-09 closeout, both with in-progress state and evidence
pointing nowhere local. The total-reformulation-finalization session also had
to reconcile these duplicates.

## Lesson

Duplicate governed sessions should be reconciled to the accepted canonical
closeout evidence, not left open as active work. Stale duplicate sessions with
in-progress state create confusion and false verification failures.

## Prevention

- When duplicate sessions are detected, point the evidence ledger at the
  canonical closeout instead of inventing local history.
- Do not preserve stale duplicate sessions as active work.
- Finalization must explicitly classify "real product gap" vs "governance drift".
