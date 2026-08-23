# AGENTS.md

## Current Execution Priority

- This repository is already AFOL-only for active workflows. Use `afol` and
  keep mutable state in `.afol/**`, especially `.afol/wb/**`; do not reopen a
  general migration track.
- Do not use as active flow: `.agents/agents`, `.agents/scripts`,
  `.agents/runtime`, `.agents/wb`, `.agents/z-arq`, `agents.config`, or
  `legacy:` routes.
- For F-31, AFOL consumes external receipts validated against fixed harness
  tool profiles. AFOL never selects, calls, schedules, retries, or supervises
  models; the external harness owns model execution.
- Before implementing product, inventory any legacy references and replace
  active docs, scripts, and runbooks with the current AFOL flow.

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

When installing AFOL into the current system, install the compiled CLI binary
globally at `$HOME/.local/bin/afol`. Do not satisfy an install request by
syncing a worktree, changing a wrapper, or pointing a symlink/script at this
repository. The installed command must be a real executable in the system bin
folder; validate with `command -v afol`, `test ! -L "$(command -v afol)"`,
`afol --version`, and a smoke command outside the repository.

Global installation or promotion is allowed only from code already integrated
into `main` and only when the user explicitly requests the install. Never
install, replace, copy, or promote `$HOME/.local/bin/afol` from `dev`, a feature
branch, or an unmerged worktree. The global binary may intentionally lag `dev`;
that difference is not development drift. Validate development changes through
the repo-local kernel or a repo-local build artifact.

Development and test workflows may still call AFOL from this source repository,
for example through `./afol`, `bun run kernel`, `bun run build && ./dist/afol`,
or a differently named local helper. Label that as repo-local development
usage, not as a system/global install, and never let it replace the global
`afol` command contract above.

The old `.agents` command system is discontinued and must not be used,
documented, restored, or extended:

- no `.agents/agents` wrapper
- no `.agents/scripts` Python command runner
- no `.agents/runtime` Python runtime or MCP compatibility layer
- no `.agents/wb` workbench history as active state
- no `.agents/z-arq` archive surface
- no `agents.config` YAML fallback
- no `legacy:` command routing or delegate fallback

Retained `.agents` content is limited to provider-facing metadata and optional
project-local skills:

- `.agents/lock.json`
- `.agents/manifest.json`
- `.agents/skills/**`

AFOL project configuration lives at `.afol/config.json`. Existing
`.agents/config.json` files are legacy fallback inputs only and must not be
described as the canonical config location.

`.afol/state/afol.db` is SQLite v1 and materializes workbench sessions, task
rows, source hashes, and evidence only. Broader `adm/pstr/memory/library/ctx`
materialization belongs to State DB v2/future.

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

Project-local provider skills may live under `.agents/skills/**` when they are
specific to this repo. Do not vendor `agentic-folder-sys` there; use the global
Codex skill when available.
Do not create or use `.afol/skills/**`; `.afol/**` is mutable runtime state,
not a project-local skills root.

## Project RAG

- This `afol-public` worktree is live state, not a static readiness claim:
  Postgres id `2423`, slug `afol-afol-public`. Run
  `ragctl project verify --project afol-afol-public --json` immediately before
  trusting indexed results from this checkout.
- Indexed root: `/home/ozy/01_projects/dev/afol/afol.afol-public`.
- The factory `dev` worktree remains a separate index: Postgres id `1707`,
  slug `afol-dev`, root `/home/ozy/01_projects/dev/afol/afol.dev`. Do not mix
  the two when searching.
- Include roots (platform rejects leading-dot dirs): `cli`, `src`, `docs`.
  Do not pass `.afol` or `.agents` as include roots; Project RAG forbids them.
- This scope leaves a deliberate hidden-administration gap: `.afol/adm/**`
  (including specs, doctrine, and release policy) and `.agents/**` are not in
  the Project RAG corpus. Read those paths directly from the checkout; an
  indexed search result cannot prove their current contents or absence.
- Allowlist (blocked findings suppressed):
  - `cli/generated` (`generated_dir`)
  - `src/project-template/.afol/tmp` (`temp_dir`)
- `docs/templates/*.md` symlinks may report
  `PROJECT_INDEX_SCOPE_DRIFT` because inventory expects the link path while
  content is already indexed via `src/project-template/docs/templates/**`.
  Treat this as non-blocking only when the current verifier marks it so; do
  not infer current index health from this note.
- If verification reports stale or missing indexed files, perform a bounded
  manual delta reingest from the `rag-v2` checkout, then verify again. Use a
  reviewed positive cap and repeat while the verify result remains stale; do
  not use a watcher or make resident MCP/core startup a dependency:

  ```bash
  cd "${RAG_REPO_ROOT:?set RAG_REPO_ROOT to the rag-v2 checkout}"
  bun run ingest-project \
    --root /home/ozy/01_projects/dev/afol/afol.afol-public \
    --include cli,src,docs --max-files 100
  ragctl project verify --project afol-afol-public --json
  ```

  Use `register-project` only when the repository is not registered. Reserve
  `--force` for an explicitly owned full rebuild; it is not the normal stale
  index repair. Project RAG watchers are removed, so freshness is operator
  checked and manually repaired rather than continuously synchronized.
- Critical read-only checks:
  - `ragctl project verify --project afol-dev --json`
  - `ragctl project search --project afol-dev "<query>" --mode hybrid --json`
  - `ragctl project file --project afol-dev --file <repo-relative-path> --json`
- Semantic repository discovery uses Project RAG only. Use the global
  `evandro-rag-system` skill and `ragctl` for semantic navigation; use `rg` and
  focused source reads to confirm exact implementation facts. A stale,
  missing, or out-of-scope result is orientation only, never proof.

Large AFOL changes should use the global Codex `agentic-folder-sys` skill when
available. Do not require or restore a project-local
`.agents/skills/agentic-folder-sys` copy; stale local copies have caused
version drift.

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
- Global skill guidance may reference this template map, but the repo/template
  must not carry a project-local `agentic-folder-sys` skill copy.

Canonical commands (agent **fast path** — prefer when active/bound session
resolves; see F-03 and
`.afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md`):

```bash
afol s
afol v project
afol validate bench --pack <pack-id> --json
afol qt <theme> -t "<task>" -c "<cmd>"
afol qt <theme> -t "a" -t "b" -c "<shared-cmd>"
afol n <theme> -F <F-id> -P <spec-id> -t "<task>"
afol st T-01
afol e T-01 -c "<cmd>" -o passed
afol d T-01 -x "<cmd>"
afol tr T-01 --state problem -r "<concrete blocker>"
afol st T-01..T-10
afol d T-01..T-10 -x "<shared-cmd>"
afol c
afol up check
afol up preview
afol up apply --dry-run
```

- Prefer `afol qt` for micro one-shot work (create→start→one verify→done→close).
- Multi-task micro path: repeat `-t`/`--task`; one shared `-c`/`--command` verifies all.
- When `qt` is not enough, multi-task slices still use `n` → `st` → `d -x` → `c`.
- Hygiene warnings (`afol health`, maintenance, open `pending_spec`, stale
  reviews) must not stop feature lifecycle mid-delivery. Hard lifecycle blocks
  remain: done without observed evidence, close with open tasks, CI ambiguous
  session, corrupt context binding (repair with `afol catchup --fix`).

Explicit multi-agent / CI path (when session is ambiguous or global fallback
is disabled):

```bash
afol st -S <session-id> -T T-01
afol e -S <session-id> -T T-01 -c "<cmd>" -o passed
afol d -S <session-id> -T T-01 -x "<cmd>"
afol c -S <session-id>
```

Long human forms (`afol start --session … --task-id …`) remain valid; do not
prefer them for routine agent tool calls.

Agent-facing JSON commands:

```bash
afol s -j
afol status --task-id <task-id> --json
afol status --health --json
afol health --json
afol health full --json
afol health --area <adm|pstr|wb|memory|library|state|ctx|token_budget> --json
afol ctx bundle --json --summary
afol project-benchmark validate --json
afol local-state rebuild --json
```

- `afol status --task-id <task-id> --json` exits `1` with
  `task-not-found` when the explicit task id is absent.
- `afol new ... --json` includes `governance_status` with value
  `"governed"`, `"pending_spec"`, or `"unbound"`.
- `afol project-benchmark ... --json` includes `catalog_source` with value
  `"project"` or `"builtin"`.

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
- `afol n` without `-F`/`-P` creates with `pending_spec` plus warnings
  (allowed); open pending specs do not block other new sessions.
- If supplied governance metadata cannot resolve against the catalog, `afol n`
  and `afol qt` create a `pending_spec` session with the resolution error
  instead of blocking delivery. Activate a planned feature with `afol gov af -F
  <F-id>`; active is a no-op and final features are not reopened. A final
  parent may resolve through one active residual child.
- A `pending_spec` session may continue lifecycle (`start`, `evidence`,
  `done`, `close`) with warnings, and close is allowed; `afol status` and
  `afol validate project` warn while pending specs are open.
- Resolve with short path: `afol gov rs -S <id> -F <F-id> -P <spec-id>`
  (`-S` optional when active/bound); waive `afol gov rs -S <id> --no-spec-required -r "<reason>"`.
- Bulk-waive open pending_spec (default limit 20): `afol gov bw --reason "<text>"`
  or explicit sessions `afol gov bulk-waive --reason "<text>" --session <id> [...]`.
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
- `dev` never installs or promotes the global AFOL binary. Global promotion is
  a separate, explicitly requested operation performed only after the code is
  integrated into `main`.
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
- Skills -> prefer repo-local `.agents/skills/` only for project-specific
  behavior.
- Machine-global skills -> preferred for universal AFOL/workbench behavior.
- Project-local skills are optional; do not keep stale local copies of global
  AFOL skills.
- Skill drift -> classify first, then ask explicit confirmation before removal.
- AFOL/workbench operations -> use global `agentic-folder-sys` when available.
- External memory -> auxiliary retrieval only.
- Repo-local canon and workbench artifacts -> authoritative.

## Token Economy (HARD RULE — never abuse tokens)

AFOL is a low-token system by design. Token economy is mandatory, not optional.
Priorities: **extreme ease of use**, **extremely low latency**, **low write
tokens** (commands you author), **low forced output tokens** (stdout you must
read), **very high reliability**. Write tokens are worse than read tokens.

- **Write path:** prefer short aliases and omit session when active/bound
  session resolves (`afol st T-01`, `afol d T-01 -x "<cmd>"`, `afol c`). Do not
  repeat long `--session <id>` on every step unless CI/multi-agent ambiguity
  requires `-S`. Prefer `d -x` over separate evidence + done when one
  verification command is enough. When multiple execution-policy tasks share
  one verification, use `st T-01..T-10` and
  `d T-01..T-10 -x "<shared-cmd>"`; AFOL runs the check once and records
  separate observed evidence per task.
- **Forced output:** any single `afol` command emitting **>5,000 output tokens
  is non-ideal**; **>10,000 output tokens is prohibited**. `afol validate
  bench` enforces this automatically — a scenario exceeding 10k tokens FAILS
  the bench; 5k–10k warns. Do not merge a command that violates this.
- Use the **compact/default** form of every command. Only pass `--verbose` or
  `--full` when you specifically need the full manifest/diff for a concrete
  reason.
- `afol up check` returns a compact summary (revisions, counts, conflict
  names). `afol up preview` and `--verbose` carry the full file-by-file
  manifest and are token-heavy — use them only when an update conflict
  genuinely requires inspecting every changed file.
- Do **not** pipe large `--json` payloads into your own context. If you need
  one field, target it; otherwise prefer the human-readable compact form.
- For `.afol/adm/rules/**`, YAML frontmatter is metadata only. Rule character
  budgets and prompt injection count/use only the Markdown body after
  frontmatter; put enforceable agent guidance in the body, not duplicated YAML.
- Prefer the shortest unambiguous AFOL command form for routine lifecycle work.
  Use long flags only when clarity, safety, multi-agent isolation, or
  ambiguous aliases require them.
- When the global `afol` binary is stale and the local kernel must be used,
  keep the local prefix but still use compact subcommands where practical, for
  example `bun run kernel -- vf <session> --strict` instead of a verbose
  equivalent.
- Treat any `afol` command that emits >5k tokens by default as a BUG and fix
  the command. The bench guard will already be failing it.
- Governing specs: F-03 parent + child
  `260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01`.

Before editing code, inspect the live repo state and use the smallest AFOL
validation that proves the change. For cross-cutting scaffold/release work, run:

```bash
afol local-state rebuild --json
afol validate project --json
bun run manifest:check
bun run typecheck
bun test
bun run validate:release
```

Do not reintroduce legacy fallback files or docs. If a useful old artifact is
found, move it into an AFOL-owned path under `.afol/` or convert it into the
TypeScript AFOL implementation.
