# Tests Structure

The active test surface is Bun-based `cli/tests/`.

## Current Coverage

- `cli/tests/kernel.test.ts`: front-door routing and command compatibility.
- `cli/tests/template-policy.test.ts`: template forbidden-path and instruction checks.
- `cli/tests/bootstrap-template-cleanliness.test.ts`: generated payload cleanliness and bootstrap planner safety.
- `cli/tests/bootstrap.test.ts`, `bootstrap-conflicts.test.ts`, `downstream-smoke.test.ts`, `project-root.test.ts`, `status.test.ts`, `validate-command.test.ts`, `validation.test.ts`, `workbench-lifecycle.test.ts`, `registry.test.ts`: command, validation, bootstrap, and lifecycle coverage.

## Migration / Compatibility Tests

- `.agents/scripts/tests/**` and `.agents/runtime/tests/**` remain as compatibility coverage for factory surfaces.
- They are not the primary app test tree.

## Current Signal

- Template and bootstrap correctness are enforced by live tests, not by docs alone.
- The repo’s CLI behavior is now verified mainly through Bun test files under `cli/tests/`.
