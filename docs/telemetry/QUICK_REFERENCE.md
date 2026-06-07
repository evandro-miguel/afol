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
AFOL-native command pending; do not use legacy just command runners.
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
AFOL-native command pending; do not use legacy just command runners.

# Monthly report
AFOL-native command pending; do not use legacy just command runners.

# JSON format
AFOL-native command pending; do not use legacy just command runners.

# All time
AFOL-native command pending; do not use legacy just command runners.
```

### Export & Validate

```bash
# Export to JSON
AFOL-native command pending; do not use legacy just command runners.

# Export to CSV
AFOL-native command pending; do not use legacy just command runners.

# Validate schema
AFOL-native command pending; do not use legacy just command runners.
```

---

## Patterns Commands

### Discover Patterns

```bash
# Suggest by theme
AFOL-native command pending; do not use legacy just command runners.

# Suggest by tags
AFOL-native command pending; do not use legacy just command runners.

# List all
AFOL-native command pending; do not use legacy just command runners.

# Filter by type
AFOL-native command pending; do not use legacy just command runners.

# Show details
AFOL-native command pending; do not use legacy just command runners.
```

### Apply & Rate

```bash
# Apply pattern (records in telemetry)
AFOL-native command pending; do not use legacy just command runners.

# Rate effectiveness
AFOL-native command pending; do not use legacy just command runners.
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
AFOL-native command pending; do not use legacy just command runners.

# 2. Apply relevant pattern
AFOL-native command pending; do not use legacy just command runners.

# 3. Record session start
AFOL-native command pending; do not use legacy just command runners.
```

### During Work

```bash
# Record tool usage
AFOL-native command pending; do not use legacy just command runners.

# Record blocker
AFOL-native command pending; do not use legacy just command runners.
```

### Complete Session

```bash
# Record session end
AFOL-native command pending; do not use legacy just command runners.

# Generate report
AFOL-native command pending; do not use legacy just command runners.
```

### Weekly Review

```bash
# Generate weekly report
AFOL-native command pending; do not use legacy just command runners.

# Review patterns applied
python3 .agents/scripts/agents-telemetry.py query --event-type=pattern_applied --since=2026-02-17

# Export for analysis
AFOL-native command pending; do not use legacy just command runners.
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
| Just recipe fails | Verify syntax: `afol telemetry command pending PERIOD=weekly` |

---

*Quick Reference: `docs/telemetry/QUICK_REFERENCE.md`*
