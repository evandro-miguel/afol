---
doc_type: lesson_entry
id: lesson_20260806_project_rag_release_remediation
status: active
created_at: '2026-08-06T12:15:00Z'
source: user_correction
related_workstream_id: 260806_1158_release-promotion-remediation
---

# Lesson: Project RAG Is the Current Semantic Route for Release Remediation

## Correction

Release remediation must use verified Project RAG through
`evandro-rag-system` and `ragctl`, plus focused local source reads. A stale or
unavailable historical graph index is not a reason to substitute unbounded
exploration or to block unrelated local fixes.

## Guardrail

- Verify the registered Project RAG index with `ragctl` before semantic
  retrieval.
- Use Project RAG for orientation, then confirm implementation facts locally.
- Do not make historical GitNexus repair a release-gate prerequisite.

## Supersession

GitNexus references in the original incident are retained as history only. They
are not a current prerequisite, fallback, or repair target.
