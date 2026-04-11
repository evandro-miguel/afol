---
doc_type: research
id: 260323_2023_memory-provider-integration_research_01
theme: memory-provider-integration
status: active
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_2023_memory-provider-integration_plan_01
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
---

# Research: memory-provider-integration

## Questions
- Which agent-memory surfaces are actually useful for this scaffold right now?
- How should external memory relate to repo-local `knowledge` and workbench governance?

## Findings
- The memory repo defines three layers: `agent-memory-native` for warm lookup, `agent-memory` for fuller operations, and upstream `basic-memory` for the original tool surface.
- In this environment, the directly available MCP surface is the `basic_memory` namespace, and it already exposes the retrieval tools this scaffold needs first: `search_notes`, `read_note`, `build_context`, and `recent_activity`.
- The memory skill explicitly warns not to use raw vault IO as the main integration path; governed routing and exact server/tool naming matter.
- The scaffold's own history around F-09 already rejects a duplicate planning tree. External memory should therefore be auxiliary retrieval and curated publish-back only.

## Sources
- `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | credibility: high | Governs the scaffold's canonical planning-memory boundary.
- `.agents/wb/260307_1734_persistent-planning-memory/260307_1734_persistent-planning-memory_brainstorm_01.md` | credibility: high | Confirms the repo intentionally avoided a second source of truth.
- `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/docs/agent-memory-system/basic-memory-mcp-integration.md` | credibility: high | Defines the memory-system architecture and the role of `basic-memory`.
- `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/anotacoes_ozy_d/Caos/AI_notes/2-Areas/02-systems/01-basic-memory/03-skills/Skill - Agent Memory Obsidian Ops.md` | credibility: high | Gives the runtime-facing decision rule for MCP vs CLI vs vault IO.

## Decision Impact
- Implement a `memory` adapter as governed config plus runtime contracts for MCP usage.
- Keep repo-local `knowledge` as the first stop for repo history, and use external memory as the second stop for cross-project context.

## Open Unknowns
- No blocker for the first read-only slice.

---
*Template: `.agents/a-docs/templates/research.md`*
