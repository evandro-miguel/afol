# Troubleshooting

## Project not found

Run the command inside a Git repository initialized with `afol init`. Confirm
that `.afol/config.json` exists and is valid JSON.

## Task cannot complete

Use `afol status --task-id <id> --json`. Completion requires observed evidence;
run the agent-facing default `afol done <id> --test "<argv-only-check>"` (or
`-x`), or record an evidence command with
`afol evidence --task-id <id> --command "<check>" --result passed`.
`--test-shell "<real check>"` is local-operator-only and must never be used by
an agent or remote/provider execution.

## Session context is ambiguous

Pass the session explicitly or run `afol catchup --fix` after inspecting the
reported binding issue.

## Evolution projection needs repair

When `afol evolve status --json` reports `rebuild_required` and the canonical
journal is valid, rebuild the derived projection from a trusted local
interactive terminal:

```bash
afol evolve repair --json
```

A non-interactive caller exits 2 with `approval-required`. The refusal is
intentional. Run that command in a trusted local terminal. Change the evolution
database and the canonical journal only through this command.

After the command exits 0, verify the projection:

```bash
afol evolve status --json
afol evolve analyze --json
```

Status reports `state` `healthy`, `journal_health.valid` true, and
`analysis_available` true when the rebuild succeeded. Analyze reports `status`
`available` when it produced at least one proposal, `empty` when the projection
is readable and produced none, and `blocked` when analysis cannot run. A
blocked result points back to `afol evolve status --json`.

## Update conflict

Run `afol update check`, then `afol update preview`. AFOL will not silently
overwrite project-owned content. Resolve or accept each ownership conflict
before applying.

## Source release validation fails

Rerun the failing local step from the gate output against the exact candidate
commit. Reinstall the pinned dependencies when toolchain drift is reported:

```bash
bun install --frozen-lockfile
bun run public:audit -- .
bun run validate:release
```

Do not use results from another commit as release evidence. The alpha is
source-only, and local build outputs are validation evidence rather than
published downloads.

## Hosted CI fails

Open the failed `quality`, `tests`, `core-smoke`, or `deep-validation` job and
rerun its exact command locally with Bun 1.3.14 after
`bun install --frozen-lockfile`. The first three jobs run for pull requests;
`deep-validation` runs only after a push to `main`. A green rerun is regression
evidence, not a replacement for `bun run validate:release` on a release
candidate.
