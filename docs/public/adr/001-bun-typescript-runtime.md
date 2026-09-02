# ADR-001: Bun and TypeScript as the canonical runtime

Status: accepted

AFOL's public CLI, tests, and release build use Bun and TypeScript. New
commands, validations, and runtime features belong under `cli/`.

Downstream users run the source alpha with the Bun version pinned in
`package.json`. Linux x64 is the supported source-execution target; WSL2 has
observed local smoke.
