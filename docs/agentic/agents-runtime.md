---
doc_type: standard
id: 260411_agentic-runtime_standard_01
status: active
created_at: '2026-04-11T22:20:58-03:00'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Agentic Runtime

## Purpose

The legacy runtime package is discontinued factory-only compatibility state. It
is not part of the public downstream CLI path.

`afol` is the public entrypoint. Runtime and wrapper commands below are factory-only migration references, not downstream usage:

```bash
afol status
afol validate
afol verify-tasks
```

## Package Layout

| Path | Purpose |
|------|---------|
| Legacy runtime package | Factory-only runtime metadata, lockfile, code, MCP adapter, and tests |
| Legacy wrapper launchers | Factory-only compatibility routing for retired runtime and MCP commands |

## Commands

```bash
afol status
afol validate
afol verify-tasks
```

Runtime-specific subcommands remain factory-only and must not be documented as
public downstream usage. Legacy runtime gates are migration debt, not the
current public validation path.

## Safety Model

- File operations must stay inside the repository root.
- Blocked write roots include `.git/`, `.venv/`, `node_modules/`, `.agents/cache/`, and telemetry event data.
- Archive operations move content into `.agents/z-arq/<timestamp>_<slug>` instead of deleting it.
- Archive slugs accept only letters, numbers, dots, underscores, and hyphens.
- Write, patch, and archive operations write undo metadata under `.agents/journal/agentic-runtime/`.
- The runtime does not remove the legacy script surface until command parity has tests and migration evidence.

## Migration Rule

New public behavior should enter through the Bun/TypeScript `afol` CLI first.
Existing legacy script/runtime commands remain factory-only compatibility
delegates until retired or replaced with AFOL-native behavior and workbench
validation evidence.

Adoption planning now lives in the runtime layer through:

- `adoption-plan`
- `inspect-target`

Those commands are factory-only migration references while registry-backed
compatibility commands continue to use the legacy fallback.

The source-kit priority wrappers were migrated first:

- `status`
- `knowledge list/search/show/pull`
- `session catchup`

After that compatibility path was proven with focused runtime tests, the legacy
aliases were routed through the runtime command registry. `status` now executes
in-process through the runtime while preserving the legacy output contract, and
knowledge list/search/show/pull/index dispatch through native runtime
search/format logic with parity tests. Remaining registry entries stay
factory-only until their native ports land with parity evidence.

## Runtime Command Registry

The legacy runtime command registry is factory-only. Public routing belongs in
the Bun/TypeScript `afol` CLI. `status` is native; remaining compatibility
entries must become AFOL-native or stay undocumented downstream.
