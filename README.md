# AFOL

Canonical AFOL scaffold factory for terminal-first LLM-assisted development.

`afol` is the only supported public CLI. The old `.agents` command/runtime
system has been retired and must not be restored.

## Current Architecture

- `afol`: public CLI entrypoint.
- `cli/**`: Bun/TypeScript implementation.
- `src/project-template/**`: exportable downstream scaffold payload.
- `.agents/config.json`, `.agents/lock.json`, `.agents/manifest.json`: static
  provider-facing scaffold metadata.
- `.agents/skills/**`: project-local provider skills.
- `.afol/adm/hooks/**`, `.afol/adm/rules/**`,
  `.afol/adm/source/**`, `.afol/adm/tools.json`: AFOL-owned static governance
  payloads, hook/rule catalogs, and skill seed content.
- `.afol/**`: mutable AFOL-owned state, including workbench sessions, indexes,
  events, mutations, temporary files, benchmark catalog/results, and migration
  archives.
- Target `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy,
  and desired-state administration.
- Target `.afol/pstr/**`: current project-structure maps only; commands live in
  `cli/**`, and pstr contains map outputs.

## Documentation Map

- `docs/README.md`: documentation index for repository documentation.
- `docs/afol-runtime-reference.md`: AFOL command groups, runtime state
  ownership, and validation gates.
- `.afol/adm/doctrine/ARCHITECTURE.md`: architecture authority and boundary
  rules.
- `.afol/adm/roadmap/GENERAL-ROADMAP.md`: feature inventory and roadmap status.
- `.afol/adm/specs/**`: governing specs.
- `.afol/adm/decisions/**`: ADRs and durable decisions.
- `.afol/pstr/**`: generated current project-structure maps.
- `PLANS.md`: ExecPlan requirements for governed workbench sessions.
- `.afol/adm/doctrine/RELEASE-RUNBOOK.md`: release readiness checklist.

Removed legacy surfaces:

- `.agents/agents`
- `.agents/agents-mcp`
- `.agents/scripts/**`
- `.agents/runtime/**`
- `.agents/wb/**`
- `.agents/z-arq/**`
- `agents.config`
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

## Runtime Adapters

Optional integration surfaces can be toggled off when a downstream project does
not want them. The Claude adapter owns `CLAUDE.md` and `.claude/`; `AGENTS.md`
is always canonical and is never removed.

Install without the Claude adapter:

```bash
afol init --without-claude
afol bootstrap /path/to/repo --without-claude
```

Toggle at runtime (archives `CLAUDE.md` + `.claude/` under
`.afol/data/migrations/`, reversible):

```bash
afol adapter list
afol adapter disable claude
afol adapter enable claude
```

Both subcommands accept `--dry-run` and `--json`. The state is persisted in
`.agents/config.json` under `adapters.claude.enabled` (omitted = enabled).

## Legacy Policy

The legacy `.agents` executable/runtime system is discontinued. Do not add docs,
tests, or code paths that depend on it. Useful historical material should be
moved under `.afol/data/migrations/` or converted into the TypeScript AFOL CLI.
