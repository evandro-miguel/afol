---
doc_type: standard
id: agents-template-01
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
status: draft
---

# AGENTS.md Template

## Project Overview

`{project_name}` uses a local `.agents` workflow layer for LLM-assisted
development. Replace this paragraph after bootstrap with the real product
purpose, users, stack, and delivery constraints.

## Governed Execution

- If work requires implementation, validation, or delivery and references
  governed work, evidence, task state, or closure, `.agents/wb/` is part of the
  work.
- Before product edits: create or target a session, then move the executable
  task to `in_progress`.
- Canonical path:
  1. `./.agents/agents new {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `./.agents/agents implement start --session {session-id} --task-id T-01`
  3. Edit and run the named verification.
  4. Close with `./.agents/agents implement complete ... --result passed`.
- Planning-only, read-only checks, and broad context questions stay in the
  conversation unless a durable governed artifact is explicitly needed.

## Stack

- Languages: `{project_languages}`
- Runtime/CLI: `{runtime_cli_notes}`
- Package/tool manager: `{package_tooling}`
- Data/config formats: `{data_config_formats}`

## Repository Map

- `.agents/scripts/`: agent CLI commands and helpers.
- `.agents/runtime/`: runtime package and adapter support.
- `.agents/wb/`: governed workstreams and local active-session state.
- `.agents/rules/`: operational guardrails.
- `.agents/skills/`: project-local skills and workflows.
- `.agents/source/universal-skills/`: repo-local seed, not a nested git checkout.
- `docs/`: project-owned docs, roadmap/specs, standards, templates, lessons,
  telemetry, and maps.
- `docs/map/`: current-state descriptive evidence only.

## Working Rules

- Read relevant local files before editing. Ground claims in live tool output.
- Keep changes surgical. Touch only files required by the request.
- Prefer reuse, simplification, deletion, and consolidation before new code.
- Do not add speculative features, config switches, or one-off abstractions.
- Do not revert user or other-agent work unless explicitly asked.
- Reproduce bugs before fixing when practical; verify each meaningful change.
- After user corrections, capture one lesson under `docs/lessons/entries/` when
  it prevents recurrence.
- Write repository artifacts in English unless the user explicitly asks
  otherwise.

## Context And Tokens

- Start narrow: `rg`, `fd`, focused reads, repo-analysis, Project RAG, GitNexus
  CLI, and existing `docs/map/` before broad scans.
- Prefer `.agents/agents knowledge pull "<topic>"` before opening historical
  docs when prior work may answer the question.
- Use RTK selectively for noisy shell output: `rtk git status`, `rtk find`,
  `rtk summary`, and bounded `rtk grep` with directory scope plus `--glob`.
- Keep raw `rg`, raw reads, and native command logs when exact source lines,
  edit context, or failure evidence matter.
- Do not wrap MCP output, tiny status commands, or single-file colon-heavy grep
  with RTK. If RTK forces extra follow-up calls, stop using it for that path.
- Stop gathering context when more context is unlikely to change the decision.
  Pass compact handoffs, not raw dumps.

## Tool Routing

- Use MCPs for structured/indexed operations: Project RAG, repo-analysis
  sweeps, official docs, memory/notes, and tool-native state.
- Exact search: `rg` for identifiers/text, `fd` for paths, `jq` for JSON.
- Semantic or syntax search: `grepai` for fuzzy/public-code search;
  `sg`/`ast-grep` for syntax-aware matching or codemod planning.
- Repo context: `git`/`gh` for history and PRs; GitNexus CLI for indexed graph
  or caller workflows; `repomix`, `yek`, and `gitingest` only when a compact
  repo export materially helps.
- Browser/UI checks: `npx playwright` or `bunx playwright` for E2E,
  screenshots, and automation; `lightpanda` for lightweight page checks.
- Runtime/tasks: `uv`/`python3` for Python; `bun`/`node`/`npm` for JS;
  `just`/`make` for project command entrypoints.
- Docs/ops: `markdownlint`/`lint-md`/`fix-md`/`validate-md` for Markdown,
  `markitdown` for document conversion, `yt-dlp` for media, `docker compose`
  for containers, and `tmux` for long-running terminals.

## Planning And Evidence

- Roadmap-first delivery is mandatory for meaningful feature work:
  roadmap feature -> parent spec -> optional child spec -> workbench.
- For ambiguous, product-shaped, benchmark-heavy, or prioritization-heavy work,
  run the smallest useful `docs/standards/decision-intake.md` lane before
  planning, delegation, benchmarking, or implementation.
- Plans describe direct execution of the requested work. Do not add pre-plan,
  generic research, broad discovery, or "make the real plan" tasks.
- Do needed discovery before authoring a plan and fold findings into facts,
  risks, sequencing, and validation.
- Workbench artifact economy is mandatory. Create only artifacts with a concrete
  operational reason; the normal governed minimum is `plan + task`.
- New tasks start pending or in_progress. Mark `[x]` only through task-scoped
  closure evidence and a valid evidence id.
- Optional artifacts must be finalized before session closure.

## Verification

- Never mark work complete without proof.
- Gate selection: docs/prompt/process -> `just lint`; `.agents/scripts` ->
  `just lint-scripts` plus focused tests or `just test-scripts-all`;
  `.agents/runtime` -> `just lint-runtime` plus focused tests or
  `just test-runtime`; cross-cutting scaffold/release -> `just agents-all`.
- Prefer focused checks first, then broader checks when risk justifies them.
- Runtime/tool-routing/prompt/rule-loading changes should run the controlled
  runtime-flow benchmark family when regression risk is material.
- Use `gpt-5.4-mini` with medium reasoning as the default benchmark baseline
  unless a benchmark spec says otherwise.
- Final reports must state changes, verification, remaining risk/skipped gates,
  documentation-drift status, and mirror sync status when runtime guidance
  changed.

## Docs And Boundaries

- `docs/` is project-owned documentation, not runtime state.
- Keep runtime state, caches, mirrors, generated operational artifacts, and
  workbench evidence outside `docs/`.
- `docs/map/` describes current state; it must not contain roadmap items,
  feature specs, ADRs, briefs, desired architecture, or product philosophy.
- `docs/arc/` is goal-state governance: roadmap, specs, decisions,
  architecture, project brief, tech stack, and engineering guidelines.
- Use `.agents/tmp/` only for disposable temporary files.
- Never edit managed `updated_at` manually; use `just wb-touch` or
  `./.agents/agents wb-update touch`.

## Runtime And Skill Sync

- `AGENTS.md` is the canonical runtime instruction source.
- `CLAUDE.md` is the only committed root mirror generated from `AGENTS.md`.
- OpenCode, Codex, Qwen, and Gemini use `AGENTS.md` directly or global runtime
  config; committed adapters stay thin, secret-free, and traceable.
- Prefer project-local skills under `.agents/skills/`.
- Keep global Codex skills lean. Do not rely on a large machine-global skill
  set as primary project behavior.
- `skills-sync sync` / `skills-sync update` refresh `.agents/skills/`.
  `skills-sync pull` refreshes only a configured external source. `skills-sync
  push` is a branch/PR proposal flow and must never push directly to universal
  `main`.
- Agent behavior changes update the project-local skill first, then leave a
  pending item to propagate the improvement to universal-skills.

## Optional Memory

- Repo-local workbench docs and `knowledge` are canonical.
- External memory is auxiliary retrieval only.
- `.agents/agents memory search|context|recent|show` emits MCP contracts for
  host runtimes; it does not execute MCP calls from shell.
