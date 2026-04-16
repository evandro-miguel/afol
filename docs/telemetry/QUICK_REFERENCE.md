---
doc_type: quick_reference
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T19:37:04-03:00'
---

# Telemetry & Patterns Quick Reference

## Automated Telemetry

**No manual recording needed!** Telemetry is automatic.

Every time you run `.agents/agents <command>`, the system captures:

- Tool usage (`tool_exec`)
- Session start/end
- Task completion
- Errors (if any)

### Just Use the System

```bash
# Create new workstream → auto-records session_start + tool_exec
.agents/agents new my-feature

# Use any tool → auto-records tool_exec
.agents/agents doctor
.agents/agents verify
.agents/agents structure

# Generate report (view collected data)
just telemetry-report
```

### Query Events

```bash
# Recent events
python3 .agents/scripts/agents-telemetry.py query --limit=20

# By type
python3 .agents/scripts/agents-telemetry.py query --event-type=tool_exec

# By session
python3 .agents/scripts/agents-telemetry.py query --session-id=260223_1800_my-theme

# Date range
python3 .agents/scripts/agents-telemetry.py query --since=2026-02-20T00:00:00Z

# Export JSON
python3 .agents/scripts/agents-telemetry.py query --format=json --limit=100
```

### Reports

```bash
# Weekly report
just telemetry-report

# Monthly report
just telemetry-report PERIOD=monthly

# JSON format
just telemetry-report FORMAT=json

# All time
just telemetry-report PERIOD=all
```

### Export & Validate

```bash
# Export to JSON
just telemetry-export FORMAT=json OUTPUT=backup.json

# Export to CSV
just telemetry-export FORMAT=csv

# Validate schema
just telemetry-validate
```

---

## Patterns Commands

### Discover Patterns

```bash
# Suggest by theme
just patterns-suggest THEME=auth-refactor

# Suggest by tags
just patterns-suggest TAGS=process,tools

# List all
just patterns-list

# Filter by type
just patterns-list TYPE=success

# Show details
just patterns-show PATTERN_ID=PAT-001
```

### Apply & Rate

```bash
# Apply pattern (records in telemetry)
just patterns-apply PATTERN_ID=PAT-001

# Rate effectiveness
just patterns-rate PATTERN_ID=PAT-001 EFFECTIVENESS=high
```

---

## Event Types Reference

| Event Type | When | Required Metadata |
|------------|------|-------------------|
| `session_start` | Starting work | `theme` |
| `session_end` | Completing work | `outcome`, `duration_seconds` |
| `tool_exec` | Using tool | `tool_name`, `outcome` |
| `task_complete` | Finishing task | `task_id`, `outcome` |
| `blocker` | Blocked | `blocker_reason` |
| `error` | Error occurred | `error_message` |
| `pattern_applied` | Used pattern | `pattern_id` |

---

## Pattern Types Reference

| Type | Location | Purpose |
|------|----------|---------|
| `success` | `patterns/success/` | Proven approaches |
| `anti` | `patterns/anti/` | What to avoid |
| `tool` | `patterns/tools/` | Tool effectiveness |
| `template` | `patterns/templates/` | Template patterns |

---

## Common Workflows

### Start Work Session

```bash
# 1. Get pattern suggestions
just patterns-suggest THEME=my-feature

# 2. Apply relevant pattern
just patterns-apply PATTERN_ID=PAT-001

# 3. Record session start
just telemetry-record EVENT_TYPE=session_start METADATA='{"theme":"my-feature"}'
```

### During Work

```bash
# Record tool usage
just telemetry-record EVENT_TYPE=tool_exec METADATA='{"tool_name":"agents-new","outcome":"success"}'

# Record blocker
just telemetry-record EVENT_TYPE=blocker METADATA='{"blocker_reason":"need clarification"}'
```

### Complete Session

```bash
# Record session end
just telemetry-record EVENT_TYPE=session_end OUTCOME=success METADATA='{"duration_seconds":3600}'

# Generate report
just telemetry-report
```

### Weekly Review

```bash
# Generate weekly report
just telemetry-report PERIOD=weekly

# Review patterns applied
python3 .agents/scripts/agents-telemetry.py query --event-type=pattern_applied --since=2026-02-17

# Export for analysis
just telemetry-export FORMAT=json OUTPUT=weekly_backup.json
```

---

## File Locations

```text
.agents/
├── scripts/
│   ├── agents-telemetry.py      # Telemetry CLI
│   └── agents-patterns.py       # Patterns CLI
├── data/
│   └── telemetry/
│       ├── events.jsonl         # Event storage
│       └── schemas/event.json   # Schema
├── tools.json                   # Tool catalog (updated)
└── agents.config                # Config (updated)

docs/
├── telemetry/
│   ├── reports/                 # Generated reports
│   ├── dashboard.md             # Dashboard
│   └── README.md                # Guide
└── patterns/
    ├── success/                 # Success patterns
    ├── anti/                    # Anti-patterns
    └── INDEX.md                 # Catalog
```

Template source: `docs/templates/pattern.md`.

---

## Integration Points

### For Tool Developers

```python
# In your tool script
from pathlib import Path
import json

TELEMETRY_SCRIPT = Path(__file__).parent / "agents-telemetry.py"

def record_event(event_type, session_id, metadata):
    cmd = f'python3 {TELEMETRY_SCRIPT} record {event_type}'
    cmd += f' --session-id="{session_id}"'
    cmd += f" --metadata='{json.dumps(metadata)}'"
    os.system(cmd)

# Usage
record_event("tool_exec", session_id, {
    "tool_name": "my-tool",
    "outcome": "success"
})
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No events recorded | Check `events.jsonl` exists and is writable |
| Invalid JSON | Run `just telemetry-validate` |
| Pattern not found | Check ID format: `PAT-001` |
| Just recipe fails | Verify syntax: `just telemetry-report PERIOD=weekly` |

---

*Quick Reference: `docs/telemetry/QUICK_REFERENCE.md`*
