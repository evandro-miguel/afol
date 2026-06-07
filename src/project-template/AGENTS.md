# AGENTS.md

## Project Overview

`{project_name}` uses a local `.agents` workflow for LLM-assisted delivery.
Replace this section after bootstrap with real product purpose and constraints.

## Governed Execution

- Use the configured workbench path when work includes implementation,
  validation, or delivery. Default is `.agents/wb/`; provider-compatible
  installs may use `.afol/wb/`.
- Before product edits: create/target a session and move task to `in_progress`.
- Canonical path:
  1. `./.agents/agents new {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `./.agents/agents implement start --session {session-id} --task-id T-01`
  3. Edit and run named verification.
  4. Close with `./.agents/agents implement complete ... --result passed`.
- Planning-only or read-only questions stay in chat unless durable artifacts
  are required.

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.agents/scripts/`: CLI helpers.
- `.agents/runtime/`: runtime package/adapters.
- `.agents/wb/`: governed sessions.
- `.agents/rules/`: local operational contracts only.
- `.agents/skills/`: project-local skills only when needed.
- `.agents/source/universal-skills/`: local seed, not nested git.
- `.afol/`: optional provider-compatible mutable state root for workbench,
  skills, telemetry, archives, and local manifests when `.agents/` must stay
  read-only in a sandbox.
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
- Prefer `.agents/agents knowledge pull "<topic>"` before broad historical
  reads.
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
- Runtime/tasks: `uv`/`python3`, `bun`/`node`/`npm`, `just`/`make`.
- Docs/ops: `markdownlint`/`lint-md`/`fix-md`/`validate-md`, `markitdown`,
  `yt-dlp`, `docker compose`, `tmux`.

## Planning And Evidence

- Use roadmap-first delivery for non-trivial features.
- Run the smallest decision-intake lane for ambiguous/product-shaped work.
- Plans must describe direct execution, not pre-plan research.
- Keep workbench artifact count minimal: default is `plan + task`.
- Start tasks as `pending`/`in_progress`; mark `[x]` only with valid
  evidence id.
- Finalize optional artifacts before closure.

## Verification

- Never close work without proof.
- Gate selection:
  - docs/prompt/process -> `just lint`
  - `.agents/scripts` -> `just lint-scripts` + focused tests or
    `just test-scripts-all`
  - `.agents/runtime` -> `just lint-runtime` + focused tests or
    `just test-runtime`
  - scaffold/release -> `just agents-all`
- Run focused checks first; broaden only when risk requires.
- If runtime guidance changes, report docs/mirror sync status.

## Docs And Boundaries

- `docs/` is project documentation, not runtime state.
- Keep runtime state/caches/generated ops artifacts outside `docs/`.
- `docs/map/` is descriptive evidence only.
- `docs/arc/` is goal-state governance.
- Use the configured temp path only for disposable files. Default is
  `.agents/tmp/`; provider-compatible installs may use `.afol/tmp/`.
- Do not manually edit managed `updated_at`; use `just wb-touch` or
  `./.agents/agents wb-update touch`.
- Keep project-local rules/docs minimal: only required operational contracts.
- Do not duplicate long rationale from canonical docs/skills; link to
  canonical source.

## Runtime And Skill Sync

- `AGENTS.md` is canonical runtime instructions.
- `CLAUDE.md` is the committed mirror; keep it compatible and synced.
- Keep committed adapters thin and traceable.
- Prefer project-local skills only for project-specific behavior.
- `skills-sync sync` / `skills-sync update` refresh `.agents/skills/`.
- If `.agents/agents.config` points `skills_sync.project_dir` at
  `.afol/skills`, refresh that configured path instead.
- `skills-sync pull` refreshes configured external source only.
- `skills-sync push` is branch/PR flow; never direct to universal `main`.
- When local skill behavior changes, record pending propagation to
  universal-skills.

## Optional Memory

- Repo-local workbench docs and `knowledge` are canonical.
- External memory is auxiliary retrieval only.
- `.agents/agents memory search|context|recent|show` emits MCP contracts only.
