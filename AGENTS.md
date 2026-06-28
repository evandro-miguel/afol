# AGENTS.md

This repository is AFOL-only.

Use `afol` for every supported scaffold, workbench, validation, update,
evidence, and lifecycle operation. The current implementation lives in
`cli/**`, and the exportable downstream scaffold lives in `src/project-template/`.

Downstream projects must not receive a project-local `afol` executable,
wrapper, symlink, package bin, or command runner. `afol` is an external
operator command provided outside the target project; the downstream project
payload is config, provider metadata, governance docs, and AFOL state/docs only.
The root `./afol` file is allowed only in this source repository as the
development/package entrypoint.

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

- `.agents/lock.json`
- `.agents/manifest.json`
- `.agents/skills/**`

AFOL project configuration lives at `.afol/config.json`. Existing
`.agents/config.json` files are legacy fallback inputs only and must not be
described as the canonical config location.

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

- Status: stale after repo/path/branch rename on 2026-06-26. Do not rely on
  Project RAG until reindexed and verified.
- Intended Project RAG slug: `afol-dev`.
- Intended indexed root: `/home/ozy/01_projects/dev/afol/afol.dev`.
- Indexed include roots: `cli`, `src`, `docs`, `.afol`, `.agents`.
- Critical read-only checks after reindex:
  - `ragctl project verify --project afol-dev --json`
  - `ragctl project search --project afol-dev "<query>" --mode vector --json`
  - `ragctl project file --project afol-dev --file <repo-relative-path> --json`

Large AFOL changes must verify that the durable universal
`agentic-folder-sys` skill in
`/home/ozy/01_projects/dev/universall-skill-sys-pvt` is current before
relying on or propagating project-local AFOL guidance. If the AFOL behavior
changed, update and sync the universal skill first.

Target governance layout:

- `.afol/adm/**`: project direction, roadmap, specs, ADRs, strategy, and
  desired-state administration.
- `.afol/pstr/**`: current project-structure maps only. No scripts, task
  execution, automations, roadmap, specs, or future-state governance.
- `.afol/wb/**`: execution sessions. Do not create a workbench session for
  small docs/spec direction edits unless the user explicitly asks for governed
  execution evidence.

Workflow/template routing:

- Use `docs/standards/workflow.md` for the canonical workflow sequence.
- Use `docs/standards/decision-intake.md` for decision intake; it is a
  standard, not a template.
- Use `docs/templates/**` for workflow artifact shapes such as roadmap, spec,
  spec-child, spec-test, plan, task, log, report, postmortem, retrospective,
  ADR, architecture, pattern, and structure.
- The local `agentic-folder-sys` skill must point to this template map instead
  of carrying a stale partial template list.

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

Task state source of truth:

- In `.afol/wb/**`, the task state source of truth is the `State Board` table.
- Do not add parallel `Task List` checkboxes for `T-xx` tasks in workbench task
  files. They are legacy-compatible input and can create duplicate/stale task
  state.
- Use `afol start`, `afol evidence`, `afol done`, `afol close`, and
  `afol verify-tasks --strict` to mutate or verify lifecycle state.
- If a task file contains both `State Board` rows and `- [ ] T-xx` checklist
  rows, treat that as drift: reconcile back to the canonical `State Board`
  before closing.

## Delivery Rules

- Meaningful change -> map to `.afol/adm/roadmap/GENERAL-ROADMAP.md`.
- Roadmap feature -> map to one governing parent spec in `.afol/adm/specs/`.
- Implementation decomposition needed -> use child specs.
- Workbench sessions must carry `roadmap_feature` and `parent_spec`.
- Plans/tasks execute approved intent. They do not replace roadmap/spec
  definition.
- Non-trivial work -> use `.afol/wb/` for durable execution artifacts.
- Session creation/metadata -> use repo automation through `afol`.
- Managed `updated_at` fields -> do not edit manually.
- Reports -> evidence-based. Done means validated, not merely edited.
- User correction -> create one lesson entry under `docs/lessons/entries/`.

## Branch And Deploy

- Agent commits/pushes target `dev` unless the user explicitly requests a
  different branch in the current turn.
- `main` -> never direct-push.
- Updating `main` -> merge from `dev` through normal Git merge or PR path.
- Production deploy -> forbidden unless the user explicitly asks in the current
  turn.
- Forbidden without explicit deploy request -> `bun run deploy`,
  `wrangler deploy`, and any Cloudflare publish command.
- Validation stops at local gates unless deploy is explicitly requested:
  `make lint`, `bun run typecheck`, `bun test`, `bun run build`, or the
  narrowest project script.
- Deploy readiness requested -> report exact deploy command and required
  environment; leave execution to the user.

## Execution Discipline

- Before editing -> read relevant local files. Ground claims in live repo
  evidence, not stale memory.
- Bug fix -> reproduce or identify failure mode first. Then fix. Then verify
  the same path when validation is in scope.
- Ambiguity affects correctness -> ask briefly before editing.
- Scope -> surgical. Solve requested problem, match local style, avoid
  speculative abstractions.
- Adjacent code -> do not improve comments/formatting/structure unless required
  by the current change.
- User changes -> do not revert user changes, destructive Git state, or
  unrelated dirty files unless explicitly requested.
- Product canon violation -> push back.
- Current change creates unused code/styles/imports/files -> remove them.

## Tool Selection For Discovery

Use the narrowest tool that answers the question.

- Exact text, paths, config keys, JSON -> `rg`, `fd`, `jq`.
- First-slice repo analysis, routes, fetch surfaces, schemas, daily checks ->
  `ca` when available.
- Docker-backed focused analysis -> `./scripts/run-toolbox.sh` with bounded
  `analysis-*` command when present.
- Syntax-aware search or codemods -> `ast-grep`.
- JS/TS unused files, exports, dependencies -> `knip` or equivalent bounded
  analysis wrapper when present.
- Compact repo context packaging -> `repomix`, `yek`, or `gitingest` only when
  snapshot materially helps.
- Canonical overview refresh -> full repo-map regeneration only when
  `.afol/pstr/` or overview docs need to change.
- Generated output -> treat `dist`, `build`, `coverage`, `.next`, and
  `.vercel/output` as noise unless user asks about generated artifacts.
- MCP tool changes -> restart MCP client/server session because schemas load at
  process start.

## Validation And Security

- Normal code change -> minimum gate is the narrowest relevant local check; use
  `make lint` when the repo exposes it.
- Use focused validation as appropriate: lint, typecheck, tests,
  content/schema validation, link validation, browser smoke, build, screenshots.
- Behavior change -> add or update focused tests when the repo already has an
  appropriate test surface.
- Before calling done -> ask whether the result would survive strict technical
  and commercial review.
- Every security check -> include secret scanning and dependency vulnerability
  scanning.
- Secret scanning -> use Gitleaks over Git history and current worktree with
  redaction enabled.
- Dependency vulnerability scanning -> use OSV Scanner; if OSV cannot read
  `bun.lock`, state the limitation and use the narrowest practical fallback.
- Secrets -> never print secret values in terminal output, reports, docs, or
  summaries.
- Temporary scanner reports -> store only under ignored paths such as
  `tmp/security-audit/`.

## Repository Hygiene

- New versioned root files -> avoid unless project entrypoint, standard config,
  or explicitly justified.
- Local `.env` files -> allowed only as ignored, non-versioned files. Do not
  loosen secret access or commit runtime auth state.
- Screenshots/images -> `.afol/wb/screenshots/` or `tests/screenshots/`.
- Temp files -> `tmp/` or `.tmp_<name>/`.
- Build artifacts -> `dist/`.
- Workbench artifacts -> `.afol/wb/<session>/`.
- Local auxiliary worktrees -> grouped Worktrunk siblings such as
  `~/01_projects/dev/<repo>/<repo>.dev`, unversioned.
- Legacy nested `.worktree/` directories may stay ignored during migration; do
  not create new nested worktrees.
- Script incidental output -> never root. If it happens, treat as script bug and
  fix script.
- Root pollution check -> use AFOL validation, such as
  `afol validate project --check-drift --json`; do not use legacy
  `.agents/scripts` runners.
- Archive before delete -> `.afol/data/migrations/` or another AFOL-owned
  archive path.
- User data -> never delete or move vault content, backups, keys, secrets,
  archives, Windows profile data, or other user data without explicit approval.

## Runtime, Skills, Memory

- `.codex/` and `.claude/` -> keep thin when present.
- `AGENTS.md` -> canonical runtime contract.
- Claude adapter -> optional and controlled by `.afol/config.json` with legacy
  `.agents/config.json` fallback; when disabled, do not create or sync
  `CLAUDE.md` or `.claude/**`.
- Repository artifacts -> English by default.
- Portuguese -> only when explicitly requested by user.
- Skills -> prefer repo-local `.agents/skills/`.
- Machine-global skills -> secondary to repo-local guidance.
- Project-local skills -> do not delete only because a global/universal version
  exists.
- Skill drift -> classify first, then ask explicit confirmation before removal.
- AFOL/workbench operations -> use global `agentic-folder-sys` when available.
- External memory -> auxiliary retrieval only.
- Repo-local canon and workbench artifacts -> authoritative.

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
- For `.afol/adm/rules/**`, YAML frontmatter is metadata only. Rule character
  budgets and prompt injection count/use only the Markdown body after
  frontmatter; put enforceable agent guidance in the body, not duplicated YAML.
- Prefer the shortest unambiguous AFOL command form for routine lifecycle work,
  especially in orchestrated handoffs. Use long flags only when clarity,
  safety, or ambiguous aliases require them.
- When the global `afol` binary is stale and the local kernel must be used,
  keep the local prefix but still use compact subcommands where practical, for
  example `bun run kernel -- vf <session> --strict` instead of a verbose
  equivalent.
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
