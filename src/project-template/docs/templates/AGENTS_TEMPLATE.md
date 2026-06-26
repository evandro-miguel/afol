---
doc_type: standard
id: agents-template-01
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
status: draft
---

# AGENTS.md Template

## Project Overview

`{project_name}` uses the local `afol` front door for LLM-assisted delivery.
Replace this section after bootstrap with real product context.

## Governed Execution

- Use the configured plan path for implementation, validation, and delivery
  work. It defaults to `.afol/wb/`.
- Start task before product edits.
- Close task with evidence.
- Canonical path:
  1. `afol new {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `afol start --session {session-id} --task-id T-01`
  3. Edit and run named verification.
  4. `afol evidence --session {session-id} --task-id T-01 --command "<verification command>" --result passed`
  5. `afol done --session {session-id} --task-id T-01`
  6. `afol close --session {session-id}`

## Delivery Rules

- Meaningful change -> map to the configured roadmap under `.afol/adm/`.
- Roadmap feature -> map to one governing parent spec under `.afol/adm/specs/`.
- Plans/tasks execute approved intent. They do not replace roadmap/spec
  definition.
- Non-trivial work -> use `.afol/wb/` for durable execution artifacts.
- Reports -> evidence-based. Done means validated, not merely edited.
- User correction -> create one lesson entry under `docs/lessons/entries/`.

## Branch And Deploy

- Agent commits/pushes target `main_dev` unless the user explicitly requests a
  different branch in the current turn.
- `main` -> never direct-push.
- Production deploy -> forbidden unless the user explicitly asks in the current
  turn.
- Forbidden without explicit deploy request -> `bun run deploy`,
  `wrangler deploy`, and any Cloudflare publish command.

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.agents/config.json`, `.agents/lock.json`, and `.agents/manifest.json`
  path contract for mutable state, plan storage, skills, tmp, and data locations
- `.afol/wb/` or configured `paths.wb_dir` governed plan state
- `.afol/data/` or configured data path for telemetry data and indexes when the downstream CLI exposes them
- `.afol/adm/hooks/` static provider-neutral hook catalog; no script execution
- `.afol/adm/rules/` local contracts only. YAML frontmatter is metadata-only;
  rule budgets and prompt injection use the Markdown body after frontmatter.
- `.agents/skills/` only required project-local behavior; do not create
  `.afol/skills/`
- `.afol/adm/` desired-state administration
- `.afol/pstr/` current-state structure maps only
- `docs/` project docs

## Working Rules

- Read before edit.
- Keep edits surgical.
- Prefer reuse/simplify/delete.
- Do not add speculative scope.
- Do not revert unrelated work.

## Context And Tokens

- Use Caveman-style updates by default: concise, no filler, no repeated setup.
  Keep full precise prose when compression could hide risk, order, or evidence.
- Start narrow with `rg`, `fd`, focused reads, repo-analysis, Project RAG,
  GitNexus CLI, and existing `.afol/pstr/` maps before broad scans.
- Use RTK only for noisy output. Use `RTK.md` when present for detailed policy.
- Stop discovery when more context will not change decisions.

## Tool Routing

- Exact search/config: `rg`, `fd`, `jq`.
- Current structure: `.afol/pstr/` when present.
- Indexed/structured: use MCPs only when configured and narrower than local
  tools.
- Syntax: `sg`/`ast-grep`.
- Validation/docs/tasks: `afol` and project-local package commands.

## Telemetry And Indexes

Telemetry is a state surface in the template export. If the downstream repo
ships a native telemetry command, call it through `afol`.
Otherwise, treat telemetry reports, exports, and indexes as CLI-owned future
work and keep this template focused on the stored data and docs contract.

## Planning And Evidence

- Keep plans executable.
- Default artifact pair: `plan + task`.
- Workbench task state lives in the `State Board` plus AFOL lifecycle commands.
- Do not add parallel `T-xx` checklist state for workbench lifecycle.
- Optional artifacts only when requested or blocking.

## Verification

- Required template gate: `afol validate project`.
- Choose focused checks first.

## Validation And Security

- Normal code change -> minimum gate is the narrowest relevant local check.
- Use focused validation as appropriate: lint, typecheck, tests,
  content/schema validation, link validation, browser smoke, build, screenshots.
- Every security check -> include secret scanning and dependency vulnerability
  scanning.
- Secrets -> never print secret values in terminal output, reports, docs, or
  summaries.

## Repository Hygiene

- New versioned root files -> avoid unless project entrypoint, standard config,
  or explicitly justified.
- Local `.env` files -> allowed only as ignored, non-versioned files.
- Screenshots/images -> `.afol/wb/screenshots/` or `tests/screenshots/`.
- Temp files -> `tmp/` or `.tmp_<name>/`.
- Workbench artifacts -> `.afol/wb/<session>/`.
- User data -> never delete or move vault content, backups, keys, secrets,
  archives, Windows profile data, or other user data without explicit approval.

## Docs And Boundaries

- Keep docs as contracts, not prose dumps.
- Keep long rationale in canonical docs/skills.
- Keep runtime state outside `docs/`.

## Runtime And Skill Sync

- `AGENTS.md` is canonical runtime source.
- Runtime mirrors are adapter-owned, optional, and controlled by config. If an
  adapter is disabled, do not create or sync its mirror files.
- Use a configured native skill synchronization flow only when this repo
  provides one; do not push direct to universal `main`.

## Optional Memory

- Repo-local `.afol/wb/` and `.afol/memory/` are canonical when present.
- External memory is auxiliary only.
