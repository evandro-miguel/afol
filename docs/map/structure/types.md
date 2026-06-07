# Types Structure

There is no separate type-only package in the active app.

## Current Type Surfaces

- `cli/schemas/template-policy.ts`: template-root constants and policy types.
- `cli/services/template/payload.ts`: `TemplateFileEntry`, `TemplatePayload`, and generated-template metadata shape.
- `cli/services/project/validate.ts` and command modules: small local types for validation and command responses.

## Notes

- Type definitions are embedded where the Bun/TypeScript CLI uses them.
- The old Python-heavy map shape is no longer the primary architecture signal.
