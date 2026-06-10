---
doc_type: adr
id: ADR-002
title: AFOL as Sole Public Entrypoint
status: accepted
created_at: '2026-06-09T08:05:00-03:00'
updated_at: '2026-06-09T21:10:00-03:00'
---

# ADR-002: AFOL as Sole Public Entrypoint

## Context

The scaffold previously exposed multiple entrypoints: `.agents/agents` shell
wrapper, `just` command runner, `./a` local alias, and various Python scripts.
This created confusion about which path was canonical and made documentation
inconsistent.

Follow-up retirement work removed the legacy executable/runtime surfaces from
the active repo.

## Decision

`afol` is the only documented public CLI entrypoint for downstream consumers:

- `afol` is installed as a bin in `package.json`.
- All documented workflows use `afol` commands: `afol s`, `afol n`, `afol validate`,
  `afol init`, etc.
- `./a` is not part of the public contract.
- `.agents/agents`, `.agents/scripts`, `.agents/runtime`, `.agents/wb`,
  `.agents/z-arq`, `agents.config`, and `legacy:` delegate routing are retired
  and must not be restored.
- Downstream installs receive only the exportable scaffold from
  `src/project-template/`.

## Consequences

**Positive:**

- Single command to learn and document.
- Clear separation between public and internal surfaces.
- Easier downstream onboarding.
- Consistent CLI ergonomics with aliases (`afol s`, `afol st`, `afol d`).

**Negative:**

- Historical docs/specs may still mention the old system as history, but active
  guidance must not teach it as a current workflow.

## Compliance

- AGENTS.md documents the entrypoint hierarchy.
- `afol --help` is the canonical reference.
