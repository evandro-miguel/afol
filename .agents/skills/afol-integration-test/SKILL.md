---
name: afol-integration-test
description: Use when running live integration tests of the AFOL CLI, workbench lifecycle, external receipt ingestion, evidence projection, recovery, or token and latency telemetry. Do not use for benchmark design without a lifecycle smoke.
metadata:
  category: testing
  tags: "integration-test, afol, lifecycle, receipts, evidence, recovery, telemetry, token-measurement"
  triggers: "AFOL integration test, AFOL live test, lifecycle smoke, external receipt test, evidence projection, catchup recovery, telemetry test, token measurement"
  references: "lifecycle, receipts, evidence, telemetry, recovery, token-economy"
  version: "1.1.1"
  updated_at: "2026-09-12T19:22:00Z"
  target_provider: universal
  tier: 1
---

# AFOL Integration Test

Use this skill to prove one AFOL CLI behavior end to end in a real project.
Keep the tested artifact, lifecycle state, external execution boundary, and
observed evidence explicit.

## Boundaries

- Test development changes through `./afol`, `bun run kernel --`, `./dist/afol`,
  or a differently named repo-local compiled artifact. Never replace, repoint,
  or rebuild the global `afol` binary from `dev` or an unmerged worktree.
- AFOL never selects, calls, schedules, retries, or supervises models. An
  external harness owns model execution and emits a bounded fixed-profile
  receipt; AFOL validates and ingests that receipt.
- Receipt ingestion records observed evidence only. It does not mark a task
  done, close a session, or authorize unrelated mutation.
- Capture the baseline branch, exact HEAD, worktree status, tested artifact
  path, version, and checksum before claiming a live result.

## Lifecycle Fixture

Use the shortest route that proves the behavior. Replace `<afol-dev>` with the
repo-local command selected above. Omit `-S` when one session is bound; use
`-S`/`-T` only for concurrent agents or CI.

Happy path (3 hops): `st T-01` → `d T-01 -x "<real>"` → `c`.
Micro (1 hop): `qt <theme> -t "…" -c "<real>"`.
Use `echo hop-ok`, never `true`. `e` is diagnostic only; `d -x` records
observed evidence and completes the task.

For one task and one verification:

```bash
<afol-dev> qt <theme> -F <F-id> -P <parent-spec> \
  -t "<acceptance>" -c "<verification command>"
```

For a staged or multi-task fixture:

```bash
<afol-dev> n <theme> -F <F-id> -P <parent-spec> -t "<task>"
<afol-dev> st T-01
<afol-dev> d T-01 -x "<verification command>"
<afol-dev> c
```

Repeat `-t` for multi-task `qt`. When several tasks share one verification,
start and complete the range so the command runs once and evidence remains
task-specific.

Missing governance metadata creates `pending_spec` with warnings. It does not
freeze the lifecycle. Test resolution or waiver through `afol gov rs`; test a
corrupt binding through `afol catchup --fix` rather than editing workbench files.

## How to test lifecycle

Do not drive lifecycle tests against this repository's workbench (hundreds of
sessions). Seed an isolated tmp project from the template config:

```bash
root=$(mktemp -d)
mkdir -p "$root/.afol" "$root/.agents"
cp src/project-template/.afol/config.json "$root/.afol/config.json"
cp src/project-template/.agents/lock.json "$root/.agents/lock.json"
# git init, one commit, then run <afol-dev> with cwd="$root"
```

Assert, in that fixture (omit `-S` while bound):

- `n` stdout contains `afol st T-01`
- `st T-01` stdout contains `afol d T-01 -x`
- `d T-01 -x "echo hop-ok"` stdout contains `afol c`
- `d T-01 -x true` and `qt … -c true` fail as shell no-ops
- State Board remains the lifecycle source of truth

## External Receipt Fixture

1. Capture the external harness id, run id, fixed profile id and digest,
   project/session/task binding, source commit, and bounded result.
2. Keep the receipt redacted and free of secrets or raw credential-bearing
   output.
3. Ingest it with the repo-local command:

   ```bash
   <afol-dev> receipt ingest --file <receipt.json>
   ```

4. Verify idempotency and observed evidence projection.
5. Verify separately that task state did not advance. Complete lifecycle
   only through `st` → `d -x` → `c` (or `qt`).

## Telemetry Capture

Record only facts available from the harness or AFOL artifacts:

```text
run_id: <session_id>
timestamp: <ISO 8601>
source_head: <commit>
tested_artifact: <path and checksum>
duration_ms: <end - start>
afol_commands: <count>
afol_failures: <count>
afol_retries: <count>
harness_id: <external harness>
harness_profile_id: <fixed profile>
receipt_id: <id or none>
tool_calls_total: <count>
output_tokens: <provider-reported count or unavailable>
session_id: <AFOL session>
task_ids: <AFOL tasks>
evidence_ids: <observed evidence>
```

Do not estimate tokens when the provider does not report them. Routine AFOL
output above 5,000 tokens is a warning; above 10,000 is a failure.

## Assertions

- The tested command resolves to the intended repo-local artifact.
- The State Board remains the lifecycle source of truth.
- Done requires observed passing evidence from the exact verification command.
- A failed verification remains failed; a prose report cannot override it.
- Hygiene warnings remain visible but do not interrupt active delivery.
- Receipt/profile mismatch, stale provenance, unsafe content, or wrong
  project/session/task binding fails closed without lifecycle mutation.

## Failure Protocol

1. Preserve the failing command, exit code, artifact identity, and compact
   error anchor.
2. Inspect Git state and preserve unrelated user changes.
3. Apply the smallest reversible root-cause correction.
4. Rebuild derived state only when diagnostics prove drift:
   `afol local-state rebuild --json`, then `afol pstr rebuild --json` when
   applicable.
5. Rerun the same path and compare evidence. Do not turn infrastructure,
   timeout, authentication, or unavailable-provider failures into product
   passes.
