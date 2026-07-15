# Resolver routing

Target: .afol/adm/routing/resolver.md
Scope: canonical-layout routing reference; verify path existence before load.

## Signals
| task signal | load |
| --- | --- |
| rules or skills | `.afol/adm/rules/README.md`, `.afol/adm/rules/RULE-006-applicable-rule-resolution.md`, `.agents/skills/**` (if present) |
| tools or commands | `afol schema resolver --json`, `afol schema resolver --write`, `afol validate project` |
| adm or routing docs | `.afol/adm/doctrine/ARCHITECTURE.md#9.4-resolver`, `.afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md` |
| pstr or surface maps | `.afol/pstr/cli.md`, `.afol/pstr/docs.md`, `.afol/pstr/template.md`, `.afol/pstr/config.md` (generated; verify present) |
| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` (if present), `.afol/adm/specs/260612_global-project-research-library_spec-child_01.md` |
| validation or trust | `bun run typecheck`, `bun test cli/tests/schema-command.test.ts` |

## Rules
- `.afol/adm/rules/README.md`
- `.afol/adm/rules/RULE-006-applicable-rule-resolution.md`
- `.afol/adm/rules/RULE-004-validation-linting.md`
- `.afol/adm/rules/RULE-005-folder-structure.md`

## Skills
- global Codex `agentic-folder-sys` skill when available
- `.agents/skills/afol-integration-test/`
- `.agents/skills/typescript-expert/`
- `.agents/skills/javascript-testing-patterns/`
- `.agents/skills/bun-development/`

## Tools
- `afol schema resolver --json` -> inspect content
- `afol schema resolver --write` -> write the resolver atomically
- `afol validate project` -> project contract check
- `bun run typecheck` -> type safety
- `bun test cli/tests/schema-command.test.ts` -> command coverage

## ADM refs
- `.afol/adm/doctrine/ARCHITECTURE.md#9.4-resolver`
- `.afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md`
- `.afol/adm/specs/260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01.md`

## PSTR refs
- `.afol/pstr/cli.md`
- `.afol/pstr/docs.md`
- `.afol/pstr/template.md`
- `.afol/pstr/config.md`

## Memory refs
- `.afol/memory/memory.md`
- `.afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md`

## Library refs
- `.afol/library/**`
- `.afol/adm/specs/260612_global-project-research-library_spec-child_01.md`

## Validation commands
- `bun run typecheck`
- `bun test cli/tests/schema-command.test.ts`
- `afol validate project`
