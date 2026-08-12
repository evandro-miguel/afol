---
doc_type: lesson_entry
id: 20260719_0105_feature-id-collision-blocks-parallel-stacks
status: superseded
superseded_by: ADR-007
created_at: '2026-07-19T01:05:00-03:00'
updated_at: '2026-07-31T00:00:00-03:00'
tags: [governance, roadmap, merge, evolution, f-30, f-31, adr, receipts]
---

# Feature Id Collision Blocks Parallel Stacks

## Context

The original entry recorded a collision between parallel Evolution and
submission/orchestration stacks. Its inverse allocation advice is no longer
the active contract, and its assignment/dispatch wording was retired by the
F-31 external-receipt decision.

## Corrected lesson

Roadmap feature ids and ADR numbers are global scarce resources. The current
canon is fixed: **F-30 + ADR-008 = AFOL Evolution** and **F-31 + ADR-007 =
External Receipts and Fixed Harness Tool Profiles**. Do not renumber Evolution,
reuse either pair for another product, or treat a harness receipt as an
assignment or model-orchestration authority.

## Prevention

- Allocate roadmap feature and ADR ids on `dev` before parallel implementation.
- Keep F-30/ADR-008 Evolution and F-31/ADR-007 external receipts/profiles
  separate in roadmap, spec, decision, and workbench bindings.
- External harnesses select/call/schedule/retry/supervise models; AFOL only
  validates their bounded receipts and fixed profile metadata.
- After a governance allocation changes, verify or reindex the registered
  Project RAG through `ragctl` so retrieval matches the current canon.
- GitNexus index maintenance is historical guidance and is superseded; current
  semantic retrieval follows `evandro-rag-system` and `ragctl` Project RAG.
- Do not resolve a collision by overwriting an index row; update the governing
  artifacts together and retain the historical entry as superseded.
