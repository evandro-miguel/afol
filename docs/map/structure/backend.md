# Backend Structure

The live backend is the Bun/TypeScript CLI in `cli/`.

## Active Files

- `cli/main.ts`: `afol` entrypoint, help text, command dispatch, legacy adapter fallback, and validation-mode routing.
- `cli/router.ts`: command resolution.
- `cli/commands/*.ts`: bootstrap, init, status, validate, and workbench command handlers.
- `cli/services/project/root.ts`: project-root detection.
- `cli/services/project/validate.ts`: root validation, including `src/project-template/` forbidden-path checks.
- `cli/services/template/payload.ts`: template payload generation and hash metadata.
- `cli/schemas/template-policy.ts`: allowed/forbidden template policy.

## Compatibility Surfaces

- Root `.agents/scripts/**` and `.agents/runtime/**` still exist, but they are migration-era factory compatibility surfaces
  retained until delegated command families are replaced natively.
- `src/project-template/**` contains the downstream scaffold copy of the current template payload.

## What The Code Is Doing

- The CLI prefers native Bun/TS commands first.
- Template generation and bootstrap checks enforce the export boundary.
- Python-backed compatibility surfaces are still present only where the factory repo needs them for fallback; they remain until native TS
  parity reaches the delegated command families they cover.
