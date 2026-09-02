# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

```text
afol init
afol status
afol qt <theme> -t "<task>" -c "<check>"
afol new <theme> --task <text>
afol start --task-id <task-id>
afol evidence --task-id <task-id> --command "<check>" --result passed
afol done <task-id> --test "<argv-only-check>"
afol done <task-id> --test-shell "<shell-check>"
afol close
```

`done --test` (alias `-x`) is the agent-facing default: it runs argv-only
verification and records observed evidence without shell parsing.
`done --test-shell` runs one shell command for a local operator only; never use
it for agent or remote/provider execution. Completion without observed evidence
is rejected. Use `evidence --result passed` when recording a separate evidence
receipt.

## Materialized state

Hydrate a session before inspecting or exporting its derived state:

```text
afol hydrate --session <session-id>
afol state show --session <session-id>
afol state validate --session <session-id>
afol state sync --session <session-id>
afol state export --session <session-id>
```

`state show` reads the snapshot, `state validate` checks its source hashes,
`state sync` refreshes the snapshot, and `state export` prints the hydrated
snapshot. Omit `--session` only when an active or bound session is available.

## Project and template

```text
afol bootstrap <target>
afol validate project
afol update check
afol update preview
afol update apply --dry-run
afol catchup --fix
```

## Stability

- **stable**: init, bootstrap, status, health, new/start/done/close, evidence,
  state, validate, update, safe file mutations, adapter.
- **experimental**: evolve, fleet, memory, library, bench,
  project-benchmark, telemetry, receipt, hydrate, ux.
- **compatibility**: `legacy`, `render`. Do not use these for new work.

Experimental commands may change between alpha releases.

The stable `adapter` command manages the sole optional Antigravity workspace
rule at the exact path `.agents/rules/afol.md` through `enable`, `sync`, and
`disable`. Codex reads the root `AGENTS.md` directly. AFOL preserves an
unmarked or edited rule file and reports a conflict; see [Codex and Antigravity
integration](provider-integrations.md) for activation and handoff guidance.
