---
doc_type: postmortem
id: 260323_2023_memory-provider-integration_postmortem_01
theme: memory-provider-integration
status: final
owners:
- orchestrator
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_2023_memory-provider-integration_plan_01
  task: 260323_2023_memory-provider-integration_task_01
  report: 260323_2023_memory-provider-integration_report_01
---

# Postmortem: memory-provider-integration

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Add a useful first-class external-memory integration path to the scaffold without introducing a second source of truth or runtime assumptions that the shell cannot satisfy.

## What Was Achieved
- Delivered an optional `memory` adapter with provider config, runtime-facing MCP contracts, docs, and tests.
- Preserved the canonical role of `.agents/wb/` and repo-local `knowledge`.
- Aligned runtime mirrors and operator docs with the new external-memory boundary.

## What Did Not Land
- No provider-specific execution bridge was added. The first version remains contract-only by design.

## Problems Encountered
- The initial design temptation was to make the shell command look like a real MCP executor.

## Root Causes
- Interactive agent runtimes expose MCP through the host, while scaffold scripts run locally in shell. Treating those as the same layer would have produced a misleading interface.

## Useful Discoveries
- `basic_memory` already gives the right read-first primitives for this scaffold: `search_notes`, `read_note`, `build_context`, and `recent_activity`.
- The scaffold's earlier F-09 work already established the key boundary: no second planning tree outside `.agents/wb/`.

## Follow-ups for Next Rounds
- Consider optional provider-specific bridges only if they can be executed truthfully and tested deterministically.
- Consider adding curated publish-back flows later for lessons/decisions, but keep write-paths separate from canonical workbench execution state.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
