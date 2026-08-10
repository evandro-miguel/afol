---
doc_type: lesson_entry
id: lesson_20260809_project_rag_only_semantic_route
status: active
created_at: '2026-08-09T20:57:00Z'
source: user_correction
related_workstream_id: 260809_2057_remove-gitnexus-use-project-rag
tags: [project-rag, semantic-discovery, agent-guidance]
---

# Lesson: Project RAG Is the Only Active Semantic Repository Route

## Correction

Active AFOL agent guidance must use the global `evandro-rag-system` skill and
`ragctl` Project RAG for semantic repository discovery. Do not require a
separate graph or semantic-discovery tool in current execution contracts.

## Guardrail

- Use `rg` or `fd` for exact paths and identifiers, then verify the registered
  Project RAG index before semantic retrieval.
- Search Project RAG with `ragctl`, and confirm any implementation claim with
  focused local source reads.
- Keep historical references intact, but remove superseded semantic-routing
  requirements from active repository and downstream-template instructions.
