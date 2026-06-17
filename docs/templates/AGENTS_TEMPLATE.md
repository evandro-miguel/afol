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
  1. `afol n {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `afol st -S {session-id} -T T-01`
  3. Edit and run named verification.
  4. `afol d -S {session-id} -T T-01 -x "<verification command>"`

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.agents/config.json` static scaffold metadata and adapter settings
- `.afol/wb/` or configured `paths.wb_dir` governed plan state
- `.afol/data/` or configured data path for telemetry data and indexes when the downstream CLI exposes them
- `.agents/rules/` local contracts only
- `.agents/skills/` only required project-local behavior
- `.afol/adm/` desired-state administration
- `.afol/pstr/` current-state structure maps
- `docs/` project docs and reusable standards

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

- Indexed/structured: MCPs.
- Exact search: `rg`, `fd`, `jq`.
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
- Optional artifacts only when requested or blocking.

## Verification

- Required template gate: `afol ck`.
- Choose focused checks first.

## Docs And Boundaries

- Keep docs as contracts, not prose dumps.
- Keep long rationale in canonical docs/skills.
- Keep runtime state outside `docs/`.

## Runtime And Skill Sync

- `AGENTS.md` is canonical runtime source.
- Keep `CLAUDE.md` mirror compatible.
- Use a configured native skill synchronization flow only when this repo
  provides one; do not push direct to universal `main`.

## Optional Memory

- Repo-local `.afol/wb/` and `knowledge` are canonical.
- External memory is auxiliary only.
