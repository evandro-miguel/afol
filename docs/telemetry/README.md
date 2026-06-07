---
doc_type: telemetry_guide
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:37:05-03:00'
---

# Telemetry Guide

## Purpose

Track and analyze .agents system usage, session metrics, and work patterns.

## Quick Start

**Telemetry is fully automated!** No manual recording needed.

Every time you use `.agents/agents <command>`, telemetry is captured automatically:

- Tool usage
- Session start/end
- Task completion
- Errors and blockers

### Manual Commands (Optional)

```bash
# Generate weekly report
AFOL-native command pending; do not use legacy just command runners.

# Export all data
AFOL-native command pending; do not use legacy just command runners.

# Query events
python3 .agents/scripts/agents-telemetry.py query --limit=20
```

## Event Types (Auto-Captured)

| Event Type | When Captured | Source |
|------------|---------------|--------|
| `session_start` | Creating new workstream | `agents-new.py` |
| `tool_exec` | Using any `.agents/agents <tool>` | `.agents/agents` wrapper |
| `session_end` | Completing workstream | `agents-wb-update.py touch` |
| `task_complete` | Marking task done | `verify-tasks.py` |
| `blocker` | Manual (optional) | User |
| `error` | Tool failure | Wrapper |
| `pattern_applied` | Using pattern suggestion | `agents-patterns.py` |

## Commands

### Query Events

```bash
# All events
python3 .agents/scripts/agents-telemetry.py query

# Filter by type
python3 .agents/scripts/agents-telemetry.py query --event-type=tool_exec

# Filter by session
python3 .agents/scripts/agents-telemetry.py query --session-id=260223_1800_my-theme

# Date range
python3 .agents/scripts/agents-telemetry.py query --since=2026-02-20T00:00:00Z --until=2026-02-23T23:59:59Z

# Export as JSON
python3 .agents/scripts/agents-telemetry.py query --format=json --limit=50
```

### Generate Report

```bash
# Weekly report (default)
AFOL-native command pending; do not use legacy just command runners.

# Monthly report
AFOL-native command pending; do not use legacy just command runners.

# JSON format
AFOL-native command pending; do not use legacy just command runners.

# All time
AFOL-native command pending; do not use legacy just command runners.
```

### Export Data

```bash
# JSON export
AFOL-native command pending; do not use legacy just command runners.

# CSV export
AFOL-native command pending; do not use legacy just command runners.

# Custom output path
AFOL-native command pending; do not use legacy just command runners.
```

### Validate

```bash
# Validate all events against schema
AFOL-native command pending; do not use legacy just command runners.
```

## Data Storage

Events are stored in:

```text
.agents/data/telemetry/events.jsonl
```

Format: JSONL (one JSON object per line)

Schema: `.agents/data/telemetry/schemas/event.json`

## What's Automatic

The following events are captured **automatically** - no manual action needed:

| Event | Trigger |
|-------|---------|
| `tool_exec` | Every `.agents/agents <command>` |
| `session_start` | Running `.agents/agents new <theme>` |
| `session_end` | Running `.agents/agents wb-update touch` |
| `task_complete` | Running `.agents/agents verify-tasks` |

## Manual Events (Optional)

For blockers, errors, or custom events, you can manually record:

```bash
# Blocker (optional)
python3 .agents/scripts/agents-telemetry.py record blocker \
  --metadata='{"blocker_reason":"waiting for review"}'

# Error (optional)
python3 .agents/scripts/agents-telemetry.py record error \
  --metadata='{"error_message":"something failed"}'
```

## Privacy & Security

**What is NOT collected:**

- Code content
- File contents
- Secrets or credentials
- User input data

**What IS collected:**

- Event timestamps
- Session IDs
- Event types
- Aggregated metrics (counts, durations)
- Tool names (not arguments)

## Analysis Examples

### Session Duration Trend

```bash
python3 .agents/scripts/agents-telemetry.py query --event-type=session_end --format=json | \
  jq '.[] | {session: .session_id, duration: .metadata.duration_seconds}'
```

### Tool Usage Frequency

```bash
python3 .agents/scripts/agents-telemetry.py query --event-type=tool_exec --format=json | \
  jq -r '.[].metadata.tool_name' | sort | uniq -c | sort -rn
```

### Success Rate

```bash
AFOL-native command pending; do not use legacy just command runners.
  jq '.summary.success_rate'
```

## Troubleshooting

### No events recorded

- Check if `events.jsonl` exists: `ls -la .agents/data/telemetry/`
- Verify write permissions
- Check event schema: `python3 .agents/scripts/agents-telemetry.py validate`

### Invalid JSON

- Run validation: `just telemetry-validate`
- Check for manual edits to `events.jsonl`
- Restore from backup if needed

### Missing metadata

- Review event type requirements in schema
- Ensure all required fields are provided
- Check script integration points

## Related

- `docs/patterns/` - Pattern catalog
- `docs/lessons/` - Lessons learned
- `.agents/tools.json` - Tool catalog

---

*Telemetry Guide: `docs/telemetry/README.md`*
