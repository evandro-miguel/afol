# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

Human-readable `new` and `start` output includes a short next-command hint.
Start hints preserve explicit sessions and selected task ranges. Replace
`<cmd>` with an executable verification command, such as `bun test`; `-x`
executes that command and does not accept a textual test result as evidence.

```text
afol init
afol status
afol qt <theme> -t "<task>" -c "<check>"
afol st T-01
afol d T-01 -x "<check>"
afol c
```

With one active session resolving, omit `--session` and `-S`; `-x` is the
short form of `done --test`, which runs argv-only verification and records
observed evidence without shell parsing. `done --test-shell` runs one shell
command for a local operator only; never use it for agent or remote/provider
execution. Completion without observed evidence is rejected. `afol evidence`
records a separate diagnostic receipt and is not a required hop before done.

Multi-agent and CI runs that must not depend on the active-session pointer
pass an explicit session:

```text
afol st T-01 -S <session-id>
afol d T-01 -x "<check>" -S <session-id>
afol c -S <session-id>
```

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

## Context and project checks

For external runtime benchmarks, see [benchmark evidence](benchmark-evidence.md)
for versioned metrics and independent acceptance checks used by
`afol validate bench --pack runtime-live-agent --json`.

`afol ctx build` creates the section index. `afol ctx bundle --json --full`
returns the complete selected context. The `compact` mode is a summary only;
load balanced or larger context before executing. Missing tasks and other
context gaps remain visible in every mode. Required rule bodies are never
trimmed to meet the bundle budget: `CTX_BUDGET_INSUFFICIENT` reports the
estimated size when the remaining content cannot fit. Token budgets are
estimates, not provider-reported token usage.

AFOL includes its own integrity checks. Declare stack-specific checks through
matching project hooks in `.afol/adm/hooks/index.json`, using
`contributions.validation_commands` (for example, `python -m pytest`). Hooks
can scope checks by surface, role, and work type. AFOL does not assume Bun or
execute these commands while building context. Unmatched skills are omitted.

Rule bodies are returned on every request unless the consumer acknowledges
the exact current base:

```text
afol ctx bundle --json --consumer agent-a --context-epoch conversation-1
afol ctx bundle --json --consumer agent-a --context-epoch conversation-1 --ack-rules <base_digest>
```

Use the returned `rule_injection.base_digest` only after incorporating all
returned rules. A different consumer, new context epoch, changed rule, or
unknown digest receives full rule bodies. Change the epoch after compaction
or any loss of the acknowledged context. A null digest cannot be acknowledged.
`--persist-rule-injection` optionally records delivery diagnostics under the
existing local approval boundary; persistence is not proof of consumer memory.

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
