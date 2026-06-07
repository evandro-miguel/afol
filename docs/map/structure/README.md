# Structure Map

This section is a compact physical-layout snapshot, not a full file inventory.

## Top-Level Surfaces

- `cli/`: live Bun/TypeScript CLI, routing, commands, schema checks, and tests.
- `src/project-template/`: exportable downstream template source.
- `.agents/`: factory repo state, including legacy Python compatibility surfaces kept as safe migration fallbacks, workbench data, skills, rules, and generated evidence.
- `docs/`: project documentation, with `docs/map/` for current-state evidence and `docs/arc/` for goal-state canon.

## Boundary Notes

- Template payload generation starts from `src/project-template/`.
- The clean template excludes root `.agents/scripts/**`, `.agents/runtime/**`, `.agents/agents`, `.agents/agents-mcp`, and Python env artifacts.
- Legacy compatibility paths remain in the factory root until native delegation parity is complete.
- `cli/tests/` is the live policy and bootstrap verification surface for that boundary.

## Use This Section For

- Fast orientation on where the live app and template live.
- Checking which tree is active versus migration-only.
- Finding the right follow-up file before opening source.
