---
id: TOOL-009
theme: verify-tasks
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# verify-tasks.py - Task Verification

## Why It Exists

**Problem:** Workstreams can have pending tasks without clear warning. Before marking workstream as complete, it's necessary to:
- Verify all tasks are complete
- Identify blocked tasks
- Report overall status

**Solution:** Automatic verification that scans task files and reports status.

## Function

Checks task completion:

1. **Scans task files** - `*_task_*.md`
2. **Extracts tasks** - Regex for markers
3. **Classifies status** - pending, in_progress, done, etc.
4. **Reports** - Lists status of each task
5. **Exit code** - 0 if all complete, 1 if pending

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/wb/*/`*`_task_*.md` | Task files to verify |

### Files Written

| File | Purpose |
|------|---------|
| None | Read-only and reporting |

## How to Configure

### Task Markers

```python
MARKERS = {
    'pending': r'- \[ \]',
    'in_progress': r'- \[/\]',
    'ready_for_test': r'- \[%\]',
    'blocked': r'- \[!\]',
    'skipped': r'- \[>\]',
    'completed': r'- \[x\]',
}
```

## How to Modify

### Add New Status

```python
MARKERS['review'] = r'- \[@\]'  # New marker
MARKER_TO_STATUS['@'] = 'review'
```

### Change Task ID Format

Edit regex `TASK_LINE_RE`.

## How to Test

```bash
# Verify specific session
./.agents/agents verify-tasks .agents/wb/260223_1800_auth-refactor/

# Verify all
./.agents/agents verify-tasks .agents/wb/

# Via Makefile
make verify
```

## Output

### All Complete
```
✓ All tasks complete (5/5)
```

### Pending Tasks
```
❌ Pending tasks found:

T-01: Implement login - pending (file.md:15)
T-03: Write tests - in_progress (file.md:28)

Complete: 3/5 (60%)
```

## Related

- [agents-lint-docs.md](./agents-lint-docs.md) - Markdown linting
- [tools-json.md](./tools-json.md) - Tool catalog

---
*Document: `.agents/a-docs/agentic/verify-tasks.md`*
