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

# Workbench Automation

## Why It Exists

**Problem:** Keeping workbench updated requires repetitive low-value tasks:

- Update `updated_at` in frontmatter
- Normalize timestamps
- Update list of modified files
- Mark tasks as complete
- Add timeline entries

**Solution:** Use AFOL-native lifecycle commands for supported transitions and
keep remaining wrapper-only operations as factory migration debt.

## Function

Automates workbench updates:

1. **new** - Creates governed sessions under `.afol/wb/`
2. **st** - Starts a task
3. **d** - Records task evidence and marks done when evidence passes
4. **c** - Closes the session after strict evidence exists
5. **validate / verify-tasks** - Checks project and task contracts

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.afol/wb/.active_session` | Project-local convenience pointer |
| `.afol/wb/*/*.md` | Plan/session documents |
| `.agents/data/` | Local mutable pointers and indexes |

### Files Written

| Command | File | Change |
|---------|------|--------|
| `afol n` | Session files | Plan/task/log/report baseline |
| `afol st` | `*_task_*.md` | Task marker to in_progress |
| `afol d` | `.evidence.jsonl`, task file | Evidence row and done marker |
| `afol c` | Session files | Closure status after verification |
| `afol local-state rebuild` | `.agents/data/` | Local mutable indexes |

## How to Configure

### agents.config

```yaml
time:
  wb_offset: "-03:00"  # Workbench timezone
```

## How to Modify

### Add New AFOL Subcommand

Implement new workbench behavior under `cli/**`, add focused Bun tests, and run
`afol validate --changed-path <path>` plus the relevant package gate.

## How to Use

No public `afol wb-update` verb exists. Use native `afol` lifecycle verbs where
they exist; do not document wrapper-only operations as downstream workflows.

```bash
# Create a session
afol n <theme> --feature-id <F-id> --parent-spec <spec-id>

# Start a task
afol st -S <session-id> -T T-01

# Record passing evidence and close
afol d -S <session-id> -T T-01 -x "afol validate"
afol c -S <session-id>

# Rebuild local mutable indexes when validation reports stale local state
afol local-state rebuild
```

## Related

- [agents-new.md](./agents-new.md) - Workstream creation
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-wb-update.md`*
