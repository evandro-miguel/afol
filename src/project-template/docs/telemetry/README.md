---
doc_type: telemetry_guide
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:37:15-03:00'
---

# Telemetry Guide

## Purpose

Track and analyze .agents system usage, session metrics, and work patterns.
In the template export, telemetry is a data-and-index contract: the stored
events, schemas, and report locations remain, while any command surface is
owned by the downstream CLI.

## Quick Start

**Telemetry is fully automated!** No manual recording needed.

Every time you use the front door (`afol` or `./a`), telemetry is captured
automatically by the runtime:

- Tool usage
- Session start/end
- Task completion
- Errors and blockers

### CLI-Owned / Future Surfaces

If the downstream CLI exposes telemetry commands, invoke them through `afol`
or `./a`. Otherwise, treat report, export, validation, and index generation as
future CLI-owned work and inspect the raw event files directly.

```bash
# Recent events
jq -r '.event_type' .agents/data/telemetry/events.jsonl

# Tool executions only
jq 'select(.event_type == "tool_exec")' .agents/data/telemetry/events.jsonl
```

## Event Types (Auto-Captured)

| Event Type | When Captured | Source |
|------------|---------------|--------|
| `session_start` | Creating new workstream | Front-door runtime |
| `tool_exec` | Using any front-door command | Front-door wrapper |
| `session_end` | Completing workstream | Workbench close flow |
| `task_complete` | Marking task done | Task closure evidence |
| `blocker` | Manual (optional) | User |
| `error` | Tool failure | Wrapper |
| `pattern_applied` | Using pattern suggestion | Pattern helper |

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
| `tool_exec` | Every front-door command |
| `session_start` | Running `afol n <theme>` |
| `session_end` | Closing a workstream through the front door |
| `task_complete` | Recording task completion evidence |

## Manual Events (Optional)

For blockers, errors, or custom events, use the downstream CLI when it exists;
otherwise keep the raw JSONL files as the source of truth.

```bash
# Inspect the latest blocker records
jq 'select(.event_type == "blocker")' .agents/data/telemetry/events.jsonl
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
jq 'select(.event_type == "session_end") | {session: .session_id, duration: .metadata.duration_seconds}' \
  .agents/data/telemetry/events.jsonl
```

### Tool Usage Frequency

```bash
jq -r 'select(.event_type == "tool_exec") | .metadata.tool_name' \
  .agents/data/telemetry/events.jsonl | sort | uniq -c | sort -rn
```

### Success Rate

```bash
echo "Use the downstream CLI report when available; otherwise aggregate from .agents/data/telemetry/events.jsonl"
```

## Troubleshooting

### No events recorded

- Check if `events.jsonl` exists: `ls -la .agents/data/telemetry/`
- Verify write permissions
- Check event schema with the downstream CLI when available
- Otherwise inspect the JSONL structure directly with `jq`

### Invalid JSON

- Check for manual edits to `events.jsonl`
- Restore from backup if needed
- Validate against the schema with the downstream CLI when available

### Missing metadata

- Review event type requirements in schema
- Ensure all required fields are provided
- Check the front-door integration points

## Related

- `docs/patterns/` - Pattern catalog
- `docs/lessons/` - Lessons learned

---

*Telemetry Guide: `docs/telemetry/README.md`*
