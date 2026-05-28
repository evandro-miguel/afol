---
doc_type: spec
id: 260521_0100_runtime-adapters-and-mcp_spec_01
theme: runtime-adapters-and-mcp
status: draft
owners:
- orchestrator
created_at: '2026-05-21T01:40:00+08:00'
updated_at: '2026-05-21T01:40:00+08:00'
roadmap_feature: F-10
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli/mcp
  - .agents/runtime
  - AGENTS.md
  - runtime-adapters
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC: runtime-adapters-and-mcp

## 1) Feature Intent

Support multiple agent runtimes through thin adapters and MCP-facing tools.

CLI and MCP must call the same typed core wherever possible.

## 2) Problem

Different agents consume commands, tools, instructions, and file context
differently. If every runtime implements different behavior, the universal
agent layer fragments.

## 3) Shared Core Contract

The shared core owns:

```text
command parsing
project root detection
state loading
result envelopes
validation
rule and skill routing
file mutation journaling
update planning
event logging
```

Runtime adapters own only:

```text
transport mapping
runtime-specific tool registration
input normalization
output formatting constraints
health checks
```

Adapters must not duplicate business logic from the CLI.

## 4) Core Types

Initial shared types:

- `ExecutionContext`: project root, runtime id, adapter kind, session, task,
  dry-run, output mode, config snapshot, lock snapshot, freshness stamp.
- `ActionSpec`: canonical action id, CLI aliases, MCP tool name, input schema,
  side-effect class, and required guards.
- `ResultEnvelope`: status, compact text, JSON payload, touched paths,
  mutation id, next-step hint, and metrics.
- `PolicyEnvelope`: protected paths, write permission class, undo availability,
  stale-state rules, and benchmark-required flag.
- `AdapterBridge`: normalizes CLI argv and MCP JSON into the same internal
  request/result model.
- `EventRecord`: command/tool, latency, retries, token estimate, mutation ids,
  and validation outcome.

## 5) MCP Tool Parity Matrix

| MCP tool | CLI equivalent | Shared core contract |
| --- | --- | --- |
| `status` | `./a s` | project/session summary |
| `task_start` | `./a t s` | task state transition |
| `task_done` | `./a t d` | task closure with evidence |
| `evidence_add` | `./a e a` | evidence ledger append |
| `log_add` | `./a l a` | timeline/log append |
| `rule_get` | `./a r g` | rule routing result |
| `skill_get` | `./a sk g` | skill routing result |
| `research_save` | `./a q s` | sidecar save and handoff |
| `verify` | `./a v` | validation result |
| `close` | `./a c` | closure gate |
| `update_check` | `./a up ck` | update metadata read |
| `file_write` | `./a f w` | safe write mutation |
| `file_move` | `./a f mv` | safe move mutation |
| `file_patch` | `./a f pt` | safe patch mutation |
| `undo` | `./a u` | mutation rollback |

Parity means the same request yields the same semantic result envelope, even if
transport formatting differs.

## 6) Benchmark Scenarios

| Tool family | Scenario | Measure |
| --- | --- | --- |
| project detect/status | root, nested, invalid dir | latency, false positives |
| state/index | fresh vs stale index | accuracy, freshness |
| workbench lifecycle | new/start/done/log/evidence | transitions, evidence |
| file mutation/undo | dry-run, patch, move, undo | rollback, blocked paths |
| update flow | check, preview, conflicts | conflict detection |
| runtime adapter/MCP | same task per runtime | parity, retries, latency |

Use the controlled benchmark contract from the existing runtime-flow benchmark
family: fixed scope, expected tools, success criteria, model tier, and recorded
metrics.

## 7) Runtime Support

Primary runtimes:

- Codex.
- OpenCode.
- Claude Code.
- Gemini CLI.
- Qwen.

`AGENTS.md` remains the canonical instruction source. Runtime-specific files
stay thin, secret-free, and traceable.

## 8) Validation Gates

Every MCP tool needs:

- schema validation for request and response,
- parity test against CLI core for one positive path,
- negative-path test for invalid input,
- no-secret output test,
- transport smoke test when runtime support exists.

Risky adapter changes should run benchmark scenarios that measure tool-call
success rate, latency, retries, accuracy of selected tool, and context or prompt
bytes when available.

## 9) Scope

In scope:

- Adapter model.
- MCP tool names.
- Shared core contract.
- Runtime health checks.
- Minimal runtime docs.
- CLI/MCP parity tests.

Out of scope:

- Building a full agent runtime.
- Replacing existing agent CLIs.
- Cloud orchestration.
- Committing local credentials.

## 10) Acceptance

- Runtime adapters are thin.
- MCP tools map to CLI behavior through shared core.
- Agents can use MCP tools without reading full docs.
- Runtime-specific instructions do not drift from canonical behavior.
- CLI/MCP parity is covered by tests and selective benchmarks.
