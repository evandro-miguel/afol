# Resolver routing

Target: .afol/adm/routing/resolver.md
Scope: canonical-layout routing reference; verify path existence before load.

## Signals
| task signal | load |
| --- | --- |
| rules or skills | `.agents/rules/README.md`, `.agents/rules/RULE-006-applicable-rule-resolution.md`, `.afol/skills/**` (if present) |
| tools or commands | `afol schema resolver --json`, `afol schema resolver --write`, `afol validate project` |
| adm or routing docs | `docs/arc/ARCHITECTURE.md#9.4 Resolver`, `docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md` |
| pstr or surface maps | `.afol/pstr/cli.md`, `.afol/pstr/docs.md`, `.afol/pstr/template.md`, `.afol/pstr/config.md` (generated; verify present) |
| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` (if present), `docs/arc/SPECS/260612_global-project-research-library_spec-child_01.md` |
| validation or trust | `bun run typecheck`, `bun test cli/tests/schema-command.test.ts` |

## Rules
- `.agents/rules/README.md`
- `.agents/rules/RULE-006-applicable-rule-resolution.md`
- `.agents/rules/RULE-004-validation-linting.md`
- `.agents/rules/RULE-005-folder-structure.md`

## Skills
- `.afol/skills/agentic-folder-sys/`
- `.afol/skills/afol-integration-test/`
- `.afol/skills/typescript-expert/`
- `.afol/skills/javascript-testing-patterns/`
- `.afol/skills/bun-development/`

## Tools
- `afol schema resolver --json` -> inspect content
- `afol schema resolver --write` -> write the resolver atomically
- `afol validate project` -> project contract check
- `bun run typecheck` -> type safety
- `bun test cli/tests/schema-command.test.ts` -> command coverage

## ADM refs
- `docs/arc/ARCHITECTURE.md#9.4 Resolver`
- `docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md`
- `docs/arc/SPECS/260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md`

## PSTR refs
- `.afol/pstr/cli.md`
- `.afol/pstr/docs.md`
- `.afol/pstr/template.md`
- `.afol/pstr/config.md`

## Memory refs
- `.afol/memory/memory.md`
- `docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md`

## Library refs
- `.afol/library/**`
- `docs/arc/SPECS/260612_global-project-research-library_spec-child_01.md`

## Validation commands
- `bun run typecheck`
- `bun test cli/tests/schema-command.test.ts`
- `afol validate project`
