---
doc_type: spec
id: 260521_0010_universal-agent-cli_spec_01
theme: universal-agent-cli
status: final
owners:
- orchestrator
created_at: '2026-05-21T00:10:00+08:00'
updated_at: '2026-07-12T21:20:00Z'
roadmap_feature: F-01
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - cli
  - src/project-template
  - .afol
  - .agents/lock.json
  - .agents/manifest.json
  - .agents/skills
risk_level: high
---

# SPEC: universal-agent-cli

## 1) Feature Intent

Provide one universal Bun/TypeScript command system that agents and operators
use across AFOL-managed projects. The command system owns behavior; each project
owns configuration, governance, and mutable state.

The CLI is agent-primary. Success means:

1. **Extreme ease of use** — short, obvious commands for the happy path.
2. **Extremely low latency** — hot paths stay in tens to low hundreds of ms.
3. **Low write-token consumption** — active-session flows avoid repeated
   identifiers and flag noise.
4. **Very high reliability** — short and long forms share one state machine.
5. **Low forced read tokens** — compact output is default and detail is opt-in.

Command design detail:
`.afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md`.
The living residual is
`.afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md`.

## Current AFOL Contract

- Projects invoke the external `afol` operator. The root `./afol` exists only
  in this factory as a repository-development and package entrypoint; exported
  downstream projects receive no executable, wrapper, symlink, or command
  runner.
- Bun/TypeScript under `cli/**` owns registry, router, schemas, result
  envelopes, project-root detection, services, validation, and lifecycle
  behavior.
- `.afol/config.json` is the canonical project configuration. Static provider
  metadata and optional project skills remain limited to `.agents/lock.json`,
  `.agents/manifest.json`, and `.agents/skills/**`.
- Mutable state and governance live under `.afol/**`, including `.afol/wb/**`,
  `.afol/state/afol.db`, `.afol/data/**`, `.afol/adm/**`, and `.afol/pstr/**`.
- Retired command routing is absent from the active runtime.
- Historical migration material is retained under
  `.afol/data/migrations/**`; it is provenance, never active command
  authority.
- Bun/AFOL gates include `bun run typecheck`,
  `./afol validate project --check-drift --json`, focused `bun test` commands,
  deterministic build/smoke checks, and the governed release lane when release
  evidence is in scope.

## 2) Kernel Contract

The CLI kernel is small, typed, and fail-closed:

- `cli/registry.ts` is the command metadata authority.
- `cli/router.ts` normalizes short and long command forms.
- Every command produces a typed result envelope before formatting.
- Compact text output is default; JSON is opt-in with `-j`.
- Project discovery rejects unsafe, ambiguous, or out-of-scope roots before
  mutation.
- Reads and writes respect project boundaries, protected paths, and symlink
  policy.
- Agent hot-path commands preserve the F-03 latency, output, and write-token
  contracts.

Core project models include:

```text
ProjectStateV1
ProjectConfigV1
ProjectLockV1
ProjectManifestV1
CommandRequestV1
CommandResultV1
CommandErrorV1
```

## 3) Versioned Project State

Authoritative local surfaces are:

```text
.afol/config.json
.afol/wb/
.afol/adm/
.afol/pstr/
.afol/data/
.afol/state/afol.db
.agents/lock.json
.agents/manifest.json
.agents/skills/
```

Loader order:

1. Find the project root from the current directory upward.
2. Require `.afol/config.json` and `.agents/lock.json`.
3. Load `.agents/manifest.json` when managed-file knowledge is required.
4. Lazy-load only the state, rules, skills, indexes, or governance needed by
   the selected command.
5. Rebuild or report stale derived indexes before trusting them.
6. Reject paths outside project ownership or blocked by policy.

## 4) Command and Failure Semantics

The intended operator surface includes:

- `afol s` / `afol status`;
- `afol validate project` / `afol v project`;
- `afol bootstrap <target>` / `afol b <target>`, with `--dry-run` for preview;
- `afol st T-01`, `afol d T-01 -x "<check>"`, and `afol c` when active context
  resolves;
- explicit `-S <session>` and `-T <task>` forms for concurrent agents and CI.

Errors remain stable and actionable:

| Condition | Exit | Default behavior |
| --- | ---: | --- |
| outside project | `2` | identify invalid root and suggest a valid entry |
| missing canonical config | `2` | identify `.afol/config.json` before mutation |
| missing lock | `2` | identify `.agents/lock.json` before mutation |
| invalid JSON | `2` | identify the exact invalid path |
| unsupported command | `2` | suggest current help |
| validation failure | `1` | provide a compact command-specific summary |

JSON output carries the same semantic result as compact output.

## 5) Scope and Boundaries

In scope:

- typed CLI registry, router, schemas, envelopes, services, and validators;
- safe project-root and configuration loading;
- short/long alias parity;
- compact and JSON output;
- standalone factory build and smoke behavior;
- session-bound, journaled mutations and safe update previews;
- focused regression tests for each command boundary.

Out of scope:

- copying factory implementation into downstream projects;
- a GUI, always-running daemon, or public backend;
- cloud distribution or deployment;
- unsupported platform claims without native or VM-backed evidence.

## 6) Acceptance

- `afol -h` prints compact help.
- `afol status` and `afol s` resolve to the same semantic status.
- `afol -j status` returns valid JSON with the same semantic fields.
- Agent fast-path and explicit concurrent forms share one lifecycle model.
- Running outside a project fails with an actionable error.
- Missing or invalid canonical state fails before mutation.
- Registry, router, envelope, root, and lifecycle tests cover their current
  behavior.
- `bun run typecheck` and focused `bun test` gates pass for changed surfaces.

## 7) Review Questions

- Does the operator remain external to downstream project payloads?
- Can a project remain reproducible through canonical local state and lock
  metadata?
- Are frequent commands short, compact, and auditable?
- Do failures stop before unsafe mutation?

## 8) Closure and Historical Provenance

- Accepted implementation evidence:
  - `E-20260528215311949499`
  - `E-20260528220141194181`
- Closeout session: `.afol/wb/260528_0722_slice2-cli-kernel-front-door/`
- Strict verification passed for the accepted closeout.
- The exact pre-reconciliation spec is retained under
  `.afol/data/migrations/260726_f29-governance-contract-reconciliation/`,
  with SHA-256, size, source commit, retention review, and
  `deletion_approved: false`.

## 9) Benchmark Decisions

- Pattern: registry-defined actions and standardized command results.
- Local decision: use typed `ActionSpec` and result-envelope contracts without
  copying an external runtime architecture.
- Acceptance anchor: command metadata is canonical in the CLI registry; every
  command returns an equivalent compact/JSON semantic result; unsafe roots fail
  before mutation.
- Non-goals: no progressive tool discovery dependency and no automatic
  installation of external tools.
