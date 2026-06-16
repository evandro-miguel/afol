---
doc_type: spec-test
id: 260521_0140_runtime-adapters-and-mcp-parity_spec-test_01
theme: runtime-adapters-and-mcp-parity
status: superseded
superseded_by: cli/tests/validation.test.ts (mcp-parity and runtime-live-agent packs)
closure_note: Frozen in legacy terms (afol t s, afol u undo, .agents/runtime, cli/mcp). Native MCP adapters remain deferred per F-12 addendum; harness parity is covered by the bench suite.
owners:
- tester
created_at: '2026-05-21T01:40:00+08:00'
updated_at: '2026-06-14T00:00:00-03:00'
roadmap_feature: F-10
parent_spec: 260521_0100_runtime-adapters-and-mcp_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - cli/mcp
  - .agents/runtime
  - AGENTS.md
risk_level: medium
---

# SPEC TEST: runtime-adapters-and-mcp-parity

## 1) Test Intent

Prove that MCP tools and runtime adapters stay thin and call the same semantic
core as the CLI.

## 2) Covered Journey

1. Agent calls an MCP tool such as `status`.
2. Adapter normalizes input and calls shared core.
3. Tool returns the same semantic result as the CLI command.
4. Runtime-specific formatting does not change business behavior.

## 3) Required Tool Parity Cases

| MCP tool | CLI command | Expected result |
| --- | --- | --- |
| `status` | `afol s` | same semantic status fields |
| `task_start` | `afol t s` | same task transition result |
| `task_done` | `afol t d` | evidence-required closure |
| `evidence_add` | `afol e a` | same evidence id/result |
| `log_add` | `afol l a` | same log append result |
| `rule_get` | `afol r g` | same routed rule ids |
| `skill_get` | `afol sk g` | same routed skill ids |
| `verify` | `afol v` | same validation result |
| `update_check` | `afol up ck` | read-only update summary |
| `file_patch` | `afol f pt` | same mutation journal record |
| `undo` | `afol u` | same undo result |

## 4) Parity Diff Contract

CLI and MCP must produce the same normalized envelope for deterministic
fixtures. The shared diff helper reports:

- missing semantic fields,
- extra semantic fields,
- mismatched values,
- ignored transport-only fields.

Ignored by default:

- timestamps,
- duration fields,
- runtime transport ids,
- ordering of unordered lists.

## 5) Metrics

- Parity: normalized envelope equality for deterministic fixtures.
- Safety: mutation tools create journal records and block protected paths.
- Quality: invalid MCP input returns typed errors, not transport crashes.
- Speed: local MCP parity fixtures stay within local integration-test budget.

## 6) Side-Effect Oracle

Mutating MCP tools must assert:

- allowed fs diff only,
- journal record count matches accepted mutations,
- protected path attempts are blocked,
- undo restores supported fixture changes,
- invalid input writes zero files.

## 7) Recommended Technology

- Shared-core unit tests.
- CLI/MCP fixture parity tests.
- MCP transport smoke tests.
- No-secret output checks.
