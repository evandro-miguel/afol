---
doc_type: standard
id: readme
theme: skills
status: active
created_at: '2026-05-05T11:44:41+00:00'
updated_at: '2026-06-27T00:00:00Z'
---

# Skills System

Project-local skills live under `.agents/skills/**`. Downstream bootstrap should
export only skills that help agents operate AFOL governance without restoring
legacy command runtimes.

## Exported Skills

- `afol-maintenance`: weekly/monthly cleanup, review, warning, and workbench
  backlog cadence.
- `afol-memory`: memory freshness, cleanup, compaction, and relevance review.
- `afol-library`: library source freshness, claim validation, cleanup, and
  aggregation review.
- `afol-rules`: AFOL rule creation, update, pruning, and drift review.
- `ux-design`: user journey, state, recovery, microcopy, and UX validation
  guidance.

## Rules

- Keep provider-facing skills in `.agents/skills/**`.
- Do not create `.afol/skills/**`; `.afol/**` is mutable AFOL state.
- Do not document or restore retired `.agents` runtime commands.
- Review skill freshness during maintenance cadence before claiming a workflow
  is production-ready.
