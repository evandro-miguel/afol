---
doc_type: standard
id: 260411_agentic-runtime_standard_01
status: active
created_at: '2026-04-11T22:20:58-03:00'
updated_at: '2026-04-13T19:36:49-03:00'
---

# Agentic Runtime

## Purpose

`.agents/runtime/` is the central Python runtime for the scaffold. It provides a package boundary for agent-native inspection, search, validation, journaling, reversible writes, and the FastMCP adapter.

The wrapper keeps the existing `.agents/agents <legacy-command>` surface intact while adding runtime-native entrypoints:

```bash
.agents/agents runtime manifest
.agents/agents runtime validate
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
just setup-runtime
just lint-runtime
just test-runtime
just runtime-mcp-smoke
```

`just all` includes the runtime lint, runtime test, and runtime MCP smoke gates.
Runtime setup, validation, CI, and runtime launchers use the checked-in `uv.lock` through `uv --locked`.

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

The source-kit priority wrappers were migrated first:

- `status`
- `knowledge pull`
- `session catchup`

After that wrapper path was proven with focused runtime tests, every public
`.agents/agents <command>` alias was routed through the runtime command
registry. The registry delegates to the existing scripts today; future native
ports can replace individual delegate entries after parity evidence exists.

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
`.agents/agents runtime command-registry`. Each entry remains a compatibility
delegate until the implementation is fully ported into runtime-native service
code.
