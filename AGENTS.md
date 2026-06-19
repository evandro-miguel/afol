# AGENTS.md

This repository is AFOL-only.

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

Retained `.agents` content is limited to provider-facing metadata and
project-local skills:

- `.agents/config.json`
- `.agents/lock.json`
- `.agents/manifest.json`
- `.agents/skills/**`

AFOL-owned static governance payloads live under `.afol/adm/**`, including:

- `.afol/adm/hooks/**`
- `.afol/adm/rules/**`
- `.afol/adm/source/**`
- `.afol/adm/tools.json`

Project-local hooks under `.afol/adm/hooks/**` are static, provider-neutral
context contribution metadata only. They do not execute scripts, install
plugins, mutate lifecycle state, or restore discontinued `.agents` runtime
surfaces.

Mutable AFOL state belongs under `.afol/`, including workbench sessions,
events, indexes, mutations, temporary files, benchmark catalog/results, and
migration archives.

Project-local provider skills live under `.agents/skills/**`.
Do not create or use `.afol/skills/**`; `.afol/**` is mutable runtime state,
not a project-local skills root.

## Project RAG

- Project RAG id: `md72gw7nfa3n1dfd12cqzgwa9d88t1q5`
- Project RAG slug: `main-dev`
- Indexed root: `/home/ozy/apps/agentic_start_folder/.worktree/main_dev`
- Indexed include roots: `cli`, `src`, `docs`, `.afol`, `.agents`
- Critical read-only checks:
  - `ragctl project verify --project main-dev --json`
  - `ragctl project search --project main-dev "<query>" --mode vector --json`
  - `ragctl project file --project main-dev --file <repo-relative-path> --json`

Large AFOL changes must verify that the durable universal
`agentic-folder-sys` skill in `/home/ozy/apps/universal-skills` is current
before relying on or propagating project-local AFOL guidance. If the AFOL
behavior changed, update and sync the universal skill first.

Target governance layout:

- `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy, and
  desired-state administration.
- `.afol/pstr/**`: current project-structure maps only. No scripts, task
  execution, automations, roadmap, specs, or future-state governance.
- `.afol/wb/**`: execution sessions. Do not create a workbench session for
  small docs/spec direction edits unless the user explicitly asks for governed
  execution evidence.

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

## Token Economy (HARD RULE — never abuse tokens)

AFOL is a low-token system by design. Token economy is mandatory, not optional.

- Any single `afol` command emitting **>5,000 output tokens is non-ideal**;
  **>10,000 output tokens is prohibited**. `afol validate bench` enforces this
  automatically — a scenario exceeding 10k tokens FAILS the bench; 5k–10k
  warns. Do not merge a command that violates this.
- Use the **compact/default** form of every command. Only pass `--verbose`
  when you specifically need the full manifest/diff for a concrete reason.
- `afol up check` returns a compact summary (revisions, counts, conflict
  names). `afol up preview` and `--verbose` carry the full file-by-file
  manifest and are token-heavy — use them only when an update conflict
  genuinely requires inspecting every changed file.
- Do **not** pipe large `--json` payloads into your own context. If you need
  one field, target it; otherwise prefer the human-readable compact form.
- Treat any `afol` command that emits >5k tokens by default as a BUG and fix
  the command. The bench guard will already be failing it.

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
