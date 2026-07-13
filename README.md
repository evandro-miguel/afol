# AFOL

Canonical AFOL scaffold factory for terminal-first LLM-assisted development.

`afol` is the only supported public CLI. The old `.agents` command/runtime
system has been retired and must not be restored.

## Current Architecture

- `$HOME/.local/bin/afol`: installed public CLI; it must be a real compiled
  executable, not a wrapper or symlink into this repository.
- `./afol`, `bun run kernel`, and `dist/afol`: repository-local development
  entrypoints and build artifact only.
- `cli/**`: Bun/TypeScript implementation.
- `src/project-template/**`: exportable downstream scaffold payload.
- `.afol/config.json`: canonical AFOL project configuration.
- `.agents/lock.json`, `.agents/manifest.json`: static provider-facing
  scaffold metadata.
- `.agents/skills/**`: optional project-local provider skills. Universal AFOL
  behavior uses global Codex skills such as `agentic-folder-sys`; do not vendor
  that skill in this repo/template.
- `.afol/adm/hooks/**`, `.afol/adm/rules/**`,
  `.afol/adm/source/**`, `.afol/adm/tools.json`: AFOL-owned static governance
  payloads, hook/rule catalogs, and skill seed content.
- `.afol/state/afol.db`: SQLite v1 materialization for workbench sessions,
  task rows, source hashes, and evidence only; broader `adm/pstr/memory/library/ctx`
  materialization is State DB v2/future.
- `.afol/**`: mutable AFOL-owned state, including workbench sessions, indexes,
  events, mutations, temporary files, benchmark catalog/results, and migration
  archives.
- Target `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy,
  and desired-state administration.
- Optional `.afol/pstr/**`: generated, rebuildable project-structure map
  snapshots when present; missing or stale maps are not authoritative.

## Documentation Map

- `docs/README.md`: documentation index for repository documentation.
- `docs/afol-runtime-reference.md`: AFOL command groups, runtime state
  ownership, and validation gates.
- `.afol/adm/doctrine/ARCHITECTURE.md`: architecture authority and boundary
  rules.
- `.afol/adm/roadmap/GENERAL-ROADMAP.md`: feature inventory and roadmap status.
- `.afol/adm/specs/**`: governing specs.
- `.afol/adm/decisions/**`: ADRs and durable decisions.
- `.afol/pstr/**`: generated project-structure maps when present.
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

Governed sessions may enter `pending_spec`, but new sessions are blocked while
open pending specs exist until they are resolved or waived. The current session
can continue with lifecycle warnings so the user can finish the work and then
link or waive the missing spec.

## Commands

```bash
afol status
afol validate project
afol validate bench --pack <pack-id> --json
afol new <theme> --feature-id <F-id> --parent-spec <spec-id> --task "<task>"
afol new <theme> --no-spec-required --reason "<reason>"
afol start --session <session-id> --task-id <task-id>
afol done --session <session-id> --task-id <task-id> --test-shell "<cmd>"
afol close --session <session-id> --summary "<summary>"
afol governance pending --json
afol governance resolve-spec --session <session-id> --feature-id <F-id> --parent-spec <spec-id>
afol update check
afol update preview
afol update apply --dry-run
```

When one active or bound session is unambiguous, agents should prefer the
compact path:

```bash
afol st T-01
afol d T-01 -x "<cmd>"
afol c -m "<summary>"
```

`afol evidence --result passed` is declared evidence; it does not authorize
task completion. `done --test-shell` (or `d -x`) records observed exit-zero
evidence and completes the task.

Verify a global installation outside this checkout:

```bash
command -v afol
test ! -L "$(command -v afol)"
afol --version
```

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run manifest:check
afol local-state rebuild --json
afol validate project --json
afol health --release --json
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
`.afol/config.json` under `adapters.claude.enabled` (omitted = enabled);
`.agents/config.json` is legacy fallback only.

## Legacy Policy

The legacy `.agents` executable/runtime system is discontinued. Do not add docs,
tests, or code paths that depend on it. Useful historical material should be
moved under `.afol/data/migrations/` or converted into the TypeScript AFOL CLI.
