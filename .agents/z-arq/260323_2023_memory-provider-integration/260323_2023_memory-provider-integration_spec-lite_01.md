---
doc_type: spec-lite
id: 260323_2023_memory-provider-integration_spec-lite_01
theme: memory-provider-integration
status: active
owners:
- orchestrator
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
spec_role: workstream
parent_spec: 260307_persistent-planning-memory_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_2023_memory-provider-integration_task_01
risk_level: low
---

# SPEC LITE: memory-provider-integration

## Intent
- Outcome: The scaffold exposes an optional `memory` command family that configures and governs external memory retrieval for interactive agent runtimes without replacing repo-local workbench authority.
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`

## Why Lite Is Enough
- This slice is localized to wrapper/config/docs/tests and does not redefine the parent feature philosophy.
- The parent spec already defines the critical boundary: no duplicate planning tree and no cloud-runtime dependency requirement.

## User or Operator Impact
- Primary affected user: interactive CLI agents and maintainers of bootstrapped repos
- Expected change in experience or behavior:
  - Agents can ask the scaffold how to query external memory in a governed, deterministic way.
  - Maintainers can configure memory as an auxiliary retrieval layer without weakening the canonical role of `.agents/wb/`.

## Boundaries
- In scope:
  - Optional memory config in `.agents/agents.config`
  - New `memory` command family for status and read-first MCP contracts
  - Tool catalog, Make targets, and runtime docs updates
  - Tests that prove command semantics and catalog visibility
- Out of scope:
  - Direct shell execution of MCP tool calls
  - Replacing `knowledge` or `wb`
  - Vault-writing automation or provider-specific publish workflows

## Risks
- Users assume `memory search` executes MCP directly -> Mitigation: make the contract-only behavior explicit in help text, docs, and command output.
- Downstream repos inherit memory config too aggressively -> Mitigation: keep the integration optional and auxiliary by design.

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
