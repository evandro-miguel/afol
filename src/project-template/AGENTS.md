# Project agent guide

## Purpose

This repository uses AFOL to keep work, decisions, and evidence resumable across coding-agent harnesses.
Project code and docs remain the product; AFOL stores operational context needed to continue work.

Replace this section with the project's purpose, users, and primary constraints.

## Canonical paths

- `AGENTS.md` is the canonical harness-neutral instruction file.
- `.afol/adm/specs/` contains durable specifications.
- `.afol/adm/rules/` contains detailed project rules.
- `.afol/adm/decisions/` contains durable decisions.
- `.afol/wb/` contains current workbench state.
- `.afol/data/` contains generated local indexes and evidence metadata.
- `.agents/` contains AFOL metadata and project-local skills.

Treat `.afol/wb/`, `.afol/data/`, `.afol/state/`, and `.afol/tmp/` as local runtime state unless
this project documents otherwise. Never store credentials, raw transcripts, production data, or secrets in AFOL.

## Session artifacts

Sessions are optional for ordinary work; without one, durable outputs stay at canonical project locations.
When associated with a session, reports, handoffs, reviews, plans, and durable evidence go under
`paths.wb_dir/<session-id>`, never `paths.tmp_dir`. Keep managed plan/task/log/report/evidence-ledger
files at the session root. Needed supplementary artifacts use `<session>/artifacts/`, distinct
task-purpose names, and exclusive creation. Closed-session reviews append there without changing
original records or closure; new implementation uses a linked open continuation.

Keep canonical code, product docs, reusable specs, and governance at their project locations. Caches,
builds, and fixtures may use disposable scratch; retained acceptance logs/results belong to the
associated session. `afol v project` checks known session-linked declarations in configured temporary
roots: confirmed misplaced artifacts fail, uncertain legacy candidates warn. This bounded check does
not watch or prevent arbitrary external harness writes.

## Inspect and resume

Start by reading this file and the repository's own documentation, then run `afol s` once. One status
check is enough to resume; with one active session, commands resolve without `--session` or `-S`.
Pass either option only when targeting an explicit session. If a session or work item is active,
resume it before creating overlapping work. Use `afol preflight` before operations that depend on
project integrity.

## Work lifecycle

When a task fits one pass, use the one-shot path:

```bash
afol qt <theme> -t "<task>" -c "<check>"
```

Select the governing spec before substantial implementation; specs are durable files under
`.afol/adm/specs/`. Real implementation sessions must bind `afol n` to both a feature and a spec
(`-F <feature> -P <spec>` or `--feature-id <F-id> --parent-spec <spec-id>`) and replace the
scaffold-only `test -d .afol` check with checks for the actual change.

This standalone scaffold smoke uses an explicit waiver with the short workbench lifecycle:

```bash
afol sp list
afol n scaffold-check -t Verify-scaffold --no-spec-required --reason template-example
afol st T-01
afol v project
afol d T-01 -x "test -d .afol"
afol c
```

During work, record only decisions and evidence that another agent needs to continue safely. Keep
implementation details in code, tests, and focused docs. `afol evidence` is diagnostic, not a
required step before completion. Do not mark work complete from intention alone; evidence must name
the command, artifact, or observed behavior that proves the acceptance criteria.

`-x` must pass for `done` to complete a task. Batch a shared check with
`afol d T-01..T-n -x "<check>"`.

Evolution learnings follow a proposal-before-apply cycle. Inspect with `afol evolve` and `afol help
evolve`; a daily suggestion receipt is an acknowledgment, not approval for a scoped change. Prepare
external-authored packets read-only, inspect exact operations with `afol evolve proposal show`, and
record approval for that exact version with `afol evolve proposal decide` before applying. Use
`afol evolve proposal evaluate` to preview comparable outcomes; `--record` requires a trusted local
interactive active task. `proposal revoke` retires exact adopted context guidance and does not undo
code or skill file changes. AFOL does not execute packet validation commands or call models.

## Specs and evidence

Capture durable supplementary notes with `afol artifact save --kind note --text "<content>" --record <record-id> --json`, or use `--standalone` to create a record without a session. An explicit `--session` targets that session's `artifacts/` directory. Capture never creates or completes lifecycle tasks. Standalone records use `paths.records_dir` (default `.afol/records`). Discover them with `afol evolve artifacts --records --json`; inspect a record with `--record <record-id>` and read its selected file with `--artifact <path>`. Continue content pages with the returned `--page-cursor`; keep owner, file, and source digest unchanged. Partial or withheld content is not complete evidence. Only unchanged verified references may support a proposal packet.

- A spec defines the user-visible or system-visible contract.
- Implementation follows the active spec. Update it when the contract changes.
- Tests should cover the smallest stable behavior that prevents regression.
- Record blockers honestly. Do not fabricate provider, hosted, release, or runtime proof.
- Preserve unrelated dirty state and user-owned files.

Detailed closure rules live in `.afol/adm/rules/RULE-008-evidence-gated-closure.md`; validation conventions live in `.afol/adm/rules/RULE-004-validation-linting.md`.

## Provider mirrors

Provider entrypoints are optional derived mirrors of this file:

- Codex reads this root `AGENTS.md` directly.
- Antigravity uses `.agents/rules/afol.md`, created by `afol adapter enable antigravity`.

Use `afol adapter enable <provider>` and `afol adapter sync <provider>` to manage mirrors. AFOL may change a mirror only when it has the valid AFOL ownership marker and exact managed format. AFOL owns only `.agents/rules/afol.md`; every other path under `.agents/` remains user-owned. An unmarked or edited file must remain untouched; resolve the reported conflict explicitly.

Do not duplicate project instructions inside provider mirrors. Change `AGENTS.md`, then sync enabled adapters.

## Deeper rules

Read `.afol/adm/rules/README.md` to resolve applicable detailed rules. Common topics include folder structure, workstream creation, documentation, validation, maintenance, benchmark quality, and user-journey coverage.

Repository-specific contributor and release procedures belong in `CONTRIBUTING.md` and project documentation, not in this automatically loaded guide.
