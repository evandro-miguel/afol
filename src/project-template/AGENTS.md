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
afol s         # project status (read)
afol ss list   # active session, bindings, and open sessions (read)
afol help <command>
```

If a session or work item is active, resume it before creating overlapping work.
Use `afol preflight` before operations that depend on project integrity.

## Work lifecycle

Select the governing spec before substantial implementation (specs are durable
files under `.afol/adm/specs/`), then run the lifecycle:

```bash
afol sp list                       # inspect specs (read)
afol n <theme> --task "<summary>"  # open a session with an initial task
```

Link a governed session to its feature and spec with
`afol n <theme> --feature-id <F-id> --parent-spec <spec-id>`; an explicit
waiver is `afol n <theme> --no-spec-required --reason "<text>"`.

During work, record only decisions and evidence that another agent needs to
continue safely. Keep implementation details in code, tests, and focused docs.

Before completion:

```bash
afol v                      # validation gates
afol st T-01                # start a task
afol d T-01 -x "<check>"    # run the check and complete the task in one step
afol c                      # close the session after its tasks are complete
```

`-x` names the command that proves the task; it must pass for `done` to
complete it. Batch a shared check with
`afol d T-01..T-n -x "<check>"`, and use `afol help st`, `afol help d`, and
`afol help c` for session-scoped forms. Evolution learnings follow a
proposal-before-apply cycle: inspect with `afol evolve` (read) and see
`afol help evolve` for the subcommands your installed build supports; a
daily suggestion receipt is an acknowledgment, not approval for a scoped
change. Prepare external-authored packets read-only, inspect their exact
operations with `afol evolve proposal show`, then record approval for that
exact version with `afol evolve proposal decide` before applying it. Use
`afol evolve proposal evaluate` to preview later comparable outcomes;
`--record` requires a trusted local interactive active task. `proposal revoke`
retires exact adopted context guidance and does not undo code or skill file
changes. AFOL does not execute the packet's validation commands or call models.

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

Repository-specific contributor and release procedures belong in `CONTRIBUTING.md` and project documentation, not in this automatically loaded guide.
