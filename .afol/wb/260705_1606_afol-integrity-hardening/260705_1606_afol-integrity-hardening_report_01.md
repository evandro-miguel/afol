# Report: AFOL integrity hardening

## Summary

Implemented the recommended integrity pass across governed lifecycle metadata,
state hydration, release gates, benchmark side-effect checks, manifest
synchronization, docs contract, mutable path policy, and file mutations.

## Completed Work

- Added `pending_spec` governance with new-session blocking, lifecycle warnings,
  resolution/waiver commands, project validation, health release checks, and
  spec-gate integration.
- Fixed SQLite state hydration to persist all generated task files, not only
  `task.md`.
- Aligned CI and release docs with typecheck, local-state rebuild, project
  validation, health release, release validation, and smoke checks.
- Hardened benchmark side-effect detection for ignored AFOL runtime state.
- Reconciled SQLite v1 docs, legacy `.agents` policy, mutable-dir handling, and
  command manifest generation from the registry.
- Repaired file mutation semantics around append naming, binary-safe hashing,
  binary diff suppression, and protected path matching.

## Validation

- `bun run typecheck`
- `bun test cli/tests/registry.test.ts cli/tests/help.test.ts cli/tests/bootstrap.test.ts cli/tests/validate-internals.test.ts cli/tests/spec-gate-system.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/quick-task-command.test.ts cli/tests/state-sqlite.test.ts cli/tests/state-command.test.ts cli/tests/file-command-unit.test.ts cli/tests/mutation-safety.test.ts`
- `./afol validate project --json`
- `./afol pstr rebuild --json`
- `./afol health --release --json`
- `bun run manifest:check`
- `git diff --check`

## Remaining Blocker

No remaining implementation blocker is known for the integrity hardening
scope. The former `validate:template` failure caused by the missing
`.agents/skills/agentic-folder-sys` tree is obsolete: that tree is intentionally
absent because `agentic-folder-sys` is now a global Codex operator skill, not a
vendored project/template skill.
