---
doc_type: pattern
id: "PAT-101"
type: "anti"
status: "active"
tags: ["process", "workbench", "organization"]
effectiveness: "high"
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
related_lessons:
  - "general-lessons.md#2026-02-23---avoid-workbench-folder-sprawl"
related_patterns:
  - "PAT-002"
---

# Anti-Pattern: Workbench Sprawl

## Type

anti-pattern

## Context

Creating multiple parallel workstreams without completing current ones.

## Anti-Pattern

**Creating new workstream folders without finishing current work:**

```bash
# Day 1: Start auth-refactor
./.agents/agents new auth-refactor

# Day 2: Start oauth without finishing auth
./.agents/agents new oauth-integration

# Day 3: Another new session
./.agents/agents new session-management

# Result: 3 incomplete sessions, no clear progress
```

## Why It Doesn't Work

- Context gets split across multiple workstreams
- Hard to track what's actually done
- Workbench becomes cluttered with orphaned folders
- Progress reports are fragmented
- Review and verification become difficult
- Increases cognitive load

## Symptoms

- More than 3 sessions with `status: active`
- Sessions older than 1 week without progress
- `.agents/wb/` has 10+ folders from current month
- Can't answer "what are you working on?" clearly
- Multiple sessions reference each other as "related"

## Better Approach

Use **PAT-002: Single Active Session**:

1. Finish current session before starting new one
2. Use quick mode for minor related tasks
3. Archive completed sessions monthly
4. Use `--force-new` only for truly independent work

## Examples

### What NOT to Do

```bash
# Parallel sessions without completion
.agents/wb/
  260220_1000_auth-refactor/     # status: active (5 days old)
  260221_1400_oauth-integration/ # status: active (3 days old)
  260222_0900_session-mgmt/      # status: active (2 days old)
  260223_1100_telemetry/         # status: draft
```

### What TO Do

```bash
# Focused completion
.agents/wb/
  260220_1000_auth-refactor/     # status: done
  260221_1400_oauth-integration/ # status: active (current)
  260223_1100_telemetry/         # status: draft (queued)

# Quick tasks in same session
.agents/wb/
  260221_1400_oauth-integration/
    260221_1400_oauth-integration_task_01.md
    260221_1400_oauth-integration_task_02.md  # quick task
    260221_1400_oauth-integration_report_01.md
```

## Evidence

- User correction: "reduce unnecessary creation of new workstream folders"
- `agents-new.py` now enforces one active session policy
- Lesson added to `general-lessons.md`

## Related Patterns

- PAT-002: Single Active Session (solution)
- PAT-004: Quick vs Significant Intake

## Prevention

- Check `.agents/wb/.active_session` before creating new local work
- Run `.agents/agents session list` and `.agents/agents session sweep` before
  opening another parallel session
- Run `.agents/agents verify-tasks` on current session
- Ask: "Can this be a quick task in current session?"
- Weekly review: archive or complete old sessions

## Recovery

If you already have sprawl:

1. List all active sessions: `find .agents/wb -name "task*.md" -exec grep -l "status: active" {} \;`
2. Pick one to complete
3. Mark others as `status: blocked` or `deprecated`
4. Archive completed ones to `.agents/z-arq/`

---

*Pattern: `docs/patterns/anti/PAT-101_workbench-sprawl.md`*
