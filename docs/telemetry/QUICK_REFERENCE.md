---
doc_type: quick_reference
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
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
make telemetry-report
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
make telemetry-report

# Monthly report
make telemetry-report PERIOD=monthly

# JSON format
make telemetry-report FORMAT=json

# All time
make telemetry-report PERIOD=all
```

### Export & Validate
```bash
# Export to JSON
make telemetry-export FORMAT=json OUTPUT=backup.json

# Export to CSV
make telemetry-export FORMAT=csv

# Validate schema
make telemetry-validate
```

---

## Patterns Commands

### Discover Patterns
```bash
# Suggest by theme
make patterns-suggest THEME=auth-refactor

# Suggest by tags
make patterns-suggest TAGS=process,tools

# List all
make patterns-list

# Filter by type
make patterns-list TYPE=success

# Show details
make patterns-show PATTERN_ID=PAT-001
```

### Apply & Rate
```bash
# Apply pattern (records in telemetry)
make patterns-apply PATTERN_ID=PAT-001

# Rate effectiveness
make patterns-rate PATTERN_ID=PAT-001 EFFECTIVENESS=high
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
make patterns-suggest THEME=my-feature

# 2. Apply relevant pattern
make patterns-apply PATTERN_ID=PAT-001

# 3. Record session start
make telemetry-record EVENT_TYPE=session_start METADATA='{"theme":"my-feature"}'
```

### During Work
```bash
# Record tool usage
make telemetry-record EVENT_TYPE=tool_exec METADATA='{"tool_name":"agents-new","outcome":"success"}'

# Record blocker
make telemetry-record EVENT_TYPE=blocker METADATA='{"blocker_reason":"need clarification"}'
```

### Complete Session
```bash
# Record session end
make telemetry-record EVENT_TYPE=session_end OUTCOME=success METADATA='{"duration_seconds":3600}'

# Generate report
make telemetry-report
```

### Weekly Review
```bash
# Generate weekly report
make telemetry-report PERIOD=weekly

# Review patterns applied
python3 .agents/scripts/agents-telemetry.py query --event-type=pattern_applied --since=2026-02-17

# Export for analysis
make telemetry-export FORMAT=json OUTPUT=weekly_backup.json
```

---

## File Locations

```
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
    ├── INDEX.md                 # Catalog
    └── TEMPLATE_pattern.md      # Template
```

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
| Invalid JSON | Run `make telemetry-validate` |
| Pattern not found | Check ID format: `PAT-001` |
| Make target fails | Verify syntax: `make telemetry-report PERIOD=weekly` |

---

*Quick Reference: `docs/telemetry/QUICK_REFERENCE.md`*
