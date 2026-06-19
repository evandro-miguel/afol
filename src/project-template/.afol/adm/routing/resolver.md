# Resolver routing

Scope: canonical-layout routing reference; verify path existence before load.

## Signals

| task signal | load |
| --- | --- |
| rules or skills | `.afol/adm/rules/README.md`, configured `paths.skills_dir` |
| tools or commands | `afol schema resolver --json`, `afol validate project` |
| adm or routing docs | `.afol/adm/**` |
| pstr or surface maps | `.afol/pstr/**` generated maps |
| memory or library refs | `.afol/memory/memory.md`, `.afol/library/**` |
| validation or trust | `afol health`, `afol doctor --remediation-plan`, `afol validate project` |

## Rules

- Load the smallest rule set that matches the task surface.
- Prefer AFOL commands over direct edits for governed state.
- Do not load whole `.afol/library/**`, `.afol/memory/**`, or `.afol/wb/**` trees into context.

## Skills

- Use project-local skills only through configured `paths.skills_dir`.

## Tools

- `afol ctx bundle --explain --json`
- `afol pstr validate`
- `afol health --deep`
- `afol validate project --json`

## Validation commands

- `afol validate project --json`
