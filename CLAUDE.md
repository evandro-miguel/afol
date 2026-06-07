<!-- Agent-specific instructions for CLAUDE. -->
<!-- Auto-synced from AGENTS.md. Run sync-agent-docs.py to update. -->

# AGENTS.md

## Project Overview

This repo is the canonical `.agents` scaffold factory for terminal-first
LLM-assisted development. The public/downstream CLI is `afol`, and the current
TypeScript implementation lives under `cli/**`. It provides workbench sessions,
task/evidence tracking, runtime adapters, docs standards, telemetry, and
bootstrap assets for downstream repos. Legacy local aliases and just
command-runner surfaces are compatibility debt; `afol` is the current public
entrypoint and must be the only documented downstream path.

## Factory And Template Boundary

- The exportable scaffold is `src/project-template/`.
- The root `.agents/` tree is the factory/dev environment used to refine the
  scaffold, the Bun/TypeScript CLI, docs, validation, and export behavior.
- Root `.agents/agents`, `.agents/scripts`, `.agents/runtime`, legacy local
  aliases, and legacy just command-runner surfaces are factory-only
  compatibility debt during migration; they are not part of the downstream
  template payload.
- Public runtime usage for this repo is `afol` only (TS-native path); the
  compatibility surfaces above are internal factory fallback and must not be
  documented as public entrypoints.
- Root `.agents/wb/` is development workbench history for this factory repo.
  It may be versioned on development branches such as `main_dev`, but it must
  not be treated as part of the downstream template payload.
- Downstream installs receive only the exportable scaffold from
  `src/project-template/`, including the workbench baseline in
  `src/project-template/.agents/wb/`, not root workbench sessions, active
  session pointers, caches, telemetry events, or factory evidence.
- Downstream installs must not receive legacy aliases or just command runners
  after the AFOL-only cutover; any remaining payload, test, or documentation
  reference to them is migration debt.
- Cleanup work must preserve this boundary: organize factory state in the root
  repo and harden export checks so factory-only material cannot leak into
  `src/project-template/` or downstream bootstrap output.
- Safe retirement rule: remove or rework legacy aliases, legacy just
  command-runner surfaces, and factory Python compatibility surfaces after all
  delegated command families have a proven AFOL-native TS replacement and gates
  confirm no downstream visibility.

## Governed Execution

- If work requires implementation, validation, or delivery and references
  governed work, evidence, task state, or closure, `.agents/wb/` is part of the
  work.
- Before product edits: create or target a session, then move the executable
  task to `in_progress`.
- Canonical path:
  1. `afol n {theme} --feature-id {F-id} --parent-spec {spec-id}`
  2. `afol st -S {session-id} -T T-01`
  3. Edit and run the named verification.
  4. `afol d -S {session-id} -T T-01 -x "<verification command>"`
  5. `afol c -S {session-id}`
- Use `afol` for factory and downstream lifecycle commands. Use
  `.agents/agents` only when explicitly testing or retiring legacy
  compatibility.
- Planning-only, read-only checks, and broad context questions stay in the
  conversation unless a durable governed artifact is explicitly needed.

## Stack

- Language/runtime: Bun and TypeScript for the current CLI/kernel under
  `cli/**`.
- Tooling: Bun/TypeScript, Bash wrappers for packaging or compatibility only,
  Markdown, YAML, JSON, and TOML.
- Legacy compatibility: `.agents/agents`, `.agents/scripts`, `.agents/runtime`,
  legacy local aliases, and legacy just command-runner surfaces remain in the
  factory tree during migration only; legacy Python/uv-backed flows should be
  retired under the safe condition above, not as a best-effort cleanup.
- Runtime model: interactive CLI agents. Do not redesign this scaffold around
  long-lived backend agent services unless the roadmap introduces that use case.

## Repository Map

- `afol`: public TS CLI front door.
- `cli/`: current Bun/TypeScript CLI implementation, commands, router,
  validation, and tests.
- `.agents/agents`: factory-only legacy compatibility wrapper during
  migration; not a public entrypoint.
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

- Default communication mode is `$caveman` full: concise, technical, no filler,
  no repeated setup. Keep full precise prose when compression could hide risk,
  order, or evidence.
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
- Runtime/tasks: `afol` for scaffold lifecycle, status, validation, and
  workbench commands; `bun`/`node`/`npm` for the CLI and JS tooling;
  `python3`/`uv` only for legacy compatibility surfaces when they are
  explicitly touched. Do not use `just` as the canonical project entrypoint.
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
- Gate selection starts with `afol validate [--changed-path <path>]` to select
  validation packs and report contract issues. Until `afol validate` executes
  selected packs directly, run the required Bun/package commands explicitly and
  treat legacy just-command-runner-only gates as migration debt.
- Docs/prompt/process -> `afol validate --changed-path <path>` plus the
  relevant Markdown/documentation check.
- `cli/**` -> `bun run typecheck` plus `bun test` or focused
  `bun test cli/tests/...` runs.
- Cross-cutting scaffold/release -> `bun run validate:release`,
  `bun run smoke:clean`, and `afol validate --json`; do not use
  `just agents-all` as the canonical gate.
- Prefer focused checks first, then broader checks when risk justifies them.
- Runtime/tool-routing/prompt/rule-loading changes should run the controlled
  runtime-flow benchmark family when regression risk is material.
- Use `gpt-5.4-mini` with medium reasoning as the default benchmark baseline
  for selective development-time regression checks unless a benchmark spec
  says otherwise.
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
- Never edit managed `updated_at` manually; use AFOL-native workbench update
  commands when available. If a capability exists only in `.agents/agents` or a
  legacy just command-runner target, record it as migration debt unless the task
  explicitly targets legacy retirement.

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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **agentic-standard-folder** (5174 symbols, 7533 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

---

> **⚠️ IMPORTANT:** THIS FILE IS A REPLICA OF THE `AGENTS.md`.
>
> - **DO NOT READ** the `AGENTS.md` AGAIN if you read this one.
> - This file is auto-synced. Run `.agents/scripts/sync-agent-docs.py` to update.
