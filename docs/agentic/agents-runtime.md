---
doc_type: standard
id: 260411_agentic-runtime_standard_01
status: active
created_at: '2026-04-11T22:20:58-03:00'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Agentic Runtime

## Purpose

`.agents/runtime/` is the central Python runtime for the scaffold. It provides a package boundary for agent-native inspection, search, validation, journaling, reversible writes, and the FastMCP adapter.

The wrapper keeps the existing `.agents/agents <legacy-command>` surface intact while adding runtime-native entrypoints:

```bash
.agents/agents runtime manifest
.agents/agents runtime validate
.agents/runtime/.venv/bin/agentic adoption-plan
.agents/runtime/.venv/bin/agentic inspect-target
.agents/agents adoption-plan
.agents/agents inspect-target
.agents/agents runtime search "roadmap"
.agents/agents runtime inspect --depth 2
.agents/agents mcp serve
.agents/agents-mcp manifest
```

## Package Layout

| Path | Purpose |
|------|---------|
| `.agents/runtime/pyproject.toml` | Runtime package metadata, dependencies, console scripts, test config |
| `.agents/runtime/uv.lock` | Reproducible runtime dependency lockfile |
| `.agents/runtime/src/agentic_scaffold/` | Runtime code and MCP adapter |
| `.agents/runtime/tests/` | Runtime unit and FastMCP tests |
| `.agents/agents` | Primary compatibility wrapper with `runtime` and `mcp` routes |
| `.agents/agents-mcp` | Thin compatibility launcher for MCP-oriented runtime commands |

## Commands

```bash
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
```

`just all` includes the runtime lint, runtime test, and runtime MCP smoke gates.
Runtime setup uses the project-local `.agents/tools/uv/bin/uv` with the checked-in
`uv.lock`. Normal validation, CI, and runtime launchers execute from
`.agents/runtime/.venv/` directly so sandboxed runs do not need global `uv`.

## Safety Model

- File operations must stay inside the repository root.
- Blocked write roots include `.git/`, `.venv/`, `node_modules/`, `.agents/cache/`, and telemetry event data.
- Archive operations move content into `.agents/z-arq/<timestamp>_<slug>` instead of deleting it.
- Archive slugs accept only letters, numbers, dots, underscores, and hyphens.
- Write, patch, and archive operations write undo metadata under `.agents/journal/agentic-runtime/`.
- The runtime does not remove the legacy script surface until command parity has tests and migration evidence.

## Migration Rule

New agent-native behavior should enter through `.agents/runtime/` first.
Existing `.agents/scripts/` commands remain callable through `.agents/agents`
as compatibility delegates until the runtime has equivalent native behavior and
the workbench records validation evidence for the replacement.

Adoption planning now lives in the runtime layer through:

- `adoption-plan`
- `inspect-target`

Those commands are routed directly through `.agents/agents` as runtime-native
surfaces, while registry-backed compatibility commands continue to use the
script fallback.

The source-kit priority wrappers were migrated first:

- `status`
- `knowledge list/search/show/pull`
- `session catchup`

After that wrapper path was proven with focused runtime tests, every public
`.agents/agents <command>` alias was routed through the runtime command
registry. `status` now executes in-process through the runtime while preserving
the legacy output contract, and `knowledge list/search/show/pull/index` now dispatch
through native runtime search/format logic with parity tests against
`agents-knowledge.py`. Remaining registry entries stay delegated to existing
scripts until their native ports land with parity evidence.

## Runtime Command Registry

Public wrapper commands now route through the runtime command registry while
preserving legacy script behavior:

```bash
.agents/agents runtime command-registry
.agents/agents status --json
.agents/agents knowledge pull runtime
.agents/agents session catchup --json
.agents/agents doctor
```

The registry owns public routing for the wrapper aliases listed by
`.agents/agents runtime command-registry`. `status` is a native command family
(`phase=native`). `knowledge` remains marked `phase=compatibility`, but
`knowledge list/search/show/pull/index` execute through native runtime dispatch.
