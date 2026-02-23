# Agent-specific instructions for GEMINI
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

# AGENTS.md

## Project overview

{feed with the main goal of this repo}

## Current stack

{feed with the stack for this repo. Ex: Bun, TS}

## Repo structure

{feed with structure for this repo}

## Important files

.agent/arc/{all the architecture files} (ARCHITECTURE, GENERAL-ROADMAP, SPECS/{SPECS})

## General Rules

### Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes; do not over-engineer
- Challenge your own work before presenting it

### Autonomous Bug Fixing

- When given a bug report: just fix it. Do not ask for hand-holding
- Point at logs, errors, failing tests, then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Agentic files

You have to use this structure when writing `.md` management files.

Use the skill `workbench-agent-teams` for better understanding and templates.

Key rules:
- One session folder per workstream (`YYMMDD_HHMM_{theme}/`)
- Standardized file naming: `YYMMDD_HHMM_{theme}_{type}_{N}.md`
- All `.md` files must have YAML frontmatter
- Task markers with ID: `- [ ] T-01 ...`, `- [/] T-01 ...`, `- [x] T-01 ...`
- Plans > 500 lines: split into phases
- Reports must include problems found and solutions applied

```text
# OBS: N = Number (e.g., 01)
.agent/wb/
  YYMMDD_HHMM_<theme>/
    <theme>_plan_{N}.md
    <theme>_task_{N}.md
    <theme>_brainstorm_{N}.md
    <theme>_report_{N}.md
    <theme>_log_{N}.md
    <theme>_research_{N}.md
```

## Task Management

1. Plan first: write plan to `<theme>_task_{N}.md` with checkable items.
2. Verify plan: check in before starting implementation.
3. Track progress: mark items complete as you go.
4. Explain changes: high-level summary at each step.
5. Document results: add review section to `<theme>_task_{N}.md`.
6. Capture lessons: update `<theme>_report_{N}.md` after corrections.

## List most important Skills

{feed with the most important skills for this repo}

## List of MCPs

{feed with the most important MCPs for this repo and common MCPs via Docker MCP}

### Docker MCP

- Search for extra MCPs using the Docker MCP gateway
- `mcp-find`   - Discovers available MCP servers by query (e.g., query=context7)
- `mcp-add`    - Adds a discovered server to current session (e.g., name=context7)
- `mcp-exec`   - Executes a tool from an added MCP server with arguments
- `mcp-remove` - Removes a specific server from session

## Tools to use

### CLI
- Grepai: for semantic search on the folder you are working on

### {theme}
- {add project-specific tools here}

## Core Principles

- Simplicity first: make every change as simple as possible; minimal impact
- No laziness: find root causes; no temporary fixes; senior standards
- Minimal impact: touch only what is necessary; avoid introducing bugs
