---
doc_type: telemetry_guide
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:37:05-03:00'
---

# Telemetry Guide

## Purpose

Track and analyze AFOL scaffold usage, session metrics, and work patterns.

## Quick Start

Telemetry is automated where AFOL-native commands emit events. No manual
recording is required for the current public path.

AFOL lifecycle and validation commands may capture:

- Tool usage
- Session start/end
- Task completion
- Errors and blockers

### Manual Commands (Optional)

Manual telemetry query/report/export commands are pending AFOL-native parity. Do
not use retired compatibility command runners as public workflows.

## Event Types (Auto-Captured)

| Event Type | When Captured | Source |
|------------|---------------|--------|
| `session_start` | Creating new workstream | `afol n` |
| `tool_exec` | Using AFOL commands | `afol` |
| `session_end` | Closing workstream | `afol c` |
| `task_complete` | Marking task done | `afol d` |
| `blocker` | Manual (optional) | User |
| `error` | Tool failure | Wrapper |
| `pattern_applied` | Using pattern suggestion | AFOL-native command pending |

## Commands

### Query Events

AFOL-native telemetry query is pending. Until it lands, inspect telemetry data as
JSONL only for factory debugging and do not document legacy command fallbacks.

### Generate Report

AFOL-native report generation is pending.

### Export Data

AFOL-native export is pending.

### Validate

```bash
afol validate project --json
```

## Data Storage

Events are stored in:

```text
.afol/data/events/events.jsonl
```

Format: JSONL (one JSON object per line)

Schema: `.afol/data/telemetry/schemas/event.json`

## What's Automatic

The following events are captured **automatically** - no manual action needed:

| Event | Trigger |
|-------|---------|
| `tool_exec` | AFOL command execution |
| `session_start` | Running `afol n <theme>` |
| `session_end` | Running `afol c -S <session-id>` |
| `task_complete` | Running `afol d -S <session-id> -T <task-id> -x <command>` |

## Manual Events (Optional)

Manual blocker/error telemetry is pending AFOL-native parity. Record blockers in
the governed task/report until the public command exists.

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

Use JSONL inspection with `jq` only for local factory diagnostics.

### Tool Usage Frequency

Use JSONL inspection with `jq` only for local factory diagnostics.

### Success Rate

AFOL-native success-rate reporting is pending.

## Troubleshooting

### No events recorded

- Check if `events.jsonl` exists: `ls -la .afol/data/events/`
- Verify write permissions
- Validate project state with `afol validate --json`

### Invalid JSON

- Run validation with `afol validate --json`
- Check for manual edits to `events.jsonl`
- Restore from backup if needed

### Missing metadata

- Review event type requirements in schema
- Ensure all required fields are provided
- Check AFOL integration points

## Related

- `docs/patterns/` - Pattern catalog
- `docs/lessons/` - Lessons learned
- `.agents/tools.json` - Tool catalog

---

*Telemetry Guide: `docs/telemetry/README.md`*
