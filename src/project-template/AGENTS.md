# AGENTS.md

## Project Overview

`{project_name}` uses `afol` for LLM-assisted delivery.
Replace this section after bootstrap with real product purpose and constraints.

## Template Boundary

- This repository was created from the minimal scaffold template.
- The template owns local protocol files only: `AGENTS.md`,
  `.agents/config.json`, `.agents/lock.json`, `.agents/manifest.json`,
  `.agents/rules/`, `.agents/skills/` baseline, `.afol/wb/` baseline, and
  minimal docs.
- Some sandbox providers make `.agents/` read-only. When this project was
  initialized with `afol init --provider-compatible` or
  `afol init --mutable-dir .afol`, mutable agent state lives under `.afol/`.
  Always read `.agents/config.json` `paths.*` before hardcoding state paths.
- The configured plan directory in a downstream project is that project's
  durable governed plan state. It defaults to `.afol/wb/`. Active-session
  pointers and local runtime state live under the configured mutable directory,
  which defaults to `.afol/`. The plan directory must start from the template baseline
  and must not include factory repo history, root workbench sessions,
  active-session pointers, caches, telemetry events, benchmark results, or
  development-only evidence.
- If a future update proposes broad docs, source seeds, factory tests, caches,
  or root `.agents/wb/` legacy history, treat that as export drift and reject it until
  the scaffold manifest and docs explicitly justify the payload.

## Governed Execution

- Use the configured plan directory when work includes implementation,
  validation, or delivery.
- Before product edits: create/target a session and move task to `in_progress`.
- Canonical path:
  1. `afol n {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `afol st -S {session-id} -T T-01`
  3. Edit and run named verification.
  4. `afol d -S {session-id} -T T-01 -x "<verification command>"`
  5. `afol c -S {session-id}`
- Use `afol` as the only downstream front door.
- Planning-only or read-only questions stay in chat unless durable artifacts
  are required.

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.agents/config.json`: path contract. Check `paths.mutable_dir`, `paths.wb_dir`,
  `paths.skills_dir`, `paths.tmp_dir`, and `paths.data_dir` before writing
  agent-owned state.
- `.agents/rules/`: local operational contracts only.
- `.agents/skills/` or configured `paths.skills_dir`: project-local provider
  skills only when needed.
- `.afol/wb/` or configured `paths.wb_dir`: durable governed plan sessions
  for this downstream project only.
- `.afol/`: provider-compatible mutable state when configured.
- `.agents/source/universal-skills/`: local seed, not nested git.
- `docs/`: project docs.
- `docs/map/`: current-state evidence only.

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
  CLI, and existing `docs/map/` before broad scans.
- Prefer repo-local configured plan state and `docs/knowledge/` records
  before broad historical reads.
- Use RTK only for noisy shell output:
  `rtk git status`, `rtk find`, `rtk summary`, bounded `rtk grep`.
  Use `RTK.md` when present for detailed command policy.
- Keep raw output when exact lines or failure evidence matters.
- Stop context collection when it will not change decisions.

## Tool Routing

- Use MCPs for indexed/structured operations.
- Exact search: `rg`, `fd`, `jq`.
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
- Start tasks as `pending`/`in_progress`; mark `[x]` only with valid
  evidence id.
- Finalize optional artifacts before closure.

## Verification

- Never close work without proof.
- Gate selection:
  - docs/prompt/process -> `afol validate`
  - front door/workbench -> `afol ck`
  - scaffold/release -> `afol validate --json`
- Run focused checks first; broaden only when risk requires.
- If runtime guidance changes, report docs/mirror sync status.

## Docs And Boundaries

- `docs/` is project documentation, not runtime state.
- Keep runtime state/caches/generated ops artifacts outside `docs/`.
- `docs/map/` is descriptive evidence only.
- `docs/arc/` is goal-state governance.
- Use configured `paths.tmp_dir` only for disposable files.
- Do not manually edit managed `updated_at`; use a configured project command
  if this repo adds one.
- Keep project-local rules/docs minimal: only required operational contracts.
- Do not duplicate long rationale from canonical docs/skills; link to
  canonical source.

## Runtime And Skill Sync

- `AGENTS.md` is canonical runtime instructions.
- `CLAUDE.md` is the committed mirror; keep it compatible and synced.
- The Claude adapter is optional. Disable it with
  `afol adapter disable claude` (archives `CLAUDE.md` + `.claude/`) or install
  without it via `afol init --without-claude`. `AGENTS.md` always remains.
- Keep committed adapters thin and traceable.
- Prefer project-local skills only for project-specific behavior.
- Project-local skills are optional; use a native downstream sync command only
  when this repo provides one.
- External skill source updates are branch/PR flow; never direct to universal
  `main`.
- When local skill behavior changes, record pending propagation to
  universal-skills.

## Optional Memory

- Repo-local `.afol/wb/` and `docs/knowledge/` are canonical.
- External memory is auxiliary retrieval only.
- Use host runtime memory only when it is explicitly configured.
