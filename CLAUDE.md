<!-- Agent-specific instructions for CLAUDE. -->
<!-- Auto-synced from AGENTS.md. Run sync-agent-docs.py to update. -->

# AGENTS.md

## Project Overview

This repo is the canonical `.agents` scaffold factory for terminal-first
LLM-assisted development. The public/downstream CLI is `afol`/`./a`, and the
current TypeScript implementation lives under `cli/**`. It provides workbench
sessions, task/evidence tracking, runtime adapters, docs standards, telemetry,
and bootstrap assets for downstream repos.

## Factory And Template Boundary

- The exportable scaffold is `src/project-template/`.
- The root `.agents/` tree is the factory/dev environment used to refine the
  scaffold, the Bun/TypeScript CLI, docs, validation, and export behavior.
- Root `.agents/agents`, `.agents/scripts`, and `.agents/runtime` are
  factory-only legacy compatibility surfaces during migration; they are not
  part of the downstream template payload.
- Public runtime usage for this repo remains `afol`/`./a` (TS-native path); the
  compatibility surfaces above are internal factory fallback and must not be
  documented as a public entrypoint.
- Root `.agents/wb/` is development workbench history for this factory repo.
  It may be versioned on development branches such as `main_dev`, but it must
  not be treated as part of the downstream template payload.
- Downstream installs receive only the exportable scaffold from
  `src/project-template/`, including the workbench baseline in
  `src/project-template/.agents/wb/`, not root workbench sessions, active
  session pointers, caches, telemetry events, or factory evidence.
- Cleanup work must preserve this boundary: organize factory state in the root
  repo and harden export checks so factory-only material cannot leak into
  `src/project-template/` or downstream bootstrap output.
- Safe retirement rule: remove or rework factory Python/legacy compatibility
  surfaces only after all delegated command families have a proven native TS
  replacement and gates confirm no downstream visibility.

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

- Language/runtime: Bun and TypeScript for the current CLI/kernel under
  `cli/**`.
- Tooling: Bash wrappers, Just, Markdown, YAML, JSON, and TOML.
- Legacy compatibility: `.agents/agents`, `.agents/scripts`, and
  `.agents/runtime` remain in the factory tree during migration only; legacy
  Python/uv-backed flows should be retired under the safe condition above, not
  as a best-effort cleanup.
- Runtime model: interactive CLI agents. Do not redesign this scaffold around
  long-lived backend agent services unless the roadmap introduces that use case.

## Repository Map

- `cli/`: current Bun/TypeScript CLI implementation, commands, router,
  validation, and tests.
- `.agents/agents`: factory-only legacy compatibility wrapper during
  migration.
- `.agents/scripts/`: factory-only legacy compatibility helpers during
  migration.
- `.agents/runtime/`: factory-only legacy compatibility runtime support during
  migration.
- `.agents/wb/`: factory development workstreams and local active-session
  state; versionable on development branches, not exportable template payload.
- `.agents/rules/`: operational guardrails.
- `.agents/skills/`: project-local skills and workflows.
- `.agents/source/universal-skills/`: repo-local seed, not a nested git checkout.
- `docs/`: project-owned docs, roadmap/specs, standards, templates, lessons,
  telemetry, and maps.
- `docs/map/`: current-state descriptive evidence only.
- `src/project-template/`: canonical downstream project baseline and only
  scaffold template export source.

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

- Use Caveman-style updates by default: concise, no filler, no repeated setup.
  Keep full precise prose when compression could hide risk, order, or evidence.
- Start narrow: `rg`, `fd`, focused reads, repo-analysis, Project RAG, GitNexus
  CLI, and existing `docs/map/` before broad scans.
- Prefer the native `knowledge pull "<topic>"` command before opening historical
  docs when prior work may answer the question.
- Use RTK selectively for noisy shell output: `rtk git status`, `rtk find`,
  `rtk summary`, and bounded `rtk grep` with directory scope plus `--glob`.
  Use `RTK.md` when present for detailed command policy.
- Keep raw `rg`, raw reads, and native command logs when exact source lines,
  edit context, or failure evidence matter.
- Do not wrap MCP output, tiny status commands, or single-file colon-heavy grep
  with RTK. If RTK forces extra follow-up calls, stop using it for that path.
- Stop gathering context when more context is unlikely to change the decision.
  Pass compact handoffs, not raw dumps.

## File-First / Chat-Light Output

- For implementation-completion and governed slice reporting, use compact handoff
  fields: `STATUS`, `TASK`, `FILES_WRITTEN`, `VALIDATION_OR_CHECKS`,
  `SUMMARY`, `BLOCKERS`, and `NEXT`.
- Use `docs/standards/file-first-chat-light.md` for required artifact fields,
  sidecar justification, and compact handoff formatting.

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
- Runtime/tasks: `bun`/`node`/`npm` for the CLI and JS tooling; `python3`/
  `uv` only for legacy compatibility surfaces when they are explicitly touched;
  `just` for project command entrypoints.
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
- Gate selection: docs/prompt/process -> `just lint`; `cli/**` ->
  `bun run typecheck` plus `bun test` or focused `bun test cli/tests/...`
  runs; cross-cutting scaffold/release -> `just agents-all`.
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
- Root `.agents/wb/` evidence may document factory work, but it must not be
  copied into `src/project-template/` or release/export payloads.
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
- `knowledge search|context|recent|show` commands emit MCP contracts for
  host runtimes; it does not execute MCP calls from shell.

---

> **⚠️ IMPORTANT:** THIS FILE IS A REPLICA OF THE `AGENTS.md`.
>
> - **DO NOT READ** the `AGENTS.md` AGAIN if you read this one.
> - This file is auto-synced. Run `.agents/scripts/sync-agent-docs.py` to update.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **agentic-standard-folder** (4381 symbols, 5296 relationships, 99 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/agentic-standard-folder/context` | Codebase overview, check index freshness |
| `gitnexus://repo/agentic-standard-folder/clusters` | All functional areas |
| `gitnexus://repo/agentic-standard-folder/processes` | All execution flows |
| `gitnexus://repo/agentic-standard-folder/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
