---
doc_type: spec
id: 260411_agentic-runtime-restructure_spec_01
theme: agentic-runtime-restructure
status: final
owners:
- orchestrator
created_at: '2026-04-11T22:13:21-03:00'
updated_at: '2026-05-29T09:41:20-03:00'
roadmap_feature: F-13
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_plan_01.md
  task: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_task_01.md
  report: .afol/wb/260529_0939_f13-runtime-native-port-closeout/260529_0939_f13-runtime-native-port-closeout_report_01.md
scope:
  repo_areas:
  - .agents/runtime
  - .agents/scripts
  - .agents/agents
  - .afol/adm/tools.json
  - .agents/skills
  - docs
  - .github/workflows
  packages:
  - agentic-runtime
  - agentic-scaffold-mcp
risk_level: high
---

# SPEC: agentic-runtime-restructure

## 1) Feature Intent

- Outcome: the scaffold becomes a coherent agentic runtime with one shared service layer for CLI operations, MCP-native tool access, validation, reversible changes, documentation discovery, and governance-aware workflow execution.
- Why now: the current system is powerful, but its implementation is split across standalone Python scripts, a Bash command map, manual tool metadata, docs, skills, and map artifacts that can drift independently.
- Roadmap feature: `F-13`
- Role of this spec: parent

## 2) Problem

- Agents and operators currently discover behavior through long docs, `.afol/adm/tools.json`, wrapper help text, and many separate scripts.
- Repeated operations such as workspace inspection, search, validation, safe archiving, text writes, patching, and undo are not exposed through a first-class MCP surface.
- The script layer is difficult to refactor because public command behavior is coupled to standalone files rather than a shared runtime registry and service model.
- Documentation, tool catalog entries, current-state maps, and verification gates can describe different realities.

## 3) Users and User Journey

Primary users:

- operators running interactive CLI agents in this scaffold
- maintainers evolving the scaffold for downstream repositories
- agents that need safe tools/resources instead of broad filesystem reads

User journey:

1. An operator invokes `.agents/agents <command>` exactly as before.
2. The wrapper delegates to the shared runtime package.
3. The runtime resolves config, command metadata, workbench context, safety policy, and telemetry consistently.
4. Agents can also use the MCP adapter for discovery, validation, safe mutation, and undo without bypassing the same service layer.
5. Verification proves CLI parity, MCP behavior, docs currency, and workbench traceability before legacy surfaces are archived.

Failure or friction points:

- Command parity breaks -> keep compatibility tests before archiving legacy scripts.
- MCP mutating tools create unreviewed drift -> journal every mutation and block unsafe paths.
- Docs drift from code -> generate or validate tool metadata and maps from the runtime registry.

## 4) Experience and Behavior

- Expected behavior:
  - `.agents/agents` remains the stable public entrypoint.
  - `.agents/agents-mcp` remains a thin convenience wrapper for MCP-oriented usage.
  - A UV-managed package under `.agents/runtime/` owns runtime logic.
  - MCP tools/resources/prompts are available from the same runtime services as the CLI.
  - `just all` and CI validate the runtime, MCP surface, docs, and tool catalog.
- Boundaries:
  - The restructure does not create a public long-lived backend service.
  - FastAPI/OpenAPI is not required for this feature; MCP is the agent-native interface.
  - Workbench, roadmap, specs, `.afol/adm`, and `.afol/pstr` boundaries remain authoritative.

## 5) Scope

In scope:

- `.agents/runtime/` UV package and source tree
- CLI adapter and compatibility wrapper
- MCP adapter with tools, resources, prompt, journaling, archive, write, patch, and undo support
- command registry and tool catalog generation/validation
- docs, skills, maps, Make targets, and CI updates
- staged migration or compatibility wrapping for all existing `.agents/agents` commands
- safe archive of superseded standalone script surfaces after parity is proven

Out of scope:

- a public HTTP API server
- replacing roadmap/spec/workbench governance
- committing runtime caches, virtualenvs, telemetry events, or workbench noise
- deleting legacy scripts before parity evidence exists

## 6) Child Spec Strategy

- Child specs required: no for the first governed restructuring workstream.
- Decomposition rule:
  - split into child specs only if CLI parity, MCP surface, or documentation generation becomes too large for one traceable workstream.
- Planned child specs:
  - none initially

## 7) Constraints and Assumptions

- Assumptions:
  - The scaffold remains optimized for terminal-first interactive runtimes such as Codex CLI, OpenCode, Qwen, Gemini CLI, and Claude Code.
  - MCP is the right first agent-native interface because it models tools/resources/prompts directly.
  - Existing command semantics are the compatibility contract.
- Constraints:
  - Compatibility: preserve `.agents/agents <command>` behavior.
  - Safety: archive rather than delete; journal mutating runtime operations.
  - Dependency hygiene: regenerate lockfiles without private registry URLs.
  - Documentation: keep goal-state docs under `.afol/adm/` and current-state maps under `.afol/pstr/`.

## 8) Acceptance

- Success looks like:
  - `./.agents/agents help` and representative existing commands work through the new runtime.
  - MCP client tests list and call the expected tools/resources/prompts.
  - The tool catalog and docs are aligned with the runtime registry.
  - `just all` passes with runtime tests included.
  - The workbench report records verification evidence and a postmortem captures lessons.
- Review questions:
  - Did the runtime become the source of operational behavior rather than another parallel layer?
  - Are legacy script surfaces still available or archived only after parity was proven?
  - Can an agent safely inspect, search, validate, mutate, and undo through MCP without broad filesystem guesswork?

## 9) Closure

- Accepted implementation evidence:
  - `c24d386` - tool catalog parity.
  - `3e27bac` - status native port.
  - `b22d45f` and `e9a0f44` - knowledge pull native port.
  - `8cd4737` - session catchup native port.
  - `bde5500`, `e918255`, and `7c98199` - knowledge list/search/show native port.
  - `8bd9466` - knowledge index native port.
- Closeout session: `.afol/wb/260529_0939_f13-runtime-native-port-closeout/`
- Status: final
