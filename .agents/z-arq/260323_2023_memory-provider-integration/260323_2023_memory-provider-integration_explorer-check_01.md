---
doc_type: explorer-check
id: 260323_2023_memory-provider-integration_explorer-check_01
theme: memory-provider-integration
status: active
owners:
- explorer
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_2023_memory-provider-integration_brainstorm_01
  plan: 260323_2023_memory-provider-integration_plan_01
---

# Explorer Check: memory-provider-integration

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/scripts/agents-knowledge.py`
  - `.agents/a-docs/standards/Makefile`
  - `README.md`
  - `AGENTS.md`
  - `.agents/wb/260307_1734_persistent-planning-memory/`
- Existing docs inspected:
  - `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md`
  - `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/AGENTS.md`
  - `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/docs/agent-memory-system/basic-memory-mcp-integration.md`
  - `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/anotacoes_ozy_d/Caos/AI_notes/2-Areas/02-systems/01-basic-memory/03-skills/Skill - Agent Memory Obsidian Ops.md`
- Existing scripts/tools checked:
  - `./.agents/agents knowledge pull memory`
  - Basic Memory MCP tool surface used in-session: `list_memory_projects`, `recent_activity`, `search_notes`, `read_note`, `build_context`, `search`

## Commands Used
```bash
./.agents/agents knowledge pull memory --limit=8 --snippets=2
sed -n '1,260p' .agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md
sed -n '1,260p' .agents/agents
sed -n '1,260p' .agents/agents.config
sed -n '1,260p' .agents/scripts/agents-knowledge.py
```

## Findings
- The scaffold already has a deliberate boundary against second-source planning memory; F-09 explicitly keeps `.agents/wb/` canonical.
- The current `knowledge` command is repo-local only and is the closest existing analogue to a read-first memory surface.
- The wrapper can easily add a new command family, but a shell script cannot honestly claim to execute MCP tool calls across runtimes.
- The correct first slice is a governed adapter that resolves config and prints exact MCP contracts for agents to execute through their host runtime.

## Contradictions or Drift Found
- No hard contradiction found.
- The new memory integration must be framed as auxiliary retrieval, otherwise it would drift against the existing persistent-planning-memory philosophy.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The implementation will focus on config + contracts + docs + tests, not direct MCP execution from shell.
  - The command family will be read-first (`status`, `search`, `context`, `recent`, `show`) and explicitly non-canonical.
- What remains uncertain:
  - Whether a later version should add optional CLI execution bridges for `agent-memory-ops` or another provider-specific runtime.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
