# Resolver routing

Scope: canonical-layout routing reference; verify path existence before load.

## Signals

| task signal | load |
| --- | --- |
| guidance or rules | `AGENTS.md`, `.afol/adm/rules/README.md`, resolved `.afol/adm/rules/**` |
| tools or commands | `afol help <command>`, `afol schema resolver --json`, `afol validate project` |
| adm or routing docs | `.afol/adm/**` |
| pstr or surface maps | `.afol/pstr/**` generated maps |
| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` |
| validation or trust | `bun run typecheck`, `bun test cli/tests/schema-command.test.ts` |

## Rules

- `.afol/adm/rules/README.md`
- `.afol/adm/rules/RULE-006-applicable-rule-resolution.md`
- `.afol/adm/rules/RULE-004-validation-linting.md`
- `.afol/adm/rules/RULE-005-folder-structure.md`

## Guidance

- read `AGENTS.md` before editing
- resolve applicable `.afol/adm/rules/**` before choosing a workflow
- use `afol help <command>` for current flags and side effects
- `.agents/skills/**` is optional and project-specific only
- `agentic-folder-sys` is not an active AFOL route or dependency

## Tools

- `afol schema resolver --json` -> inspect content
- `afol schema resolver --write` -> write the resolver atomically
- `afol validate project` -> project contract check
- `bun run typecheck` -> type safety
- `bun test cli/tests/schema-command.test.ts` -> command coverage

## Validation commands

- `bun run typecheck`
- `bun test cli/tests/schema-command.test.ts`
- `afol validate project`
