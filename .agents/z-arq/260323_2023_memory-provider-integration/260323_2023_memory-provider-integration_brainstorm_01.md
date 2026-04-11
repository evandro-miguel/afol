---
doc_type: brainstorm
id: 260323_2023_memory-provider-integration_brainstorm_01
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

# Brainstorm: memory-provider-integration

## Problem Statement
- The scaffold has strong repo-local workbench and knowledge flows, but no governed adapter for external memory retrieval.
- Interactive agents can use MCP memory tools, yet the scaffold does not tell them when to use memory, how to address the provider, or how to keep memory auxiliary instead of canonical.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/scripts/agents-knowledge.py`
  - `.agents/a-docs/standards/Makefile`
  - `README.md`
  - `AGENTS.md`
- Existing patterns or constraints to confirm:
  - `.agents/wb/` must remain canonical.
  - `knowledge` already covers repo-local reusable findings.
  - This scaffold is CLI-interactive-first, not an embedded SDK runtime.

## Assumptions
- The scaffold cannot directly execute MCP tool calls from shell scripts in a runtime-agnostic way.
- A useful first integration can still exist by governing provider config and emitting deterministic MCP call contracts for agents.

## Options
1. Option A - Keep memory as documentation only, with no scaffold command surface.
2. Option B - Add a read-first `memory` command family that emits exact MCP usage contracts and config/status for agents.
3. Option C - Build a local shell bridge that claims to execute memory queries directly.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Lowest implementation cost | Leaves integration implicit and inconsistent across runtimes | Medium | Low |
| B | Truthful to runtime limits, useful in CLI workflows, preserves canonical boundaries | Does not execute MCP calls itself | Low | Medium |
| C | Looks powerful on paper | Misleading across runtimes, fragile, likely to drift from actual MCP host behavior | High | High |

## Preferred Direction
- Selected: Option B
- Why: It gives the scaffold a real integration layer without pretending the shell can call MCP directly. Agents get exact server/tool contracts, config, and workflow guidance while `wb` and `knowledge` remain the source of truth.
- Rejected options:
  - Option A -> too weak to change behavior.
  - Option C -> violates the interactive-runtime reality of this scaffold.

## Decision Criteria
- No second source of truth for plans, tasks, or reports.
- The integration must stay useful in Codex/OpenCode/Gemini/Claude-style CLI runtimes.
- The first version must be deterministic, documented, and testable without requiring a live MCP bridge in CI.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Where the new command surface belongs in wrapper, catalog, and Make targets.
  - Which existing docs already define the repo-local memory boundary.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge pull memory`
  - `.agents/wb/260307_1734_persistent-planning-memory/*`
  - Agent Memory MCP docs in `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/`

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
