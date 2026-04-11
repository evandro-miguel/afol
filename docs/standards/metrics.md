---
doc_type: standard
id: "000000_000000_metrics-standard_standard_01"
status: active
created_at: 2026-02-23T00:00:00Z
updated_at: 2026-02-23T00:00:00Z
title: "Metrics and Logging Standard"
---

## Metrics and Logging Standard

This document defines the standard for capturing usage metrics and events in the agent system.

### Event Log Format

Simple append-only log format for tracking execution events.

#### Format

```text
<timestamp> | <session_id> | <doc_type> | <event> | <result> | <duration_min>
```

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| timestamp | ISO 8601 | UTC time of event |
| session_id | string | Session identifier (e.g., 260223_1430_theme) |
| doc_type | string | Type of document (plan, task, report, etc.) |
| event | string | Event type (created, completed, failed) |
| result | string | Outcome (pass, fail, skipped) |
| duration_min | integer | Optional: Duration in minutes |

#### Example

```text
2026-02-23T14:30:00Z | 260223_1430_auth-refactor | task | completed | pass | 18
2026-02-23T14:45:00Z | 260223_1430_auth-refactor | report | created | pass | 5
2026-02-23T15:00:00Z | 260223_1500_bug-fix | task | failed | fail | 12
```

### Log Location

Event logs should be stored in:

```text
.agents/logs/usage.log
```

Or in session-specific logs:

```text
.agents/wb/<session_id>/session.log
```

### Session Analysis

#### Metrics to Collect

1. **Count by doc_type**: How many plans/tasks/reports created
2. **Completion rate**: Tasks completed vs abandoned
3. **Duration**: Average time per session
4. **Result distribution**: pass/fail/skipped ratios

#### Analysis Commands

```bash
# Count by document type
grep "task" .agents/logs/usage.log | wc -l

# Completion rate
grep -c "completed.*pass" .agents/logs/usage.log

# Average duration
awk -F'|' '{sum+=$6; count++} END {print sum/count}' .agents/logs/usage.log
```

### Integration with Task Workflow

When completing a task, agents should optionally log:

```markdown
## Session Log Entry
<!-- After completing task, add entry to session log -->

- [timestamp] Task <task_id> completed: <result>
```

### Guidelines

- Logs are append-only
- Do not modify historical entries
- Use UTC timestamps consistently
- Keep logs local (add to .gitignore if sensitive)

---

*Standard: `docs/standards/metrics.md`*
