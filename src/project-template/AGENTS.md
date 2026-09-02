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
afol status
afol session status
afol work list
afol help <command>
```

If a session or work item is active, resume it before creating overlapping work.
Use `afol preflight` before operations that depend on project integrity.

## Work lifecycle

Create or select a spec before substantial implementation:

```bash
afol spec list
afol spec create <id> --title "..."
afol session start --spec <id>
afol work start <work-id>
```

During work, record only decisions and evidence that another agent needs to
continue safely. Keep implementation details in code, tests, and focused docs.

Before completion:

```bash
afol validate
afol work done <work-id> --evidence "<command and observed result>"
afol session close
```

Do not mark work complete from intention alone. Evidence must name the command,
artifact, or observed behavior that proves the acceptance criteria.

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
