---
doc_type: architecture
id: telemetry-auto-architecture
status: active
created_at: '2026-02-23T21:45:00Z'
updated_at: '2026-05-04T16:08:31-03:00'
---

# Telemetry Automation Architecture

## Overview

Telemetry system for .agents is **fully automated** - no manual recording required.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    User runs command                         │
│              .agents/agents <tool> [args]                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  .agents/agents (wrapper)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Execute tool via local venv entrypoint             │   │
│  │ 2. record_tool_telemetry() → tool_exec event         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              agents-telemetry.py record                      │
│  - Captures: session_id, tool_name, outcome, timestamp      │
│  - Appends to: .agents/data/telemetry/events.jsonl          │
└─────────────────────────────────────────────────────────────┘
```

## Auto-Capture Points

| Tool/Command | Event Captured | Metadata |
|--------------|----------------|----------|
| `.agents/agents new <theme>` | `session_start` + `tool_exec` | theme, workstream_type |
| `.agents/agents doctor` | `tool_exec` | tool_name=doctor |
| `.agents/agents verify` | `tool_exec` | tool_name=verify-tasks |
| `.agents/agents structure` | `tool_exec` | tool_name=structure-map |
| `.agents/agents lint` | `tool_exec` | tool_name=lint-docs |
| `.agents/agents sync` | `tool_exec` | tool_name=sync |
| `.agents/agents tools` | `tool_exec` | tool_name=tools |
| `.agents/agents wb-update touch` | `tool_exec` + `session_end` | duration, outcome |
| All tools | `tool_exec` | tool_name, outcome |

## Pattern Suggestions

When creating a new workstream:

```text
.agents/agents new auth-refactor
                     │
                     ▼
        ┌────────────────────────┐
        │  agents-new.py         │
        │  - Creates session     │
        │  - Records session_start│
        │  - Suggests patterns   │◄──┐
        └────────────────────────┘   │
                     │               │
                     ▼               │
        📋 Suggested patterns:       │
        - PAT-001: Discovery-First   │
        - PAT-002: Single Session    │
                                     │
        User applies pattern ────────┘
                     │
                     ▼
        pattern_applied event recorded
```

## Data Flow

```text
User Command
    │
    ▼
.agents/agents (bash wrapper)
    │
    ├─► Execute tool (local venv entrypoint)
    │
    └─► record_tool_telemetry()
            │
            ▼
        agents-telemetry.py
            │
            ├─► Get session_id from .active_session
            │
            ├─► Build event JSON
            │
            └─► Append to .agents/data/telemetry/events.jsonl
```

## File Structure

```text
.agents/
├── agents                      # Wrapper with auto-telemetry
├── scripts/
│   ├── agents-telemetry.py     # Telemetry collection
│   ├── agents-patterns.py      # Pattern suggestions
│   └── agents-new.py           # Auto session_start + patterns
│
├── data/                       # ← Operational data
│   └── telemetry/
│       ├── events.jsonl        # Raw events (auto-populated)
│       └── schemas/
│           └── event.json      # Event schema
│
docs/                           # ← Project-owned documentation
└── telemetry/
    ├── README.md              # Usage guide
    ├── QUICK_REFERENCE.md     # Quick reference
    ├── dashboard.md           # Metrics dashboard
    └── reports/
        └── *.md               # Generated reports
```

## Key Design Decisions

### 1. Zero Manual Recording

- User never calls `telemetry-record`
- All capture is automatic via wrapper
- Manual recording only for edge cases (blockers, custom events)

### 2. Non-Blocking Failures

- Telemetry errors are logged to project-local `.agents/tmp/` files when the
  caller needs to keep primary command output clean.
- System must not interfere with primary tool function
- Telemetry is observability, not core functionality

### 3. Separation of Concerns

- `.agents/data/` - Operational data (events, schemas)
- `.agents/scripts/` - Executable code
- `docs/` - Documentation only

### 4. Pattern Integration

- Auto-suggest on session creation
- Apply records in telemetry
- Effectiveness tracked via usage correlation

## Reports & Analysis

### Weekly Report

```bash
just telemetry-report PERIOD=weekly
```

Output includes:

- Total sessions, events
- Tool usage breakdown
- Success rate
- Blockers and errors
- Pattern applications

### Dashboard

Auto-populated from reports:

- `docs/telemetry/dashboard.md`

## Privacy

**Not collected:**

- Code content
- File contents
- Command arguments
- User input

**Collected:**

- Tool names
- Timestamps
- Session IDs
- Outcomes (success/failure)
- Duration (for sessions)

## Extension Points

### Adding New Auto-Capture

1. **New tool**: Add to `.agents/agents` wrapper:

   ```bash
   my-tool)
       run_and_record "my-tool" "agents-my-tool.py" "$@"
       ;;
   ```

2. **Custom events**: In your script:

   ```python
   from pathlib import Path
   import subprocess

   TELEMETRY = Path(__file__).parent / "agents-telemetry.py"
   subprocess.run([TELEMETRY, "record", "custom_event", ...])
   ```

### Custom Analysis

```bash
# Export to external BI tool
just telemetry-export FORMAT=json OUTPUT=/tmp/telemetry.json

# Query specific patterns
python3 .agents/scripts/agents-telemetry.py query \
  --event-type=pattern_applied \
  --format=json
```

---

*Architecture: `docs/telemetry/auto-architecture.md`*
