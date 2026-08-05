---
doc_type: lesson_entry
id: lesson_20260802_project_finalization_requires_real_evidence_and_snapshot_approval
status: active
created_at: '2026-08-02T03:35:00Z'
source: user_correction
related_workstream_id: 260801_1641_project-finalization
---

# Lesson: Finalization Requires Real Evidence and Snapshot Approval

## Correction

Project finalization must not rely on placeholder commands such as `true` for
implementation proof. A passing current validation is also not permission to
bypass an external Project RAG snapshot gate when the inventory delta requires
review.

## Prevention Rule

- Use an observed command that exercises the claimed behavior before closing a
  task; append a later real pass when an earlier attempt used placeholder or
  failed evidence.
- Rebuild AFOL PSTR and local-state indexes after governance or workbench edits.
- Treat `REVIEW_REQUIRED` and `FAILED` Project RAG snapshots as explicit external
  blockers until the supported approval workflow is available.
- Run release provenance only on the exact final clean SHA.

## Guardrail

Never mark a feature final, claim RAG freshness, or claim release readiness from
synthetic evidence, a dirty checkout, or an unapproved snapshot mutation.
