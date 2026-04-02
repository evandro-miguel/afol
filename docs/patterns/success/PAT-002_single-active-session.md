---
doc_type: pattern
id: "PAT-002"
type: "success"
status: "active"
tags: ["process", "workbench", "focus"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-26T00:00:00Z"
related_lessons:
  - "general-lessons.md#2026-02-23---avoid-workbench-folder-sprawl"
---

# Pattern: Single Active Session

## Type
success

## Context
When managing multiple tasks or workstreams in the .agents system.

## Pattern
**Maintain only one active workstream at a time (recommended for focus):**

1. Use `.agents/wb/.active_session` to track current focus
2. For small changes, use quick mode: `.agents/agents new <theme> --quick`
3. Create new sessions as needed - system allows multiple coexisting sessions
4. Complete or pause current session before starting another (disciplined workflow)

**Multiple sessions are allowed, but avoid workbench folder sprawl.**

## Why It Works
- Forces focus on one problem at a time
- Reduces context switching overhead
- Makes progress tracking clearer
- Prevents orphaned workstreams
- Easier to review and report outcomes

## Examples

### Good Example
```bash
# Working on auth-refactor
cat .agents/wb/.active_session
# -> 260223_1800_auth-refactor

# Small related task - use quick mode
./.agents/agents new update-auth-docs --quick

# Major new feature - new session (system allows it, warns about existing)
./.agents/agents new oauth-integration
# ⚠️ Note: Another session is currently active: 260223_1800_auth-refactor
# Creating new session. To target a specific session:
#   .agents/agents wb-update <command> --session 260223_1800_auth-refactor
```

### Multi-Session Example (When Needed)
```bash
# Independent workstreams - both can coexist
./.agents/agents new feature-a          # Session A created
./.agents/agents new feature-b          # Session B created (warns about A)

# Target specific session for operations
./.agents/agents wb-update task T-01 --session 260224_1200_feature-a --mark-done
./.agents/agents wb-update touch --session 260224_1200_feature-b
```

### Bad Example
```bash
# Creates parallel sessions without finishing
./.agents/agents new auth-refactor
./.agents/agents new oauth-integration
./.agents/agents new session-management
# Now has 3 incomplete sessions, context split
```

## Evidence
- Lesson: "Avoid workbench folder sprawl"
- `agents-new.py` allows multiple sessions (non-blocking warning since 2026-02-26)
- `.active_session` file tracks current focus
- `--session <id>` flag enables targeting specific sessions

## Related Patterns
- PAT-001: Discovery-First Tool Usage
- PAT-004: Quick vs Significant Intake
- PAT-101: Anti-Pattern Workbench Sprawl (what to avoid)

## When to Use
- Starting any new work
- Already have an active session
- Tempted to create parallel workstream
- Managing multiple related tasks

## When NOT to Use
- Genuinely independent workstreams (different epics) - ✅ OK to create new session
- Team collaboration requiring parallel tracks - ✅ OK to create new session
- Emergency production fixes - ✅ OK to create new session

## Implementation Notes
- Check `.active_session` before creating new session
- Use `--quick` for minor tasks under the same theme
- Multiple sessions are **allowed** but use discipline to avoid sprawl
- Use `--session <id>` to target specific sessions in commands
- Archive completed sessions monthly to reduce clutter
- Review `.agents/wb/` folder weekly for orphaned sessions

---
*Pattern: `docs/patterns/success/PAT-002_single-active-session.md`*
