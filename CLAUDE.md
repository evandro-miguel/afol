# CLAUDE.md

This repository is AFOL-only. `CLAUDE.md` mirrors the root runtime guidance in
`AGENTS.md`.

Use `afol` for every supported scaffold, workbench, validation, update,
evidence, and lifecycle operation. The current implementation lives in
`cli/**`, and the exportable downstream scaffold lives in `src/project-template/`.

The old `.agents` command system is discontinued and must not be used,
documented, restored, or extended:

- no `.agents/agents` wrapper
- no `.agents/scripts` Python command runner
- no `.agents/runtime` Python runtime or MCP compatibility layer
- no `.agents/wb` workbench history as active state
- no `.agents/z-arq` archive surface
- no `agents.config` YAML fallback
- no `legacy:` command routing or delegate fallback

Retained `.agents` content is static scaffold metadata only:

- `.agents/config.json`
- `.agents/lock.json`
- `.agents/manifest.json`
- `.agents/rules/**`
- `.afol/skills/**`
- `.agents/source/**`

Mutable AFOL state belongs under `.afol/`, including workbench sessions,
events, indexes, mutations, temporary files, benchmark catalog/results, and
migration archives.

Canonical commands:

```bash
afol status
afol validate project
afol validate bench --pack <pack-id> --json
afol new <theme> --feature-id <F-id> --parent-spec <spec-id>
afol start --session <session-id> --task-id <task-id>
afol evidence --session <session-id> --task-id <task-id> --command "<cmd>" --result passed
afol done --session <session-id> --task-id <task-id>
afol close --session <session-id>
afol update check
afol update preview
afol update apply --dry-run
```

Before editing code, inspect the live repo state and use the smallest AFOL
validation that proves the change. For cross-cutting scaffold/release work, run:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```

Do not reintroduce legacy fallback files or docs. If a useful old artifact is
found, move it into an AFOL-owned path under `.afol/` or convert it into the
TypeScript AFOL implementation.
