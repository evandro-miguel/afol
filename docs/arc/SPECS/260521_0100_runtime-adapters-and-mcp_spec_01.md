---
doc_type: spec
id: 260521_0100_runtime-adapters-and-mcp_spec_01
theme: runtime-adapters-and-mcp
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:40:00+08:00'
updated_at: '2026-05-29T11:42:15-03:00'
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
| `status` | `afol s` | project/session summary |
| `task_start` | `afol t s` | task state transition |
| `task_done` | `afol t d` | task closure with evidence |
| `evidence_add` | `afol e a` | evidence ledger append |
| `log_add` | `afol l a` | timeline/log append |
| `rule_get` | `afol r g` | rule routing result |
| `skill_get` | `afol sk g` | skill routing result |
| `research_save` | `afol q s` | sidecar save and handoff |
| `verify` | `afol v` | validation result |
| `close` | `afol c` | closure gate |
| `update_check` | `afol up ck` | update metadata read |
| `file_write` | `afol f w` | safe write mutation |
| `file_move` | `afol f mv` | safe move mutation |
| `file_patch` | `afol f pt` | safe patch mutation |
| `undo` | `afol u` | mutation rollback |

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

For MVP, these runtimes are integration targets only; full native adapters,
runtime-live-agent transport, and broad cross-platform parity remain deferred
until release evidence is available.

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
- Full native MCP adapters, runtime-live-agent transport, and broad cross-platform runtime parity.
- Replacing existing agent CLIs.
- Cloud orchestration.
- Committing local credentials.

## 10) Acceptance

- Runtime adapters are thin.
- MCP tools map to CLI behavior through shared core.
- Agents can use MCP tools without reading full docs.
- Runtime-specific instructions do not drift from canonical behavior.
- CLI/MCP parity is covered by tests and selective benchmarks.

## 11) Closure

- Accepted implementation evidence: `E-20260528134556147936`.
- Closeout session: `.afol/wb/260528_1343_runtime-adapters-and-mcp/`.
- Status: final

## 12) Architecture Delta: Provider-Neutral Lifecycle Events

Follow-up delta captured on 2026-05-31: provider hooks are adapter triggers,
not a new core runtime. The core contract should accept lifecycle events
through one provider-neutral command shape:

```bash
afol lifecycle event --provider <provider-id> --event <event-name> --json <payload.json>
```

Initial lifecycle events:

- `session.start`
- `turn.start`
- `turn.end`
- `session.end`
- `compact.before`
- `compact.after`

Codex hooks are only one adapter path. A native Codex hook, a shell wrapper,
an MCP tool, or another provider-specific integration must all call the same
`afol lifecycle event` contract and receive the same typed result envelope.
Providers without native hook support can still participate through wrappers,
manual commands, or MCP-triggered event calls.

Lifecycle events may request read-only context lookup, append local event
metadata, or emit suggestion artifacts. They must not directly materialize new
skills, mutate governed workbench state, or write provider-specific runtime
state without an explicit apply command.

Payloads should default to redacted metadata and artifact references instead
of raw private prompts. Raw transcript ingestion is out of scope unless a
future spec adds an explicit opt-in privacy contract.

Pending follow-up:

- Define the typed `LifecycleEvent` and `LifecycleResult` schemas.
- Add a CLI command and adapter mapping for `afol lifecycle event`.
- Add at least one Codex hook adapter proof while keeping the provider-neutral
  command as the stable interface.
- Add parity tests that prove hook, wrapper, and MCP-triggered calls route
  through the same core behavior.

## 13) Hermes Benchmark Decisions

- Pattern: adapters and MCP tools are generated from the shared action
  contract, not hand-built runtime forks.
- Hermes source concept: tool specs, toolsets, and catalogs define the tool
  surface before transports expose it.
- Local decision: adapt `ActionSpec`, `ResultEnvelope`, and curated MCP catalog
  concepts; keep MCP/adapters deferred unless explicitly enabled and tested.
- Acceptance criteria: MCP tools map to CLI registry actions through shared
  core; adapter output uses `ResultEnvelope`; catalog entries are curated,
  late-bound, and disabled by default until parity tests exist.
- Non-goals: no raw CDP/browser control by default, no large gateway runtime,
  no progressive tool discovery before core CLI stability.
