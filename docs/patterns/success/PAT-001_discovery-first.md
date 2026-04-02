---
doc_type: pattern
id: "PAT-001"
type: "success"
status: "active"
tags: ["process", "tools", "discovery"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
related_lessons:
  - "20260223_1720_updated-at-script-only-and-per-file-lessons"
  - "general-lessons.md#2026-02-23---keep-agents-tools-section-concise-and-discovery-first"
---

# Pattern: Discovery-First Tool Usage

## Type
success

## Context
When starting work with the .agents system or when unsure which tool to use for a task.

## Pattern
**Always discover tools before using them:**

1. Run `.agents/agents tools list` to see all available tools
2. Run `.agents/agents tools info <tool-id>` for detailed information
3. Run `.agents/agents tools search <query>` to find tools by functionality
4. Only then execute the tool command

**Never guess tool commands or rely on memory.**

## Why It Works
- Tools evolve and commands change
- Discovery ensures you have current information
- Prevents errors from outdated knowledge
- Reduces trial-and-error time
- Surprises you with capabilities you didn't know existed

## Examples

### Good Example
```bash
# Agent needs to create a new workstream
./.agents/agents tools list
# Sees "new" tool, gets details
./.agents/agents tools info new
# Now executes with correct options
./.agents/agents new auth-refactor --spec-lite
```

### Bad Example
```bash
# Agent guesses command based on memory
mkdir -p .agents/wb/260223_1800_auth-refactor
# Creates non-standard structure, misses templates
# Later has to redo with proper tool
```

## Evidence
- Lesson: "Keep AGENTS tools section concise and discovery-first"
- Tool catalog: `.agents/tools.json` with 10+ tools
- Reduced tool usage errors after pattern adoption

## Related Patterns
- PAT-002: Single Active Session
- PAT-003: Template-First Documentation

## When to Use
- Starting any new workstream
- Unsure which tool solves your problem
- Tool command doesn't work as expected
- Onboarding to .agents system

## When NOT to Use
- Emergency hotfixes (use quick mode)
- You've used the exact same tool command <5 minutes ago

## Implementation Notes
- Add discovery step to your mental checklist
- Keep `.agents/agents tools help` handy
- Consider aliasing: `alias aget='.agents/agents tools'`

---
*Pattern: `docs/patterns/success/PAT-001_discovery-first.md`*
