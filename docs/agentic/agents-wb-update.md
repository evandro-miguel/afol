---
id: TOOL-010
theme: agents-wb-update
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:53-03:00'
links:
  tools_json: ./tools-json.md
  new: ./agents-new.md
---

# agents-wb-update.py - Workbench Automation

## Why It Exists

**Problem:** Keeping workbench updated requires repetitive low-value tasks:

- Update `updated_at` in frontmatter
- Normalize timestamps
- Update list of modified files
- Mark tasks as complete
- Add timeline entries

**Solution:** Automation that executes these tasks with one command.

## Function

Automates workbench updates:

1. **touch** - Updates `updated_at`
2. **normalize-time** - Normalizes timestamps to WB timezone
3. **files-changed** - Updates "Files Changed" section in report
4. **task** - Marks task by ID (done, in_progress, etc.)
5. **status** - Set status in frontmatter
6. **timeline** - Adds timeline entry to log
7. **link** - Set `links.<key>` in frontmatter

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/data/session/.active_session` | Project-local convenience pointer |
| `docs/plans/*/*.md` | Plan/session documents |
| `.agents/agents.config` | Config (WB_OFFSET, etc.) |

### Files Written

| Command | File | Change |
|---------|------|--------|
| `touch` | Session files | `updated_at` in frontmatter |
| `task` | `*_task_*.md` | Task marker |
| `status` | Session files | `status` in frontmatter |
| `timeline` | `*_log_*.md` | Timeline entry |
| `files-changed` | `*_report_*.md` | File list |
| `link` | Session files | `links.<key>` in frontmatter |

## How to Configure

### agents.config

```yaml
time:
  wb_offset: "-03:00"  # Workbench timezone
```

## How to Modify

### Add New Subcommand

```python
def cmd_new_command(args):
    """New subcommand."""
    session = get_active_session()
    # Implement logic
    save_session(session)
```

## How to Use

```bash
# Update updated_at
./.agents/agents wb-update touch

# Mark task as done only after recording passing closure evidence
./.agents/agents wb-update evidence T-01 --session <session-id> --command "just lint" --result passed --artifact docs/plans/<session-id>/<session-id>_report_01.md
./.agents/agents wb-update task T-01 --session <session-id> --mark-done --evidence-id E-...

# Target a session through the process environment when the wrapper supports it.
# Set AGENTS_SESSION_ID before this command.
./.agents/agents wb-update task T-01 --mark-in-progress

# Use strict mode by also setting AGENTS_SESSION_STRICT before the command.
./.agents/agents wb-update task T-01 --mark-in-progress

# Set status
./.agents/agents wb-update status --value active --file plan

# Add timeline entry
./.agents/agents wb-update timeline --message "Implemented login"

# Update files changed
./.agents/agents wb-update files-changed

# Via legacy just command runner
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
AFOL-native command pending; do not use legacy just command runners.
```

## Related

- [agents-new.md](./agents-new.md) - Workstream creation
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-wb-update.md`*
