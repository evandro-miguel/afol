---
id: TOOL-009
theme: verify-tasks
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-13T19:36:56-03:00'
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# verify-tasks.py - Task Verification

## Why It Exists

**Problem:** Workstreams can have pending tasks or falsely closed tasks without clear warning. Before marking workstream as complete, it's necessary to:

- Verify all tasks are complete
- Identify blocked tasks
- Require task-scoped closure evidence for every `done` task in strict mode
- Report overall status

**Solution:** Automatic verification that scans task files and reports status.

## Function

Checks evidence-backed task completion:

1. **Scans task files** - `*_task_*.md`
2. **Extracts tasks** - Regex for markers
3. **Classifies status** - pending, in_progress, done, etc.
4. **Reports** - Lists status of each task
5. **Exit code** - 0 if all complete with required evidence, 1 if pending or invalid
6. **Strict plan checks** - Validates final plans against the ExecPlan contract from `PLANS.md`

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/wb/*/`*`_task_*.md` | Task files to verify |
| `.agents/wb/*/.evidence.jsonl` | Task-scoped closure evidence ledger in strict mode |
| `.agents/wb/*/`*`_plan_*.md` | Final ExecPlan sections and progress state in strict mode |
| `PLANS.md` | Canonical planning contract referenced by docs and templates |

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
    'implemented_untested': r'- \[%\]',
    'tested_needs_spec_validation': r'- \[&\]',
    'problem': r'- \[!\]',
    'moved': r'- \[>\]',
    'done': r'- \[x\]',
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

# Via Justfile
just verify

# Strict verification for session closure
./.agents/scripts/.venv/bin/python .agents/scripts/verify-tasks.py --strict .agents/wb/<session>/
```

## Output

### All Complete

```text
✓ All tasks complete (5/5)
```

### Pending Tasks

```text
❌ Pending tasks found:

T-01: Implement login - pending (file.md:15)
T-03: Write tests - in_progress (file.md:28)

Complete: 3/5 (60%)
```

## Strict Mode Notes

- A task marked `done` must have valid `.evidence.jsonl` closure evidence for the same task id.
- The closure evidence must name the real command or gate, a passing or explicit `N/A` result, and an artifact or explanatory note.
- Generic evidence such as `command: implementation` or `command: implement complete` is not valid closure evidence.
- Blocking failed evidence keeps the task invalid until a later successful rerun of the same command supersedes it or the failure is explicitly accepted as non-blocking.
- Final plans must keep the required ExecPlan sections.
- Final plans must maintain a checkbox-based `Progress` section.
- Final reports still require a finalized postmortem.

## Related

- [agents-lint-docs.md](./agents-lint-docs.md) - Markdown linting
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/verify-tasks.md`*
