---
doc_type: standard
id: 000000_000000_tech-stack_standard_01
status: active
created_at: '2026-03-07T00:00:00Z'
updated_at: '2026-03-06T22:29:30-03:00'
---

# Tech Stack

## Live State

- Bun runtime: `bun@1.3.14` (`packageManager` field in `package.json`)
- Bun version gate: `>=1.3.14` (`engines.bun`)
- TypeScript: `^5.9.3` (`devDependencies.typescript`)
- Bun test runner (`bun test`) for CLI and focused template-policy checks
- CLI command surface in progress:
  - `afol` (public/publicized entrypoint)
  - `./a` (factory migration wrapper)
- Template-policy-based runtime hygiene:
  - `template:check` and `template:check`-adjacent tests in `package.json`
  - forbidden/allowed path patterns and forbidden-text scan in
    `cli/schemas/template-policy.ts`
- TypeScript compilation gate: `bun run typecheck` (`tsc --noEmit`)

## Target Direction

Planned stack upgrades are direction-only and not yet reflected as installed
package dependencies in `package.json`:

- TypeScript 6 release gate
- Optional TypeScript 7 + native-preview lane (informative only)
- citty
- Valibot
- Biome
- Oxlint
- Knip
- diff / jsdiff
- OSV
- Gitleaks or modern equivalent
- Standalone deterministic build path

## Boundary Rules

- `src/project-template/`: canonical exportable scaffold payload
- Runtime implementation remains in factory root and `cli/**`:
  - no `.agents/scripts` in template payload
  - no `.agents/runtime` in template payload
  - no `.agents/agents` in template payload
  - no Python/uv payload in template payload
- Root `.agents/wb/` remains factory workbench history, not downstream payload
- Template tests live in CLI layer; template is not a runtime test host

## Runtime / Tooling Surface

- Canonical governance: `AGENTS.md`, `.agents/*` in factory
- Primary command runtime: `afol` (shell entrypoint), Bun + TypeScript CLI under
  `cli/**`
- Additional docs-facing adapter behavior documented through repository mirrors
  and local runtime surfaces where configured

## Verification Stack

- Docs/prompt/process: `just lint` (when required by validation scope)
- CLI checks: `bun run typecheck` and `bun test`
- Focused template policy checks:
  `bun test cli/tests/template-policy.test.ts cli/tests/bootstrap-template-cleanliness.test.ts`
- Template cleanliness checks are driven by `template-policy` schema and tests
