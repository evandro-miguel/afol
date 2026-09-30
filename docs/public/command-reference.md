# Command reference

`afol help` is the live catalog. `afol help --json` includes stability
(`stable`, `experimental`, `compatibility`), aliases, and side effects.
`afol help <command>` documents one command.

Everyday aliases: `s` status, `n` new, `st` start, `d` done, `c` close,
`qt` quick-task, `v` validate, `up` update.

## Lifecycle

Happy path (omit `--session`/`-S` when an active or bound session resolves):

```text
afol init
afol s
afol qt <theme> -t "<task>" -c "<check>"
afol n <theme> -F <F-id> -P <spec-id> -t "<task>"
afol st T-01
afol d T-01 -x "<check>"
afol c
```

`qt` is the 1-hop micro path (create → start → one verify → done → close).
`n` → `st` → `d -x` → `c` is the governed path. `d -x` / `done --test` is the
agent-facing default: argv-only verification plus observed evidence, no shell
parsing. `true`, `:`, and other shell no-ops cannot authorize done. Missing
`-x` is rejected. `done --test-shell` is local-operator-only; never use it for
agent or remote/provider execution.

`e` is diagnostic only (a separate evidence receipt without completing). Do not
teach `e` on the happy path. Pass `-S <session-id>` only for CI or multi-agent
when the session is ambiguous.

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

## Evolution history

```text
afol evolve backfill [--offset <n>] [--limit <1-10>] [--json]
afol evolve backfill --run [--offset <n>] [--limit <1-10>] [--json]
```

Backfill previews one bounded page by default. `--run` ingests that page of
history into evolution state; repeat the command to resume oversized
telemetry pages. It reads open, closed, and archived session artifacts without
changing task state or completing sessions. Production days still require a
complete workbench session and observed passing completion evidence; failure
evidence alone never allocates one. AFOL does not execute models.

## Standalone artifacts

Save an artifact to a standalone record, discover available records, then list
or read an owner-relative artifact without creating Evolution projections:

```text
afol artifact save --kind report --text "Review notes" --record <record-id> --json
afol evolve artifacts --records --limit <n> --json
afol evolve artifacts --records --records-cursor <token> --limit <n> --json
afol evolve artifacts --record <record-id> --json
afol evolve artifacts --record <record-id> --artifact <path> --json
afol evolve artifacts --record <record-id> --artifact <path> \
  --page-cursor <token> --json
afol evolve artifacts --record <record-id> --artifact <path> --byte-offset <n> --json
afol evolve artifacts --record <record-id> --search <literal> --json
```

To copy an explicitly reviewed file from temporary storage, confirm its
SHA-256 and owner, then use `artifact save --file <path> --source-digest <sha256>`
with one explicit `--session <id>` or `--record <id>` and a stable
`--request-id <id>`. The source digest is checked before writing; the artifact
and receipt retain the source path/digest, and the original is preserved.
Repeating the same request returns the same artifact. Unknown-owner files
remain review candidates; AFOL never infers their migration destination.
Archived sources can be copied to a related record; archived snapshots remain
immutable. Capture performs no secondary indexing (`index=not_requested`);
read directly by the receipt path when Evolution projections are unavailable.

Record discovery is metadata-only and reports partial coverage when its entry
budget is reached or inventory entries are unsupported. Search has a bounded
work budget and reports partial coverage when it cannot scan the full inventory.
Reads preserve raw byte anchors and digests while redacting the presented text.
Search checks that redacted presentation. Requested page sizes clamp to at least
four bytes, offsets must be UTF-8 boundaries, and offsets at the end of
nonempty files are refused. Invalid UTF-8 sources and sources larger than the
1 MiB redaction-context budget are withheld with partial coverage.
`--page-cursor` continues a content page; `--cursor` remains the
session-history cursor.

Assisted changes use an explicit version-bound review cycle. Prepare an
external-authored packet with `evolve proposal prepare --packet <path>
--dry-run`, inspect the exact stored operations with `evolve proposal show`,
then approve the displayed version before `evolve proposal apply`. Daily
suggestion acceptance only acknowledges its receipt; it does not approve a
scoped mutation. `evolve proposal evaluate <id> --version <sha256>` is
read-only; `--record` writes an evaluation receipt and requires a trusted local
interactive active task. `evolve proposal revoke` retires the exact version's
adopted context guidance. It does not undo code or skill file changes.

Proposal packets accept legacy v1 session references and owner-based v2
session or standalone-record references emitted by `evolve artifacts`.
Preparation revalidates each referenced source and refuses changed content;
record evidence does not create a synthetic session or an evaluation cohort.

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
