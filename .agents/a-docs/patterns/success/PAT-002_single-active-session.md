---
doc_type: pattern
id: "PAT-002"
type: "success"
status: "active"
tags: ["process", "workbench", "focus"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
related_lessons:
  - "general-lessons.md#2026-02-23---avoid-workbench-folder-sprawl"
---

# Pattern: Single Active Session

## Type
success

## Context
When managing multiple tasks or workstreams in the .agents system.

## Pattern
**Maintain only one active workstream at a time:**

1. Use `.agents/wb/.active_session` to track current focus
2. For small changes, use quick mode: `.agents/agents new <theme> --quick`
3. Only create new session with `--force-new` for significant independent work
4. Complete or pause current session before starting another

**Avoid workbench folder sprawl.**

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

# Major new feature - complete current first
./.agents/agents wb-update status --value done --file report
./.agents/agents new oauth-integration --force-new
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
- `agents-new.py` enforces one active session
- `.active_session` file tracks current focus
- Reduced orphaned workstreams after pattern adoption

## Related Patterns
- PAT-001: Discovery-First Tool Usage
- PAT-004: Quick vs Significant Intake

## When to Use
- Starting any new work
- Already have an active session
- Tempted to create parallel workstream
- Managing multiple related tasks

## When NOT to Use
- Genuinely independent workstreams (different epics)
- Team collaboration requiring parallel tracks
- Emergency production fixes

## Implementation Notes
- Check `.active_session` before creating new session
- Use `--quick` for minor tasks under the same theme
- Archive completed sessions monthly to reduce clutter
- Review `.agents/wb/` folder weekly for orphaned sessions

---
*Pattern: `.agents/a-docs/patterns/success/PAT-002_single-active-session.md`*
