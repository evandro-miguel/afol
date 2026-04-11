---
doc_type: lessons
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-02-23T17:54:59-03:00'
---

# General Lessons

## Purpose

Central repository of learnings and prevention rules.
Updated after every user correction.

## Review Routine

Lessons should be reviewed periodically:

1. **After each user correction** - Update immediately with new lesson
2. **Weekly** - Review accumulated lessons for patterns
3. **Monthly** - Consolidate similar lessons and update prevention rules

## Lessons log

### 2026-02-23 - Initial setup

**Context:** Creating standard agentic folder structure

**Lesson:** Establish clear templates and standards upfront

**Prevention rule:** Always use templates from `docs/templates/`

**Guardrail:** Template files include footer referencing their source path

### 2026-02-23 - Task marker format

**Context:** Task markers were inconsistent in documentation

**Lesson:** All task markers must follow `- [X]` format consistently

**Prevention rule:** Always use `- [ ]`, `- [/]`, `- [%]`, `- [!]`, `- [>]`, `- [x]` - never omit the `-` prefix

**Guardrail:** Templates and AGENTS.md aligned to use consistent format

### 2026-02-23 - Lint scope for teaching docs

**Context:** User clarified that `a-docs` and orientation docs are instructional and should not pollute lint signal.

**Lesson:** Lint must prioritize operational artifacts and skip pedagogical documentation by default.

**Prevention rule:** Keep `agents-lint-docs.py` exclusion list covering instructional/orientation paths unless explicitly overridden.

**Guardrail:** Added `EXCLUDED_PATH_PREFIXES` and `should_skip_file()` in `.agents/scripts/agents-lint-docs.py`.

### 2026-02-23 - AGENTS.md must stay generic-first

**Context:** User corrected direction: root `AGENTS.md` should remain a reusable generic project contract, not overfitted to one repository.

**Lesson:** Keep root contract template-oriented with clear placeholders/sections for project overview, stack, structure, skills, and MCPs.

**Prevention rule:** When revising `AGENTS.md`, preserve generic scaffolding first and then inject current repo values as examples.

**Guardrail:** Reframed root `AGENTS.md` with fixed section layout and current-repo-filled content blocks.

### 2026-02-23 - AGENTS.md must be placeholder-only template

**Context:** User clarified the contract must be a pure template, not partially pre-filled.

**Lesson:** For template repos, root `AGENTS.md` should keep placeholders in variable sections (stack, structure, skills, MCPs, tools).

**Prevention rule:** Do not populate template placeholders unless explicitly asked for a project-specific version.

**Guardrail:** Rewrote `AGENTS.md` with `{...}` placeholders and removed concrete lists for tools/MCPs/skills.

### 2026-02-23 - Mandatory task IDs in checklists

**Context:** User requested every checklist task to include an explicit task ID to improve automation and traceability.

**Lesson:** Scripts should parse task items by canonical ID format, not only by checkbox markers.

**Prevention rule:** In task files, always write checklist items as `- [ ] T-01 <text>` (or `T-001`).

**Guardrail:** Updated `verify-tasks.py` to parse ID-based tasks and report open tasks with `ID + file + line`.

### 2026-02-23 - Avoid workbench folder sprawl

**Context:** User requested reducing unnecessary creation of new workstream folders and creating full plan stacks only for significant changes.

**Lesson:** Session lifecycle needs explicit "quick vs significant" intake and a single active session policy.

**Prevention rule:** Use quick mode for small changes; only open new workstream with `--force-new` when change is significant.

**Guardrail:** `agents-new.py` now enforces one active session via `.agents/wb/.active_session` and provides `--quick` mode.

### 2026-02-23 - Centralize tool config in one file

**Context:** User requested that tool behaviors be configurable per project through a single file instead of hardcoded values across scripts.

**Lesson:** Operational scripts must share one configuration source for paths/timezone/exclusions/targets.

**Prevention rule:** Never hardcode `.agents` paths or timezone rules in individual scripts when `agents.config` can provide it.

**Guardrail:** Added shared loader (`.agents/scripts/lib/agents_config.py`) and root `agents.config`; migrated core scripts to read from it.

### 2026-02-23 - AGENTS.md must remain template-first

**Context:** User requested AGENTS.md to stay generic, with placeholders and operational management tool guidance.

**Lesson:** Root AGENTS contract should be reusable across projects and avoid overfitting concrete project values.

**Prevention rule:** Prefer placeholders and generalized process rules; include operational command patterns without hardcoding project-specific stack values.

**Guardrail:** Keep AGENTS sections for placeholders, management workflows, verification, and tools discovery/operations.

### 2026-02-23 - Keep AGENTS tools section concise and discovery-first

**Context:** User requested listing only main tools and delegating command details to tool discovery.

**Lesson:** Template AGENTS should avoid long static command inventories that get stale.

**Prevention rule:** Keep only core tool entrypoints in AGENTS templates and direct users/agents to `.agents/agents tools list|info|search`.

**Guardrail:** Use a short `Main Tools` section and a `Discovery-First Rule` block in template AGENTS.

### 2026-02-23 - Default repository language must be English

**Context:** User requested an explicit language rule for repository content.

**Lesson:** Language consistency is part of repository quality and collaboration standards.

**Prevention rule:** Write repository content in English by default; only write Portuguese when explicitly requested.

**Guardrail:** Keep a `Language Policy` section in root `AGENTS.md` and apply it to docs, logs, and management artifacts.

---

## Prevention rules

1. **Always search before acting** - Never guess commands or patterns
2. **Use templates** - Never create ad-hoc formats
3. **Verify before done** - Evidence is mandatory
4. **Small diffs** - Keep changes reviewable
5. **No secrets** - Never commit credentials
6. **Consistent markers** - Always use `- [X]` format for task markers
7. **Lint signal first** - Exclude teaching/orientation docs from default lint scope
8. **Generic root contract** - Keep `AGENTS.md` reusable across projects and only specialize where explicitly requested
9. **Template purity** - Keep root AGENTS placeholders unfilled for template repositories
10. **Task IDs required** - Every checklist task must include a stable ID (`T-01`/`T-001`)
11. **One active session** - Use quick mode for minor work; force new stream only for significant work
12. **Config single source** - Use `agents.config` for tool paths/time settings and avoid script-local hardcoded project config
13. **Template-first AGENTS** - Keep root AGENTS generic with placeholders and reusable operational rules
14. **Discovery-first tool docs** - Keep AGENTS tool guidance short and rely on dynamic tools catalog commands
15. **English by default** - Use English across repo artifacts unless user explicitly requests another language

## Guardrails

- YAML frontmatter required on all `.md` files
- ISO 8601 timestamps with `Z` or timezone offset
- Workbench naming convention enforced
- Templates reference themselves in footer
- Task markers always include `-` prefix
- Lint scanner excludes instructional folders via explicit path prefixes
- Root `AGENTS.md` follows a stable template with project overview/stack/structure/rules/workbench sections
- Root `AGENTS.md` keeps variable sections as placeholders unless user explicitly requests concrete values
- `verify-tasks.py` parses only ID-based checklist lines and reports open tasks with location
- `agents-new.py` blocks parallel new sessions unless `--force-new` and supports `--quick`
- `agents.config` + `.agents/scripts/lib/agents_config.py` define shared operational configuration
- Root `AGENTS.md` preserves placeholder sections and generic management-tool workflow guidance
- Root `AGENTS.md` keeps tools guidance concise and delegates details to `.agents/agents tools` discovery commands
- Root `AGENTS.md` includes explicit `Language Policy` enforcing English as default

---

*Lessons: `docs/lessons/general-lessons.md`*
