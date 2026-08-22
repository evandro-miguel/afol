# AFOL

Canonical AFOL scaffold factory for terminal-first LLM-assisted development.

`afol` is the only supported public CLI. The old `.agents` command/runtime
system has been retired and must not be restored.

## Release Scope

AFOL is currently a prerelease CLI for Linux x64. WSL2 is validated as a
Linux x64 environment. Windows-native, macOS, Linux ARM, and hosted-service
support are not claimed.

The supported distribution artifact is the standalone compiled `afol` binary.
The package remains private because npm is not a release channel.

## Install A Published Release

Download these assets from the selected entry on the
[GitHub Releases page](https://github.com/evandro-miguel/afol/releases):

- `afol`
- `afol.sha256`
- `afol.provenance.json`

Verify the downloaded binary before installing it:

```bash
expected_sha="$(awk '{print $1}' afol.sha256)"
actual_sha="$(sha256sum afol | awk '{print $1}')"
test "$actual_sha" = "$expected_sha" && install -Dm755 afol "$HOME/.local/bin/afol"
```

Ensure `$HOME/.local/bin` is already on `PATH`, then verify the installed
command from outside an AFOL source checkout:

```bash
command -v afol
test ! -L "$(command -v afol)"
afol --version
afol --help >/dev/null
```

Initialize a project only after reviewing the dry-run:

```bash
cd /path/to/project
afol init --dry-run
afol init
afol validate project
```

To uninstall the standalone CLI, remove only the installed binary. Project
state under `.afol/**` is user data and is not removed automatically.

## License

AFOL is available under the [MIT License](./LICENSE).

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

`afol new` without `--feature-id`/`--parent-spec` creates a session with
`pending_spec` plus warnings; open pending specs do not block other new
sessions. The current session can continue through `start`, `evidence`, `done`,
and `close` with lifecycle warnings so the user can finish the work and then
link or waive the missing spec. `afol status` and `afol validate project` warn
while pending specs are open; close is allowed.

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
afol gov rs -S <session-id> -F <F-id> -P <spec-id>
afol gov rs -S <session-id> --no-spec-required -r "<reason>"
afol gov bulk-waive -r "<reason>" [--limit 20] [--dry-run]
afol evolve status --json
afol update check
afol update preview
afol update apply --dry-run
```

Micro one-shot work should prefer `afol qt <theme> -t "<task>" -c "<cmd>"`
(repeat `-t` for multi-task with one shared verify). Hygiene signals from
`afol health`, maintenance, or open `pending_spec` are warnings—not mid-delivery
stops. Corrupt session context: `afol catchup --fix`.

When one active or bound session is unambiguous, agents should prefer the
compact path:

```bash
afol st T-01
afol d T-01 -x "<cmd>"
afol c -m "<summary>"
```

`afol evidence --result passed` is declared evidence; it does not authorize
task completion. `d -x "<argv command>"` executes without a shell. Use
`done --test-shell "<shell expression>"` when `&&`, pipes, redirection, or other
shell syntax is required. Both record observed exit-zero evidence.

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

The release claim is intentionally limited to the observed Linux x64 path.
The opt-in, manual-dispatch workflow (ADR-009) targets an Ubuntu 24.04 x64
runner; it does not establish Windows, macOS, or ARM support. For a local
WSL2 observation, run `bun run smoke:wsl2` from a Linux x64 WSL2 shell.
Standalone builds disable Bun's `.env` and `bunfig.toml` autoloading so
repository-local configuration cannot change binary behavior.

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
