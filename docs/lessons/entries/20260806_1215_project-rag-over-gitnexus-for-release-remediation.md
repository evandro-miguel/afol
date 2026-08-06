---
doc_type: lesson_entry
id: lesson_20260806_project_rag_release_remediation
status: active
created_at: '2026-08-06T12:15:00Z'
source: user_correction
related_workstream_id: 260806_1158_release-promotion-remediation
---

# Lesson: Prefer Project RAG When GitNexus Is Unavailable

## Correction

Release remediation must use verified Project RAG plus focused local source
reads when GitNexus is stale or unavailable. A broken graph index is not a
reason to substitute unbounded exploration or to block unrelated local fixes.

## Guardrail

- Verify the registered project index before semantic retrieval.
- Use Project RAG for orientation, then confirm implementation facts locally.
- Keep GitNexus repair separate from the AFOL release gate unless the release
  contract explicitly depends on it.
