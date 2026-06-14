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
- TypeScript: `^6.0.3` (`devDependencies.typescript`)
- Installed toolchain gate dependencies:
  - `citty` `^0.2.2`
  - `valibot` `^1.4.1`
  - `@biomejs/biome` `^2.4.16`
  - `oxlint` `^1.67.0`
  - `knip` `^6.15.0`
  - `diff` `^9.0.0`
- `osv-scanner` `2.3.8` installed in the user-local Go bin; release-security
  lane scans `bun.lock`
- `gitleaks` installed in the user-local Go bin; release-security lane scans
  tracked project content with `.gitleaks.toml` allowlists
- Bun test runner (`bun test`) for CLI and focused template-policy checks
- CLI command surface:
  - `afol` (public entrypoint, Bun/TypeScript implementation at `cli/main.ts`)
- Template-policy-based runtime hygiene:
  - `template:check` and `template:check`-adjacent tests in `package.json`
  - forbidden/allowed path patterns and forbidden-text scan in
    `cli/schemas/template-policy.ts`
- TypeScript compilation gate: `bun run typecheck` (`tsc --noEmit`)
- Toolchain gate scripts:
  - `bun run validate:toolchain` (Biome/Oxlint/Knip + diff libraries)
  - `bun run typecheck:ts7:informative` (TS7/native-preview lane, non-blocking)
- `bun run build:deterministic` for release-like frozen lockfile compile validation
- `bun run validate:security` for OSV/Gitleaks scans with graceful skip only when
  the external CLI is missing.

## Target Direction

Planned stack upgrades from DR are direction-only items unless marked implemented:
package dependencies in `package.json`:

- TypeScript 6 release gate (implemented in dependency baseline)
- Optional TypeScript 7 + native-preview lane (informative only, non-blocking)
- citty
- Valibot
- Biome
- Oxlint
- Knip
- diff
- OSV
- Gitleaks or modern equivalent
- Standalone deterministic build path

## CLI Tooling Decisions

- Parser/router baseline: `citty` is the preferred CLI parser layer for command
  and flag definitions because the project needs aliases, generated help, and
  typed command metadata from one registry.
- Native `util.parseArgs` remains acceptable only for tiny internal scripts
  where a full command registry would add noise.
- `meow`, Bunli, Ace CLI/Bejibun, and similar higher-level CLI frameworks are
  reference inputs, not adopted dependencies. They should not replace the local
  registry/router unless a future spike proves less code, better type safety,
  and no loss of noninteractive agent behavior.
- Interactive prompts, colors, and progress indicators are human-mode polish,
  not agent-mode defaults. Agent-facing commands must stay deterministic,
  compact, scriptable, and JSON-capable.

## Build And Distribution Direction

- Current release artifact target: `bun build --compile ./cli/main.ts --outfile
  dist/afol`, followed by `./dist/afol --help` smoke validation.
- `build:deterministic` is the release-floor command combining frozen install + compile.
- Reproducible install gate: CI and clean-smoke jobs should use
  `bun install --frozen-lockfile` so dependency resolution cannot mutate
  `bun.lock` during validation.
- Cross-target binaries are a future release lane, not a current readiness
  claim. Candidate targets are Linux x64/arm64, macOS arm64/x64, and Windows
  x64 after each target has native or VM-backed smoke evidence.
- macOS distribution must disclose notarization status until notarization is
  implemented. Homebrew taps and `curl | bash` installers remain future
  distribution channels after binary provenance, checksum, and smoke evidence
  exist.
- Node.js fallback is not part of the MVP. Treat it as a future contingency only
  if downstream users require a stability profile Bun cannot satisfy.

## Boundary Rules

- `src/project-template/`: canonical exportable scaffold payload
- Runtime implementation remains in factory root and `cli/**`:
  - no `.agents/scripts` in template payload
  - no `.agents/runtime` in template payload
  - no `.agents/agents` in template payload
  - no Python/uv payload in template payload
- Root `.afol/wb/` remains factory workbench history, not downstream payload
- Template tests live in CLI layer; template is not a runtime test host

## Runtime / Tooling Surface

- Canonical governance: `AGENTS.md`, `.afol/adm/**` (doctrine, decisions,
  roadmap, specs), `.afol/pstr/**` (structure maps), `.afol/wb/**` (workbench)
- Primary command runtime: `afol` (Bun/TypeScript implementation at `cli/**`)
- Retained static metadata: `.agents/config.json`, `.agents/lock.json`,
  `.agents/manifest.json`, `.agents/rules/`, `.agents/source/`
- Additional docs-facing adapter behavior documented through repository mirrors
  and local runtime surfaces where configured

## Verification Stack

- Docs/prompt/process: `just lint` (when required by validation scope)
- CLI checks: `bun run typecheck` and `bun test`
- Focused template policy checks:
  `bun test cli/tests/template-policy.test.ts cli/tests/bootstrap-template-cleanliness.test.ts`
- Template cleanliness checks are driven by `template-policy` schema and tests
