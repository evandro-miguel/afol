---
doc_type: adr
id: ADR-002
title: AFOL as Sole Public Entrypoint
status: accepted
created_at: '2026-06-09T08:05:00-03:00'
updated_at: '2026-06-09T08:05:00-03:00'
---

# ADR-002: AFOL as Sole Public Entrypoint

## Context

The scaffold previously exposed multiple entrypoints: `.agents/agents` shell
wrapper, `just` command runner, `./a` local alias, and various Python scripts.
This created confusion about which path was canonical and made documentation
inconsistent.

Sessions afol-cli-ux-simplification and mvp-finalization-gap-implementation
converged on making `afol` the single documented public entrypoint.

## Decision

`afol` is the only documented public CLI entrypoint for downstream consumers:

- `afol` is installed as a bin in `package.json`.
- All documented workflows use `afol` commands: `afol s`, `afol n`, `afol validate`,
  `afol init`, etc.
- `./a` remains as a local compatibility alias but is not documented as a public
  entrypoint.
- `.agents/agents` is a factory-only legacy wrapper during migration.
- Downstream installs receive only the exportable scaffold from
  `src/project-template/`.

## Consequences

**Positive:**

- Single command to learn and document.
- Clear separation between public and internal surfaces.
- Easier downstream onboarding.
- Consistent CLI ergonomics with aliases (`afol s`, `afol st`, `afol d`).

**Negative:**

- Existing documentation referencing `.agents/agents` or `just` targets must be
  updated.
- Compatibility aliases must be maintained until safe retirement (RULE-009).

## Compliance

- RULE-009 governs safe retirement of legacy entrypoints.
- AGENTS.md documents the entrypoint hierarchy.
- `afol --help` is the canonical reference.
