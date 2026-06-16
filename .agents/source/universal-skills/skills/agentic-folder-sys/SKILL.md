---
name: agentic-folder-sys
description: Static project-local mirror retained for AFOL-only scaffold metadata. Use the live global skill for general guidance, then obey this repository's AFOL entrypoints.
---

# Agentic Folder System

This repository is AFOL-only. The retained source mirror is static metadata and
must not route agents back to retired pre-AFOL command surfaces.

## Required Route In This Repository

Use AFOL for supported scaffold, workbench, validation, update, evidence, and
lifecycle operations:

```bash
afol status
afol validate project --json
afol verify-tasks --strict
afol new <theme> --feature-id <feature-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<cmd>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol update check
```

## Path Boundaries

- Mutable state: `.afol/`
- Direction, specs, ADRs, and strategy: `.afol/adm/`
- Current structure maps only: `.afol/pstr/`
- Governed sessions and evidence: `.afol/wb/`
- Static retained scaffold metadata: `.agents/config.json`,
  `.agents/lock.json`, `.agents/manifest.json`, `.agents/rules/`,
  `.agents/source/`
- Exportable downstream scaffold: `src/project-template/`

## Validation

For cross-cutting scaffold work:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```

Use compact command output. Treat excessive default AFOL output as a bug.
