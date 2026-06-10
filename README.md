# Agentic Start Folder

Canonical AFOL scaffold factory for terminal-first LLM-assisted development.

`afol` is the only supported public CLI. The old `.agents` command/runtime
system has been retired and must not be restored.

## Current Architecture

- `afol`: public CLI entrypoint.
- `cli/**`: Bun/TypeScript implementation.
- `src/project-template/**`: exportable downstream scaffold payload.
- `.agents/config.json`, `.agents/lock.json`, `.agents/manifest.json`: static
  scaffold metadata.
- `.agents/rules/**`, `.agents/source/**`: static protocol/source seed
- `.afol/skills/**`: project-local skills
  scaffold guidance and skill seed content.
- `.afol/**`: mutable AFOL-owned state, including workbench sessions, indexes,
  events, mutations, temporary files, benchmark catalog/results, and migration
  archives.

Removed legacy surfaces:

- `.agents/agents`
- `.agents/agents-mcp`
- `.agents/scripts/**`
- `.agents/runtime/**`
- `.agents/wb/**`
- `.agents/z-arq/**`
- `.agents/agents.config`
- `legacy:` delegate routing

## Commands

```bash
afol status
afol validate project
afol validate bench --pack <pack-id> --json
afol new <theme> --feature-id <F-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<cmd>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol update check
afol update preview
afol update apply --dry-run
```

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
afol local-state rebuild --json
afol validate project --json
bun run validate:release
```

## Bootstrap

Use AFOL only:

```bash
afol init --dry-run
afol init
afol bootstrap /path/to/repo --dry-run
afol bootstrap /path/to/repo --provider-compatible
```

Provider-compatible installs keep static scaffold metadata in `.agents/` and
write mutable state under `.afol/`.

## Legacy Policy

The legacy `.agents` executable/runtime system is discontinued. Do not add docs,
tests, or code paths that depend on it. Useful historical material should be
moved under `.afol/data/migrations/` or converted into the TypeScript AFOL CLI.
