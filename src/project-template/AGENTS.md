# AGENTS.md

## Project Overview

`{project_name}` uses `afol` for LLM-assisted delivery.
Replace this section after bootstrap with real product purpose and constraints.

## Template Boundary

- This repository was created from the minimal scaffold template.
- The template owns local protocol files only: `AGENTS.md`,
  `.afol/config.json`, `.agents/lock.json`, `.agents/manifest.json`,
  `.afol/adm/hooks/`, `.afol/adm/rules/`, optional `.agents/skills/` baseline,
  `.afol/wb/` baseline, and minimal docs.
- The template must not include a project-local `afol` executable, shell
  wrapper, symlink, package bin, shortcut alias, task-runner shim, or command
  runner.
  `afol` must resolve from the operator environment outside this project.
- Some sandbox providers make `.agents/` read-only. When this project was
  initialized with `afol init --provider-compatible`, mutable agent state lives
  under `.afol/`.
  Always read `.afol/config.json` `paths.*` before hardcoding state paths.
- The configured plan directory in a downstream project is that project's
  durable governed plan state. It defaults to `.afol/wb/`. Active-session
  pointers and local runtime state live under the configured mutable directory,
  which defaults to `.afol/`. The plan directory must start from the template baseline
  and must not include factory repo history, root workbench sessions,
  active-session pointers, caches, telemetry events, benchmark results, or
  development-only evidence.
- `.afol/state/afol.db` is SQLite v1 and materializes workbench sessions, task
  rows, source hashes, and evidence only. Broader `adm/pstr/memory/library/ctx`
  materialization belongs to State DB v2/future.
- If a future update proposes broad docs, source seeds, factory tests, caches,
  or root `.agents/wb/` legacy history, treat that as export drift and reject it until
  the scaffold manifest and docs explicitly justify the payload.

## Governed Execution

- Use the configured plan directory when work includes implementation,
  validation, or delivery.
- Before product edits: create/target a session and move task to `in_progress`.
- Canonical agent fast path (prefer when active/bound session resolves):
  1. `afol n {theme} -F {F-id} -P {spec-id} -t "<task>"`
  2. `afol st T-01`
  3. Edit and run named verification.
  4. `afol d T-01 -x "<verification command>"`
  5. `afol c`
- When execution-policy tasks share one verification, batch them with
  `afol st T-01..T-10`, then
  `afol d T-01..T-10 -x "<shared verification command>"`.
- Explicit multi-agent/CI path when session is ambiguous:
  `afol st -S {session-id} -T T-01`, then `afol d -S {session-id} -T T-01 -x "…"`,
  then `afol c -S {session-id}`.
- Prefer short commands; long forms remain valid for humans/audits.
- Use `afol` as the only downstream front door.
  It is an external command, not a repository-local file.
- Planning-only or read-only questions stay in chat unless durable artifacts
  are required.

## Agent-Facing Commands

Use compact output by default. Use JSON only when a tool needs fields.

```bash
afol status --json
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

## Delivery Rules

- Meaningful change -> map to the configured roadmap under `.afol/adm/`.
- Roadmap feature -> map to one governing parent spec under `.afol/adm/specs/`.
- Implementation decomposition needed -> use child specs.
- Workbench sessions must carry `roadmap_feature` and `parent_spec`.
- Current `pending_spec` sessions may continue with warnings, but new sessions
  are blocked while any pending spec is open. Resolve with
  `afol governance resolve-spec --session <id> --feature-id <F-id> --parent-spec <spec-id>`
  or waive with `--no-spec-required --reason "<reason>"`.
- Plans/tasks execute approved intent. They do not replace roadmap/spec
  definition.
- Non-trivial work -> use `.afol/wb/` for durable execution artifacts.
- Session creation/metadata -> use `afol`.
- Managed `updated_at` fields -> do not edit manually.
- Reports -> evidence-based. Done means validated, not merely edited.
- User correction -> create one lesson entry under `docs/lessons/entries/`.

## User Journeys

- Critical user or agent flows must be registered through roadmap, spec,
  spec-test, and evidence.
- Use `docs/templates/ux-journey.md` for complex multi-step flows.
- Command changes must document expected output, failure/recovery behavior, and
  validation path before claiming the flow works.
- Do not claim a journey is production-tested without saved validation,
  benchmark, or workbench evidence.

## Branch And Deploy

- Agent commits/pushes target `dev` unless the user explicitly requests a
  different branch in the current turn.
- `main` -> never direct-push.
- Updating `main` -> merge from `dev` through normal Git merge or PR path.
- Production deploy -> forbidden unless the user explicitly asks in the current
  turn.
- Forbidden without explicit deploy request -> `bun run deploy`,
  `wrangler deploy`, and any Cloudflare publish command.
- Deploy readiness requested -> report exact deploy command and required
  environment. Leave execution to the user.

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.afol/config.json`: path contract. Check `paths.mutable_dir`, `paths.wb_dir`,
  `paths.skills_dir`, `paths.tmp_dir`, and `paths.data_dir` before writing
  agent-owned state.
- `.afol/adm/hooks/`: static provider-neutral hook catalog. Hooks may contribute
  context messages and advisory refs; they must not execute scripts or mutate
  AFOL state.
- `.afol/adm/rules/`: local operational contracts only.
- `.agents/skills/`: optional project-local provider skills only when needed.
  `paths.skills_dir` must stay here or in a child path; do not create
  `.afol/skills/`.
- `.afol/wb/` or configured `paths.wb_dir`: durable governed plan sessions
  for this downstream project only.
- `.afol/`: provider-compatible mutable state when configured; not a skills
  root.
- `.afol/adm/source/universal-skills/`: local seed, not nested git.
- `.afol/pstr/`: current-state structure maps only.
- `docs/`: project docs.

## Working Rules

- Read relevant local files before edits.
- Keep changes surgical.
- Prefer reuse/simplify/delete over new code.
- Do not add speculative features.
- Do not revert user/other-agent work without request.
- Reproduce bugs when practical and verify meaningful changes.
- Add one lesson in `docs/lessons/entries/` after user correction that
  prevents recurrence.
- Use English for repo artifacts unless user asks otherwise.

## Context And Tokens

- Use Caveman-style updates by default: concise, no filler, no repeated setup.
  Keep full precise prose when compression could hide risk, order, or evidence.
- Start narrow: `rg`, `fd`, focused reads, repo-analysis, Project RAG, GitNexus
  CLI, and existing `.afol/pstr/` maps before broad scans.
- Prefer repo-local configured plan state and `.afol/memory/` records
  before broad historical reads.
- Use RTK only for noisy shell output:
  `rtk git status`, `rtk find`, `rtk summary`, bounded `rtk grep`.
  Use `RTK.md` when present for detailed command policy.
- Keep raw output when exact lines or failure evidence matters.
- Stop context collection when it will not change decisions.

## Tool Routing

- Exact search/config: `rg`, `fd`, `jq`.
- Current structure: `.afol/pstr/` when present.
- Indexed/structured: use MCPs only when configured and narrower than local
  tools.
- Syntax search: `sg`/`ast-grep`.
- Repo history/context: `git`/`gh`; indexed graph/callers: GitNexus CLI.
- Browser/UI: `npx playwright` or `bunx playwright`; lightweight checks:
  `lightpanda`.
- Runtime/tasks: `bun`/`node`/`npm`, `afol`, and project-specific toolchains
  when present.
- Docs/ops: `markdownlint`/`lint-md`/`fix-md`/`validate-md`, `markitdown`,
  `yt-dlp`, `docker compose`, `tmux`.

## Planning And Evidence

- Use roadmap-first delivery for non-trivial features.
- Run the smallest decision-intake lane for ambiguous/product-shaped work.
- Plans must describe direct execution, not pre-plan research.
- Keep governed artifact count minimal: default is `plan + task`.
- Workbench task state lives in the `State Board` and AFOL lifecycle commands.
  Do not use `T-xx` checklist markers or checkbox-done language for lifecycle
  state.
- Governed sessions may enter `pending_spec`, but new sessions are blocked
  while open pending specs exist until they are resolved or waived.
- Use `afol start`, `afol evidence`, `afol done`, and `afol close`; `done`
  requires valid task-scoped evidence.
- Finalize optional artifacts before closure.

## Verification

- Never close work without proof.
- Gate selection:
  - docs/prompt/process -> `afol validate project`
  - front door/workbench -> `afol validate project`
  - scaffold/release -> `afol validate project --json`
- Run focused checks first; broaden only when risk requires.
- If runtime guidance changes, report runtime adapter/config sync status.

## Validation And Security

- Normal code change -> minimum gate is the narrowest relevant local check; use
  `make lint` when the repo exposes it.
- Use focused validation as appropriate: lint, typecheck, tests,
  content/schema validation, link validation, browser smoke, build, screenshots.
- Behavior change -> add or update focused tests when the repo already has an
  appropriate test surface.
- Every security check -> include secret scanning and dependency vulnerability
  scanning.
- Secrets -> never print secret values in terminal output, reports, docs, or
  summaries.

## Repository Hygiene

- New versioned root files -> avoid unless project entrypoint, standard config,
  or explicitly justified.
- Local `.env` files -> allowed only as ignored, non-versioned files.
- Screenshots/images -> `.afol/wb/screenshots/` or `tests/screenshots/`.
- Temp files -> configured `paths.tmp_dir` (default `.afol/tmp/`).
- Build artifacts -> `dist/`.
- Workbench artifacts -> `.afol/wb/<session>/`.
- Local auxiliary worktrees -> use the repository owner's configured external
  worktree root; do not create new nested worktrees inside this project.
- Legacy nested `.worktree/` directories may stay ignored during migration; do
  not create new nested worktrees.
- Script incidental output -> never root. If it happens, treat as script bug and
  fix script.
- User data -> never delete or move vault content, backups, keys, secrets,
  archives, Windows profile data, or other user data without explicit approval.

## Docs And Boundaries

- `docs/` is project documentation, not runtime state.
- Keep runtime state/caches/generated ops artifacts outside `docs/`.
- `.afol/adm/**` is AFOL administration and goal-state governance.
- `.afol/pstr/**` is descriptive current-state evidence only.
- `docs/arc/**`, when present in older downstream installs, is transitional
  governance content to migrate into `.afol/adm/**`.
- Use configured `paths.tmp_dir` only for disposable files.
- Do not manually edit managed `updated_at`; use a configured project command
  if this repo adds one.
- Keep project-local rules/docs minimal: only required operational contracts.
- In `.afol/adm/rules/**`, YAML frontmatter is metadata only. Rule budgets and
  prompt injection use only the Markdown body after frontmatter.
- Do not duplicate long rationale from canonical docs/skills; link to
  canonical source.

## Runtime And Skill Sync

- `AGENTS.md` is canonical runtime instructions.
- Runtime mirrors are adapter-owned, optional, and controlled by config. If an
  adapter is disabled, do not create or sync its mirror files.
- Keep enabled adapters thin and traceable.
- Prefer project-local skills only for project-specific behavior.
- Use global Codex skills for universal AFOL behavior when available; do not
  vendor `agentic-folder-sys` under `.agents/skills/`.
- Project-local skills are optional; use a native downstream sync command only
  when this repo provides one.
- External skill source updates are branch/PR flow; never direct to universal
  `main`.
- When local skill behavior changes, record pending propagation to
  universal-skills.

## Optional Memory

- Repo-local `.afol/wb/` and `.afol/memory/` are canonical when present.
- External memory is auxiliary retrieval only.
- Use host runtime memory only when it is explicitly configured.
