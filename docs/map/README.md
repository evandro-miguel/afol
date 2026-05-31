---
title: "Repository Map"
description: "Current-state evidence for the Bun/TypeScript app and template boundary."
doc_kind: "codemap-index"
version: "v2026-05-31_1"
created_at: "2026-05-31T00:00:00Z"
updated_at: "2026-05-31T00:00:00-03:00"
---

# Repository Map

This folder is the live current-state map for the repo.

## Current Shape

- Active app source is Bun/TypeScript in `cli/**`.
- Exportable downstream scaffold source is `src/project-template/**`.
- Root `.agents/scripts/**` and `.agents/runtime/**` are factory-only legacy/compat surfaces during migration.
- The clean template excludes `.agents/scripts/**`, `.agents/runtime/**`, `.agents/agents`, `.agents/agents-mcp`, and Python env files such as `**/*.py`, `**/pyproject.toml`, `**/uv.lock`, `**/.venv/**`, and `**/__pycache__/**`.
- Legacy factory Python/command shim paths are retained for compatibility while any delegated
  command family remains native-migration-only; they are retired only when parity gates
  demonstrate full replacement.
- `docs/map/` is current-state evidence only; goal-state canon stays in `docs/arc/`.

## Current Commands

- Primary package scripts: `typecheck`, `test`, `validate`, `validate:template`, `validate:bootstrap`, `build`.
- Template and bootstrap checks are enforced from `cli/tests/template-policy.test.ts` and `cli/tests/bootstrap-template-cleanliness.test.ts`.

## Reading Order

- `structure/README.md`
- `structure/backend.md`
- `structure/tests.md`
- `structure/data.md`
- `structure/types.md`

## What To Expect

- Concise observations, not giant generated inventories.
- Current file ownership and boundary notes.
- Enough evidence to reason about the live architecture without guessing.
