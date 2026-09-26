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

Keep canonical code, product docs, reusable specs, and governance at their
project locations. Caches, builds, and fixtures may use disposable scratch;
retained acceptance logs/results belong to the associated session. `afol v
project` checks known session-linked declarations in configured temporary
roots: confirmed misplaced artifacts fail, uncertain legacy candidates warn.
This bounded check does not watch or prevent arbitrary external harness writes.

## Inspect and resume

Start by reading this file and the repository's own documentation. Then run
`afol s` once; it is enough to resume, and one active session resolves without
`--session`. If a session is active, resume it before creating overlapping
work. Use `afol preflight` before operations that depend on project integrity.

## Work lifecycle

When a task fits one pass, use the one-shot path:

```bash
afol qt <theme> -t "<task>" -c "<check>"
```

Select a spec before substantial implementation. Real implementation sessions
must bind `afol n` with `-F <feature> -P <spec>` and replace the scaffold-only
`test -d .afol` check with checks for the actual change. This standalone
scaffold smoke uses an explicit waiver with the short workbench lifecycle:

```bash
afol spec list
afol n scaffold-check -t Verify-scaffold --no-spec-required --reason template-example
afol st T-01
```

During work, record only decisions and evidence that another agent needs to
continue safely. Keep implementation details in code, tests, and focused docs.

Before completion:

```bash
afol v project
afol d T-01 -x "test -d .afol"
afol c
```

With one active session resolving, omit `--session` and `-S`; pass them only to
target an explicit session. `afol evidence` stays diagnostic and is not a
required hop before done. Do not mark work complete from intention alone.
Evidence must name the command, artifact, or observed behavior that proves the
acceptance criteria.

## Specs and evidence

- A spec defines the user-visible or system-visible contract.
- Implementation follows the active spec. Update it when the contract changes.
- Tests should cover the smallest stable behavior that prevents regression.
- Record blockers honestly. Do not fabricate provider, hosted, release, or
  runtime proof.
- Preserve unrelated dirty state and user-owned files.

Detailed closure rules live in `.afol/adm/rules/RULE-008-evidence-gated-closure.md`;
validation conventions live in `.afol/adm/rules/RULE-004-validation-linting.md`.

## Provider mirrors

Provider entrypoints are optional derived mirrors of this file:

- Codex reads this root `AGENTS.md` directly.
- Antigravity uses `.agents/rules/afol.md`, created by
  `afol adapter enable antigravity`.

Use `afol adapter enable <provider>` and `afol adapter sync <provider>` to manage
mirrors. AFOL may change a mirror only when it has the valid AFOL ownership
marker and exact managed format. AFOL owns only `.agents/rules/afol.md`; every
other path under `.agents/` remains user-owned. An unmarked or edited file must
remain untouched; resolve the reported conflict explicitly.

Do not duplicate project instructions inside provider mirrors. Change
`AGENTS.md`, then sync enabled adapters.

## Deeper rules

Read `.afol/adm/rules/README.md` to resolve applicable detailed rules. Common
topics include folder structure, workstream creation, documentation, validation,
maintenance, benchmark quality, and user-journey coverage.

Repository-specific contributor and release procedures belong in `CONTRIBUTING.md`
and project documentation, not in this automatically loaded guide.
