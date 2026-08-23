# ADR-001: Bun and TypeScript as the canonical runtime

Status: accepted

AFOL's public CLI, tests, and release build use Bun and TypeScript. New
commands, validations, and runtime features belong under `cli/`.

Downstream users need Bun only to build from source. The supported install
path is the compiled Linux x64 binary.
