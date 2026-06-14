---
doc_type: adr
id: ADR-001
title: Bun/TypeScript as Canonical Runtime
status: accepted
created_at: '2026-06-09T08:00:00-03:00'
updated_at: '2026-06-09T08:00:00-03:00'
---

# ADR-001: Bun/TypeScript as Canonical Runtime

## Context

The scaffold originally used Python/UV for runtime commands, justfile targets,
and bootstrap scripts. This created maintenance overhead across two language
stacks, inconsistent command interfaces, and dependency on Python tooling that
did not align with the TypeScript/Bun CLI direction.

Multiple sessions (python-runtime-hardening, py-retirement-bootstrap-cleanup,
bun-ts-ultimate-direction-docs, mvp-finalization-gap-implementation) converged
on replacing Python/UV with a Bun/TypeScript-native CLI (`afol`) as the sole
public entrypoint.

## Decision

Adopt Bun and TypeScript as the canonical runtime for all scaffold operations:

- The public CLI (`afol`) is a Bun/TypeScript binary built from `cli/`.
- Legacy Python/UV surfaces are compatibility debt during migration, not public
  entrypoints.
- Legacy just command-runner targets are compatibility debt, not canonical gates.
- All new commands, validations, and runtime features are implemented in
  TypeScript under `cli/`.

## Consequences

**Positive:**

- Single language stack reduces maintenance overhead.
- Bun provides fast startup, native TypeScript, built-in test runner.
- Type-safe CLI commands with Zod/Valibot validation.
- Consistent tooling: `bun run typecheck`, `bun test`, `bun run build`.

**Negative:**

- Requires Bun runtime in downstream environments.
- Legacy Python/UV wrappers remain as compatibility debt until safe retirement.
- Migration must be incremental — cannot remove Python surfaces until all
  command families have proven TS replacements.

## Compliance

- RULE-009 governs safe retirement of legacy Python surfaces.
- AGENTS.md "Factory And Template Boundary" section documents the migration.
- `bun run validate:release` gates the release pipeline.
