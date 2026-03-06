# AGENTS.md

## Project Overview

`{describe_the_main_goal_of_this_repository}`

## Current Stack

`{list_main_languages_frameworks_runtimes_and_package_managers}`

## Repo Structure

`{describe_main_folders_and_their_purpose}`

## Important Files

- `.agents/arc/{architecture_files}` (`ARCHITECTURE.md`, `GENERAL-ROADMAP.md`, `SPECS/{...}`, `DECISIONS/{...}`)
- `.agents/a-docs/standards/{operational_standards}`
- `.agents/a-docs/templates/{management_templates}`
- `{add_project_specific_critical_files_here}`

## General Rules

### Self-Improvement Loop

- After any user correction, create one lesson file in `.agents/a-docs/lessons/entries/`
- Add a prevention rule to avoid repeating the same mistake
- Add guardrails when feasible (tests, assertions, lint rules, CI checks)
- Review relevant lessons before starting significant work

### Verification Before Done

- Never mark work complete without proof
- Compare intended behavior vs actual behavior
- Run verification commands and capture evidence
- Mandatory gate: `make lint` must pass before any task/session can be marked as complete
- Ask: `Would this pass a strict senior/staff review?`
- Deterministic verification: evidence over assumptions

### Demand Elegance (Balanced)

- For non-trivial changes, evaluate if there is a cleaner design
- If the solution is hacky, refactor to a maintainable one
- Avoid over-engineering simple tasks / Simplicity first: minimal necessary change
- Keep diffs small, clear, and reviewable

### Autonomous Bug Fixing

- Reproduce or explain why reproduction is blocked
- Identify root cause first, not only symptoms (no temporary patch as final solution)
- Implement fix + guardrail when feasible
- Verify and report symptom, cause, fix, and proof
- Minimal blast radius: touch only what is required

### Safety Rules

- Never expose secrets in code, logs, docs, or commits
- Avoid destructive operations unless explicitly authorized
- Do not add dependencies without clear justification
- Archive before delete under `.agents/z-arq/YYYYMMDD_<description>/`

### a-docs Boundary Rule

- `.agents/a-docs/` is documentation-only
- Do not use `.agents/a-docs/` for runtime state, caches, mirrors, generated artifacts, or operational data
- Operational state must live outside `.agents/a-docs/` (for example: `.agents/cache/`, `.agents/wb/`)

### Language Policy

- Write all repository artifacts in English by default
- Use Portuguese only when explicitly requested by the user
- Keep identifiers, docs, reports, and operational notes consistent with this rule

### Metadata Update Policy (Mandatory)

- Never edit `updated_at` manually in managed docs
- Always update `updated_at` via automation commands/scripts
- Preferred commands:
  - `make wb-touch`
  - `./.agents/agents wb-update touch`
  - `./.agents/agents wb-update touch --file <path>`

## Agentic Files (Management Docs)

Use standardized templates from:

- `.agents/a-docs/templates/`

Key rules:

- Documentation consistency: keep templates, standards, and reports aligned
- Always work on a session folder: `.agents/wb/YYMMDD_HHMM_<theme>/`
- Standardized naming: `YYMMDD_HHMM_<theme>_<doc_type>_<NN>.md`
- All management `.md` files must contain YAML frontmatter
- Use task IDs in checklist lines: `- [ ] T-01 {text}`
- Use state markers consistently: `- [ ]`, `- [/]`, `- [%]`, `- [!]`, `- [>]`, `- [x]`
- If a plan exceeds `{max_plan_lines_threshold}` lines, split by phases
- Reports must include problems found, fixes applied, and verification evidence
- Lessons are one-file-per-lesson under `.agents/a-docs/lessons/entries/`

```text
.agents/wb/
  YYMMDD_HHMM_<theme>/
    YYMMDD_HHMM_<theme>_plan_01.md
    YYMMDD_HHMM_<theme>_task_01.md
    YYMMDD_HHMM_<theme>_brainstorm_01.md
    YYMMDD_HHMM_<theme>_research_01.md
    YYMMDD_HHMM_<theme>_log_01.md
    YYMMDD_HHMM_<theme>_report_01.md
    YYMMDD_HHMM_<theme>_spec-lite_01.md
    YYMMDD_HHMM_<theme>_spec_01.md
```

## Task Management Workflow

1. Create/update plan in `<theme>_plan_{NN}.md` for significant changes
2. Track execution checklist in `<theme>_task_{NN}.md` using task IDs
3. Record timeline and command evidence in `<theme>_log_{NN}.md`
4. Summarize outcomes and verification in `<theme>_report_{NN}.md`
5. Link related artifacts (spec/plan/task/report) via frontmatter `links`
6. Update lessons after any correction or process failure using `.agents/a-docs/lessons/entries/YYYYMMDD_HHMM_<slug>.md`
7. Use script-driven metadata updates (`updated_at`) instead of manual edits

## Session and Scope Policy

- Maintain a single active workstream unless explicitly approved otherwise
- Reuse active session for minor tasks (`quick mode`) when applicable
- Create a new session only for significant/independent workstreams

## Timestamp and Timezone Policy

- Frontmatter timestamps must be ISO 8601
- Use `Z` or explicit offset (`+HH:MM` / `-HH:MM`) consistently
- Project timezone behavior is configured in `.agents/agents.config`

## Skills (Template)

`{list_most_important_skills_for_this_project}`

## MCPs (Template)

`{list_most_important_mcps_for_this_project}`

### Docker MCP (Template)

- Discover additional MCP servers with Docker MCP gateway:
- `mcp-find` - Discover servers by query
- `mcp-add` - Add server to current session
- `mcp-exec` - Execute tool from added MCP server
- `mcp-remove` - Remove MCP server from current session

## Tools for Project Management (Agent Operations)

### Main Tools

- `make` - Standard entrypoint for operational workflows
- `.agents/agents` - Unified wrapper to execute agentic scripts
- `.agents/agents tools` - Tool discovery and guidance for project management

### Skills Structure Rule

- Project skills must follow strict structure: `skills/<skill-name>/SKILL.md`
- Do not create mirror/cache folders inside `skills/`
- Use `skills-sync` commands for synchronization

### Discovery-First Rule

- Prefer discovery over memorizing long command lists
- Start with:
  - `.agents/agents tools list`
  - `.agents/agents tools info <tool-id>`
  - `.agents/agents tools search <query>`
- Use `make help` for Make targets when needed
- Optional follow-up phrasing can be:
  - `If you want, I can also set skills_sync.enabled=true in template defaults so new repos start with sync flow active by default.`

## Repo-Specific Command Placeholders

- Install: `{project_install_command}`
- Dev: `{project_dev_command}`
- Lint: `{project_lint_command}`
- Typecheck: `{project_typecheck_command}`
- Test: `{project_test_command}`
- Build: `{project_build_command}`

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Authentication/authorization verified
- Rate limiting on all endpoints
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If security issue found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets → review codebase for similar issues.

## Coding Style

**Immutability (CRITICAL):** Always create new objects, never mutate. Return new copies with changes applied.

**File organization:** Many small files over few large ones. 200-400 lines typical, 800 max. Organize by feature/domain, not by type. High cohesion, low coupling.

**Error handling:** Handle errors at every level. Provide user-friendly messages in UI code. Log detailed context server-side. Never silently swallow errors.

**Input validation:** Validate all user input at system boundaries. Use schema-based validation. Fail fast with clear messages. Never trust external data.

**Code quality checklist:**
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — API endpoints, database operations
3. **E2E tests** — Critical user flows

**TDD workflow (mandatory):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

Troubleshoot failures: check test isolation → verify mocks → fix implementation (not tests, unless tests are wrong).

## Development Workflow

1. **Plan** — Use planner agent, plan complex features before writing code, identify dependencies and risks, break into phases
2. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
3. **Review** — Use code-reviewer agent immediately, address CRITICAL/HIGH issues
4. **Commit** — Conventional commits format, comprehensive PR summaries

## Success Metrics

- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- Performance is acceptable
- User requirements are met