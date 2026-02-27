---
id: TOOL-004
theme: agents-new
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  templates: ../../templates/
---

# agents-new.py - Workstream Creation

## Why It Exists

**Problem:** Creating workstream manually requires:
- Naming folder correctly (YYMMDD_HHMM_theme_type_N)
- Copying templates
- Filling frontmatter
- Updating .active_session

**Solution:** Automation that creates complete structure with one command.

## Function

Creates new workstream with:

1. **Session folder** - Standardized name
2. **Plan file** - Planning document
3. **Task file** - Tasks with checklist
4. **Log file** - Activity timeline
5. **Spec file** (optional) - Full or lite specification
6. **Updates .active_session** - Points to new session

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Path configuration |
| `.agents/a-docs/templates/*.md` | Templates to copy |

### Files Created

```
.agents/wb/
└── YYMMDD_HHMM_<theme>/
    ├── YYMMDD_HHMM_<theme>_plan_01.md
    ├── YYMMDD_HHMM_<theme>_task_01.md
    ├── YYMMDD_HHMM_<theme>_log_01.md
    └── YYMMDD_HHMM_<theme>_spec_01.md (optional)
```

### Files Updated

| File | Change |
|------|--------|
| `.agents/wb/.active_session` | Points to new session |

## How to Configure

### Command Line Options

```bash
# Basic (plan, task, log)
./.agents/agents new auth-refactor

# With full spec
./.agents/agents new api-endpoint --spec

# With spec-lite
./.agents/agents new bugfix-login --spec-lite

# Plan only
./.agents/agents new quick-task --plan-only

# Quick task in active session
./.agents/agents new update-docs --quick

# Multiple sessions are allowed - create new session even with active one
./.agents/agents new another-feature

# Force flag still exists for backward compatibility
./.agents/agents new epic-feature --force-new
```

### Multi-Session Support

**Multiple sessions can coexist.** When you create a new session while another is active:

- ⚠️ System shows a warning (non-blocking)
- ✅ New session is created normally
- 📌 `.active_session` pointer updates to the new session
- 🎯 Use `--session <id>` to target specific sessions in `wb-update` commands

```bash
# Example: Working with multiple sessions
./.agents/agents new feature-a          # Creates session A (active)
./.agents/agents new feature-b          # Creates session B (now active, warns about A)

# Target specific session for operations
./.agents/agents wb-update task T-01 --session 260224_1200_feature-a --mark-done
./.agents/agents wb-update touch --session 260224_1200_feature-b
```

## How to Modify

### Main Functions

```python
def get_session_id(theme: str) -> str:
    """Generate session folder ID: YYMMDD_HHMM_theme."""

def load_template(template_name: str) -> str:
    """Load template from .agents/a-docs/templates/."""

def fill_template(template: str, session_id: str, theme: str) -> str:
    """Replace placeholders in template."""

def create_session_folder(session_id: str) -> Path:
    """Create session folder in .agents/wb/."""

def set_active_session(session_id: str) -> None:
    """Update .active_session file."""
```

### Adding New Template

1. Create template in `.agents/a-docs/templates/`
2. Add to `create_file()` pipeline
3. Add command line option if needed

## How to Test

```bash
# Create test workstream
./.agents/agents new test-workstream

# Verify structure
ls -la .agents/wb/26*test-workstream/

# Check .active_session
cat .agents/wb/.active_session
```

## Output

```
============================================================
Creating new workstream: auth-refactor
============================================================

Session ID: 260223_1800_auth-refactor
Timestamp: 2026-02-23T18:00:00-03:00

✓ Created session folder: 260223_1800_auth-refactor
✓ Set active session: 260223_1800_auth-refactor

Creating files:
  ✓ Created: 260223_1800_auth-refactor_plan_01.md
  ✓ Created: 260223_1800_auth-refactor_task_01.md
  ✓ Created: 260223_1800_auth-refactor_log_01.md

============================================================
Next steps:
1. Edit: .agents/wb/260223_1800_auth-refactor/260223_1800_auth-refactor_plan_01.md
2. Edit: .agents/wb/260223_1800_auth-refactor/260223_1800_auth-refactor_task_01.md
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog
- `.agents/a-docs/templates/` - Template files

---
*Document: `.agents/a-docs/agentic/agents-new.md`*
