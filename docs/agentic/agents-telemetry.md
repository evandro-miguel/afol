---
id: TOOL-015
theme: agents-telemetry
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:51-03:00'
links:
  tools_json: ./tools-json.md
  heat_scoring: ../telemetry/HEAT_SCORING.md
---

# agents-telemetry.py - Automated Telemetry Collection

## Why It Exists

**Problem:** Understanding how the `.agents` system is used requires tracking:

- Which tools are used most
- Session patterns and duration
- Success/failure rates
- Element engagement over time

**Solution:** Automated telemetry collection that tracks usage without manual intervention.

## Function

Collects and analyzes usage data:

1. **Auto-capture** - Records tool execution automatically
2. **Session tracking** - Tracks session start/end
3. **Heat scoring** - Calculates element engagement by period
4. **Reports** - Generates weekly/monthly summaries
5. **Export** - Exports data for external analysis

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/data/telemetry/events.jsonl` | Event log |
| `.agents/data/telemetry/schemas/event.json` | Event schema |
| `.agents/wb/.active_session` | Current session |

### Files Written

| File | Purpose |
|------|---------|
| `.agents/data/telemetry/events.jsonl` | Appends events |
| `docs/telemetry/reports/*.md` | Generated reports |

## How to Configure

### agents.config

```yaml
telemetry:
  enabled: true
  data_dir: ".agents/data/telemetry"
  auto_record_sessions: true
  retention_days: 90
```

## How to Use

### Commands

```bash
# Record event (manual)
python3 .agents/scripts/agents-telemetry.py record session_start \
  --metadata='{"theme":"my-feature"}'

# Query events
python3 .agents/scripts/agents-telemetry.py query --limit=20

# Generate report
python3 .agents/scripts/agents-telemetry.py report --period=weekly

# Heat map
python3 .agents/scripts/agents-telemetry.py heat --period=weekly

# Hot elements
python3 .agents/scripts/agents-telemetry.py hot --limit=10

# Cold elements
python3 .agents/scripts/agents-telemetry.py cold --limit=10

# Export data
python3 .agents/scripts/agents-telemetry.py export --format=json

# Validate
python3 .agents/scripts/agents-telemetry.py validate
```

### Via legacy just command runner

```bash
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
```

## How to Modify

### Main Functions

```python
def record_event(event_type, session_id, metadata):
    """Record telemetry event."""

def load_events(limit, filters):
    """Load events with filters."""

def generate_report(period):
    """Generate periodic report."""

def calculate_heat_scores(period):
    """Calculate heat scores by period."""
```

### Add New Event Type

1. Add to `valid_event_types` list
2. Update schema in `event.json`
3. Update documentation

## Event Types

| Event | Auto | Manual | Description |
|-------|------|--------|-------------|
| `session_start` | ✅ | ✅ | New workstream created |
| `session_end` | ✅ | ✅ | Workstream completed |
| `tool_exec` | ✅ | ❌ | Tool executed |
| `task_complete` | ✅ | ✅ | Task marked done |
| `pattern_applied` | ✅ | ❌ | Pattern applied |
| `element_access` | ✅ | ❌ | Element accessed |
| `blocker` | ❌ | ✅ | Blocker encountered |
| `error` | ✅ | ❌ | Error occurred |

## Heat Scoring

### Formula

```text
heat_score = (frequency × 0.5) + (recency × 0.3) + (success × 0.2)
```

### Levels

| Level | Score | Meaning |
|-------|-------|---------|
| 🔴 Hot | 70-100 | High engagement |
| 🟡 Warm | 40-69 | Moderate engagement |
| 🔵 Cold | 0-39 | Low engagement |

### Periods

| Period | Window | Use Case |
|--------|--------|----------|
| daily | 24 hours | Current activity |
| weekly | 7 days | Sprint focus |
| monthly | 30 days | Monthly trends |
| all | All time | Historical |

## Output Examples

### Heat Map

```text
======================================================================
🔥 HEAT MAP - Element Usage & Engagement (weekly)
======================================================================
Period: 2026-02-16 → 2026-02-23

Total Elements: 6
🔴 Hot (score >= 70): 1
🟡 Warm (score 40-69): 5
🔵 Cold (score < 40): 0
```

### Report

```text
======================================================================
TELEMETRY REPORT
======================================================================
Period: weekly
Generated: 2026-02-23T21:46:17Z

SUMMARY
----------------------------------------
  Total Events: 16
  Total Sessions: 2
  Success Rate: 100.0%
```

## Related

- [HEAT_SCORING.md](../telemetry/HEAT_SCORING.md) - Heat scoring guide
- [tools-json.md](./tools-json.md) - Tool catalog
- [agents-new.md](./agents-new.md) - Session creation

---

*Document: `docs/agentic/agents-telemetry.md`*
