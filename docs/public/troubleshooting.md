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

## Update conflict

Run `afol update check`, then `afol update preview`. AFOL will not silently
overwrite project-owned content. Resolve or accept each ownership conflict
before applying.

## Release verification fails

Confirm the artifact filename, checksum file, provenance file, and SBOM all
belong to the same candidate. Do not rebuild locally and treat that output as
a published artifact without matching candidate provenance.
