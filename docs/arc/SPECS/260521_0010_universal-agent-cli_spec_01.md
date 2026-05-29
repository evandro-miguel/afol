---
doc_type: spec
id: 260521_0010_universal-agent-cli_spec_01
theme: universal-agent-cli
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:10:00+08:00'
updated_at: '2026-05-29T14:10:48-03:00'
roadmap_feature: F-01
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - src/project-template
  - packages
  - cli
  - .agents
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: universal-agent-cli

## 1) Feature Intent

Build a universal Bun/TypeScript CLI that agents call from any governed project
through the local wrapper `./a`.

The CLI owns behavior. The project owns state.

## 2) Problem

If full implementation code is copied into every downstream project, the agent
system fragments. Each project drifts, update paths become unsafe, and agents
lose the shared operating layer this project is meant to provide.

The current Python, Bash, uv, Just, and Markdown runtime remains the
compatibility contract until Bun/TypeScript parity is proven by tests.

## 3) Kernel Contract

The first CLI kernel must be small and typed.

Required kernel boundaries:

- `./a` is the stable local entrypoint.
- Bun/TypeScript owns the command router, schemas, output envelope, and project
  loader.
- The legacy `.agents/agents` command remains the fallback for commands that do
  not have TypeScript parity yet.
- The CLI must refuse unsafe or ambiguous roots before reading or mutating local
  state.
- Compact text output is default; JSON is opt-in with `-j`.
- Every command returns a typed result envelope before formatting.

## 4) Versioned Project State

Schema ownership is centralized in the CLI core package.

Initial models:

```text
ProjectStateV1
ProjectConfigV1
ProjectLockV1
ProjectManifestV1
CommandRequestV1
CommandResultV1
CommandErrorV1
DelegationResultV1
```

Authoritative local files:

```text
.agents/config.json
.agents/lock.json
.agents/manifest.json
.agents/wb/
.agents/rules/
.agents/skills/
.agents/data/
```

Loader precedence:

1. Find project root from the current directory upward.
2. Require `.agents/config.json` and `.agents/lock.json`.
3. Load `.agents/manifest.json` when a command needs managed-file knowledge.
4. Lazy-load workbench, rules, skills, and indexes only when the command needs
   them.
5. Rebuild or mark stale indexes before trusting indexed state.

## 5) Failure Semantics

Errors must be stable and actionable.

| Condition | Exit | Default output |
| --- | ---: | --- |
| outside project | `2` | `err invalid-root hint="run inside project or init"` |
| missing config | `2` | `err missing-config path=.agents/config.json` |
| missing lock | `2` | `err missing-lock path=.agents/lock.json` |
| invalid JSON | `2` | `err invalid-json path=<path>` |
| unsupported command | `2` | `err unsupported-command hint="run ./a -h"` |
| delegated failure | legacy exit | legacy-compatible failure summary |
| validation failure | `1` | command-specific failure summary |

JSON mode must return the same semantic data as compact mode.

## 6) Compatibility Delegation

Delegation is explicit and temporary.

| Family | MVP behavior | Stop condition |
| --- | --- | --- |
| `s/status` | TS or delegated status | semantic parity tests pass |
| `-h/help` | TypeScript help | alias snapshot tests pass |
| `n/new` | delegate until workbench kernel lands | fixture parity tests pass |
| `t/task` | delegate until task model lands | state transition tests pass |
| `e/evidence` | delegate until evidence model lands | ledger tests pass |
| `l/log` | delegate until log model lands | log append tests pass |
| `v/verify` | delegate until validator lands | strict parity passes |
| `c/close` | delegate until closure model lands | closure parity passes |
| `r/rule` | delegate or route by TS router | routing tests pass |
| `sk/skill` | delegate until skill index lands | skill tests pass |
| `up/update` | delegated or dry-run only in MVP | conflict tests pass |

Delegation parity requires stdout, stderr, exit code, and normalized semantic
fields to match the legacy command for the covered fixture.

## 7) Scope

In scope:

- CLI skeleton.
- Typed schemas.
- Project root detection.
- Config, lock, and manifest loading.
- Alias router.
- Compact and JSON output.
- Error model.
- Compatibility delegation.
- Focused tests for each boundary above.

Out of scope:

- Reimplementing every legacy command in the first slice.
- Cloud distribution.
- GUI.
- Always-running daemon.
- Deleting Python/Bash behavior before parity evidence exists.

## 8) TDD Entry Point

Implementation starts with failing tests for:

1. schema parsing and invalid file errors,
2. root detection,
3. alias normalization,
4. compact vs JSON output equivalence,
5. delegation parity for one legacy command,
6. invalid-root and unsupported-command negative paths.

## 9) Acceptance

- `./a -h` prints compact help.
- `./a s` and `./a status` resolve to the same semantic status.
- `./a -j s` returns valid JSON with the same semantic fields.
- Running outside a project fails with an actionable error.
- Missing or invalid local state fails before mutation.
- Delegated commands preserve exit code and failure evidence.
- `bun run typecheck` and `bun test` pass for the kernel.

## 10) Review Questions

- Does the CLI reduce copied logic in downstream projects?
- Can a project remain reproducible through local state and lock files?
- Are frequent commands short enough for agents but still auditable?
- Is every fallback temporary and covered by a parity stop condition?

## 11) Closure

- Accepted implementation evidence:
  - `E-20260528215311949499`
  - `E-20260528220141194181`
- Closeout session: `.agents/wb/260528_0722_slice2-cli-kernel-front-door/`
- Strict verification:
  `./.agents/agents verify-tasks --strict .agents/wb/260528_0722_slice2-cli-kernel-front-door/`
  passed.
