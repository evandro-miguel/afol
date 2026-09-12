---
doc_type: telemetry_guide
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-09-12T00:00:00Z'
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

### Public Read Commands

AFOL exposes telemetry read-only surfaces for local diagnostics:

```bash
afol telemetry query --json
afol telemetry report --json
afol telemetry export --format jsonl
```

## Event Types (Auto-Captured)

| Event Type | When Captured | Source |
|------------|---------------|--------|
| `session_start` | Creating new workstream | `afol n` |
| `tool_exec` | Using AFOL commands | `afol` |
| `session_end` | Closing workstream | `afol c` |
| `task_complete` | Marking task done | `afol d -x` |
| `blocker` | Manual (optional) | User |
| `error` | Tool failure | Wrapper |
| `task_start` | Starting task work | `afol st` |

## Commands

### Query Events

```bash
afol telemetry query --type task_complete --limit 20
afol telemetry query --session <session-id> --json
```

### Generate Report

```bash
afol telemetry report --json
```

### Export Data

```bash
afol telemetry export --format jsonl
afol telemetry export --json
```

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
| `session_end` | Running `afol c` |
| `task_complete` | Running `afol d <task-id> -x "<cmd>"` |

## Manual Events (Optional)

Manual blocker/error telemetry writes are pending AFOL-native parity. Record
blockers in the governed task/report until the public write command exists.

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

Use `afol telemetry query --session <session-id> --json` for local diagnostics.

### Tool Usage Frequency

Use `afol telemetry report --json` for local diagnostics.

### Success Rate

Use `afol telemetry report --json` and inspect `by_outcome`.

## Troubleshooting

### No events recorded

- Check if `events.jsonl` exists: `ls -la .afol/data/events/`
- Verify write permissions
- Validate project state with `afol validate project --json`

### Invalid JSON

- Run validation with `afol validate project --json`
- Check for manual edits to `events.jsonl`
- Restore from backup if needed

### Missing metadata

- Review event type requirements in schema
- Ensure all required fields are provided
- Check AFOL integration points

## Related

- `docs/patterns/` - Pattern catalog
- `docs/lessons/` - Lessons learned
- `.afol/data/telemetry/schemas/event.json` - Event schema

---

*Telemetry Guide: `docs/telemetry/README.md`*
