# Final Report: CLI Contract Hardening

## Summary

Implemented command-contract hardening for file mutations, session switching/binding, context bundle JSON token economy, maintenance dry-run output, help metadata, and project benchmark catalog-source errors.

## Changes

- File mutations now require a valid in-progress workbench task for real writes.
- Session `bind` and `switch` reject sessions with no open work.
- Patch mutation writes use atomic writes and record `beforeExisted` from file existence, not content length.
- `ctx bundle --json` defaults to compact output; `--full` keeps the complete bundle available.
- Maintenance review dry-run human output distinguishes current and preview summaries.
- Help/registry metadata documents `ctx bundle --json [--full]` and validates `requires_approval` per subcommand.
- Project benchmark unknown-axis errors include `catalog_source`.
- Benchmark coverage/template payloads were updated for the new command contract.

## Verification

- `E-20260703112549620-c360cb`: P0 focused tests and typecheck passed.
- `E-20260703115100041-a5adef`: `./afol local-state rebuild --json && ./afol validate project --json && bun run lint:biome && bun run typecheck && bun test` passed.
- `E-20260703115245674-b946a5`: final post-close local-state rebuild, project validation, Biome lint, typecheck, and full test suite passed.

## Follow-ups

- `afol new --research` / `--no-plan` remains a larger lifecycle redesign and was intentionally not implemented in this patch.
- Close/report impact policy redesign remains a future lifecycle task.
