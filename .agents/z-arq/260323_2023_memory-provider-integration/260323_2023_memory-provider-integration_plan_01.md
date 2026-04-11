---
doc_type: plan
id: 260323_2023_memory-provider-integration_plan_01
theme: memory-provider-integration
status: final
owners:
- orchestrator
created_at: 2026-03-23 20:23:41-03:00
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: null
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_2023_memory-provider-integration_brainstorm_01
  explorer_check: 260323_2023_memory-provider-integration_explorer-check_01
  research: 260323_2023_memory-provider-integration_research_01
  task: 260323_2023_memory-provider-integration_task_01
repo: agentic_start_folder
branch: main
---

# Plan: memory-provider-integration

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Add a first-class, optional memory adapter to the scaffold so interactive agents can retrieve cross-project context through a governed external-memory workflow.
- After implementation, an operator should be able to run `.agents/agents memory status|search|context|recent|show` and get deterministic provider-aware contracts that tell a runtime exactly how to use the configured memory MCP without confusing that memory with canonical repo state.

## Progress
- [x] 2026-03-23 23:23Z - Reviewed F-09, the repo's prior persistent-memory artifacts, and the external Agent Memory MCP docs/skill.
- [x] 2026-03-23 23:34Z - Implemented `agents-memory.py`, wrapper wiring, and default memory config.
- [x] 2026-03-23 23:40Z - Updated tool catalog, Make targets, README, AGENTS, and standards docs.
- [x] 2026-03-23 23:48Z - Added tests, synced runtime mirrors, and ran validation through `make all`.

## Surprises & Discoveries
- Observation: The biggest constraint is architectural, not coding effort: the scaffold cannot directly execute MCP tool calls from shell in a runtime-neutral way.
  Evidence: Current wrapper/scripts only dispatch local Python tools; MCP access exists through the interactive host, not the shell.

## Decision Log
- Decision: Implement memory integration as a contract-emitting adapter instead of a fake shell-side MCP executor.
  Rationale: This stays truthful to the interactive-runtime model while still giving agents exact server/tool/query guidance.
  Date/Author: 2026-03-23 / orchestrator

## Outcomes & Retrospective
- Outcome: The scaffold now ships an optional `memory` adapter that makes external-memory usage explicit, provider-aware, and compatible with interactive CLI runtimes.
- Remaining: Future work may add provider-specific execution bridges, but the first governed contract layer is complete.
- Lesson: When integrating external memory into a CLI-interactive scaffold, govern the runtime contract instead of pretending shell tools can invoke host MCPs directly.

## Governance Context
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_2023_memory-provider-integration_brainstorm_01`
- Explorer check artifact: `260323_2023_memory-provider-integration_explorer-check_01`
- Research artifact: `260323_2023_memory-provider-integration_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull memory --limit=8 --snippets=2`
  - External memory docs and skill reviewed from `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/`

## Context and Orientation
- This scaffold already has two durable repo-local memory surfaces:
  - workbench artifacts in `.agents/wb/` for canonical execution state
  - reusable `knowledge` in `.agents/a-docs/knowledge/` sourced from workbench artifacts
- It does not yet have a governed adapter for external memory providers such as `basic_memory`.
- In this plan, "memory adapter" means a local command family that resolves provider config and emits exact MCP contracts for interactive agents. It does not mean direct MCP execution from shell.
- Key files:
  - `.agents/agents` wrapper dispatch
  - `.agents/agents.config` config surface
  - `.agents/scripts/agents-knowledge.py` closest existing analogue
  - `.agents/tools.json` tool catalog
  - `.agents/a-docs/standards/Makefile` operator commands
  - `README.md` and `AGENTS.md` runtime/operator guidance

## Scope
- In scope:
  - Add `agents-memory.py` with read-first subcommands
  - Wire `memory` into wrapper, Make, and `tools.json`
  - Document the boundary between `knowledge`, `memory`, and `wb`
  - Add tests for config semantics and command output
- Out of scope:
  - Executing MCP tool calls from shell
  - Replacing `knowledge` search or workbench docs
  - Vault-writing or proposal-ingest flows

## Plan of Work
- First, add a small Python command module at `.agents/scripts/agents-memory.py` that loads config and prints deterministic MCP contracts for `status`, `search`, `context`, `recent`, and `show`.
- Then wire the command into `.agents/agents`, `.agents/tools.json`, and `.agents/a-docs/standards/Makefile`.
- Next, update `AGENTS.md`, `README.md`, and the standards docs so maintainers understand the non-canonical role of external memory and the intended `knowledge -> memory -> repo reread` order.
- Finally, add focused unit tests and run the existing validation commands that cover scripts, docs, and the tools catalog.

## Concrete Steps
1. Edit `.agents/agents.config` and `.agents/scripts/lib/agents_config.py` to define the optional memory config surface.
2. Add `.agents/scripts/agents-memory.py` and map `memory` in `.agents/agents`.
3. Update `.agents/tools.json`, `.agents/a-docs/standards/Makefile`, `README.md`, `AGENTS.md`, `.agents/a-docs/standards/agents-usage.md`, and `.agents/a-docs/standards/scripts-usage.md`.
4. Add tests in `.agents/scripts/tests/`.
5. Run lint, tests, sync, and report evidence into the active session.

## Interfaces and Dependencies
- Tools:
  - `.agents/agents knowledge`
  - `.agents/agents sync`
  - `.agents/agents tools`
- MCPs:
  - `basic_memory` tool surface for design grounding
- Skills:
  - `agent-memory-obsidian-ops`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-memory.py`
  - `.agents/agents` command map entry for `memory`
  - `.agents/agents.config` memory config block
  - `.agents/tools.json` catalog entry for `memory`

## Risks and Mitigations
- Risk: operators misread "memory search" as a live query -> Mitigation: explicit contract-only wording in help, docs, and output.
- Risk: the new feature overlaps confusingly with `knowledge` -> Mitigation: document the boundary and preferred order of use in AGENTS and README.

## Validation and Acceptance
- Unit: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_memory.py -q`
- E2E: `./.agents/agents memory status` and representative `memory search/context` invocations
- Typecheck: N/A
- Lint: `make lint` and `make lint-scripts`
- Behavioral acceptance:
  - `memory status` shows provider/config/boundary clearly.
  - `memory search` and `memory context` emit exact MCP contracts with project/provider details.
  - `AGENTS.md` and README describe memory as auxiliary, not canonical.

## Idempotence and Recovery
- All command and doc generation steps are safe to re-run.
- If doc sync drifts after `AGENTS.md` changes, rerun `./.agents/agents sync --force`.
- If validation fails, fix the targeted file and rerun the smallest failing command before rerunning `make all`.

## Artifacts and Notes
- External memory-system references:
  - `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/docs/agent-memory-system/basic-memory-mcp-integration.md`
  - `/mnt/c/Users/evand/02_obsidian/AI_notes_agent_memory_test/anotacoes_ozy_d/Caos/AI_notes/2-Areas/02-systems/01-basic-memory/03-skills/Skill - Agent Memory Obsidian Ops.md`

## Completion Gate
- [ ] Brainstorm exists and reflects real option analysis
- [ ] Explorer check proves current-project inspection happened
- [ ] Relevant prior knowledge was searched or explicitly ruled out
- [ ] The ExecPlan remains self-contained enough for a new contributor to resume
- [ ] Progress entries reflect the actual current state
- [ ] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
