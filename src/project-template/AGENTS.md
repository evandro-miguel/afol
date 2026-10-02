# Project agent guide

## Purpose

This repository uses AFOL to keep work, decisions, and evidence resumable across
coding-agent harnesses. Project code and its documentation remain the product;
AFOL stores only the operational context needed to continue that work.

Replace this section with the project's purpose, users, and primary constraints.

## Canonical paths

- `AGENTS.md` is the canonical harness-neutral instruction file.
- `.afol/adm/specs/` contains durable specifications.
- `.afol/adm/rules/` contains detailed project rules.
- `.afol/adm/decisions/` contains durable decisions.
- `.afol/wb/` contains current workbench state.
- `.afol/data/` contains generated local indexes and evidence metadata.
- `.agents/` contains AFOL metadata and project-local skills.

Treat `.afol/wb/`, `.afol/data/`, `.afol/state/`, and `.afol/tmp/` as local
runtime state unless this project explicitly documents otherwise. Never store
credentials, raw private transcripts, production data, or secrets in AFOL.

## Inspect and resume

Start by reading this file and the repository's own documentation. Then use:

```bash
afol s
afol ss list
afol help <command>
```

Resume active work before creating an overlapping session.

## Work lifecycle

For a small change, replace `<check>` with the project's verification command:

```bash
afol qt verified-change -t "Verify the change" -c "<check>"
```

`qt` creates, starts, verifies, completes, and closes the session. Repeat `-t`
when several tasks share one check; the check runs once.

For staged work, select an approved roadmap feature and parent spec:

```bash
afol n verified-work -F <F-id> -P <spec-id> -t "Verify the change"
afol st T-01
afol d T-01 -x "<check>"
afol c
```

`d -x` records the observed check result. A failed check leaves the task open.
Missing governance produces a `pending_spec` warning; resolve it with
`afol gov rs -F <F-id> -P <spec-id>`. Keep durable decisions in the session log
and implementation details in code and tests.

## Specs and evidence

- A spec defines the user-visible or system-visible contract.
- Implementation follows the active spec. Update the spec when the contract
  changes.
- Tests should cover the smallest stable behavior that prevents regression.
- Record blockers honestly. Do not fabricate provider, hosted, release, or
  runtime proof.
- Preserve unrelated dirty state and user-owned files.

Detailed closure rules live in
`.afol/adm/rules/RULE-008-evidence-gated-closure.md`. Validation conventions live
in `.afol/adm/rules/RULE-004-validation-linting.md`.

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
