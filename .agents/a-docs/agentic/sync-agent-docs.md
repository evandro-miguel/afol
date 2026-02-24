---
id: TOOL-008
theme: sync-agent-docs
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  agents_md: ../../AGENTS.md
---

# sync-agent-docs.py - Agent Documentation Synchronization

## Why It Exists

**Problem:** Multiple agents (QWEN, CLAUDE, GEMINI) have separate instruction files. Keeping them synchronized manually is:
- Error-prone
- Laborious
- Causes inconsistency between agents

**Solution:** Automatic synchronization from a central template (AGENTS.md).

## Function

Synchronizes agent files:

1. **Reads AGENTS.md** - Central template
2. **Detects local modifications** - Hash comparison
3. **Reports differences** - Shows what changed
4. **Asks confirmation** - Before overwriting
5. **Preserves headers** - Agent-specific headers

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `AGENTS.md` | Central template |
| `QWEN.md` | QWEN instructions |
| `CLAUDE.md` | CLAUDE instructions |
| `GEMINI.md` | GEMINI instructions |

### Files Written

| File | Purpose |
|------|---------|
| `QWEN.md` | Updated from template |
| `CLAUDE.md` | Updated from template |
| `GEMINI.md` | Updated from template |

## How to Configure

### agents.config

```yaml
sync:
  source_file: AGENTS.md
  target_files:
    - QWEN.md
    - CLAUDE.md
    - GEMINI.md
```

### Header Template

```python
HEADER_TEMPLATE = """# Agent-specific instructions for {agent_name}
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

"""
```

## How to Modify

### Add New Agent

1. Create file (e.g., `COPILOT.md`)
2. Add to `agents.config` sync.target_files
3. Run sync

## How to Use

```bash
# Sync all agents
./.agents/agents sync --force

# Via Makefile
make sync
```

## Output

```
→ Syncing AGENTS.md to agent files...
QWEN.md: No local modifications detected
CLAUDE.md: 3 differences found
GEMINI.md: No local modifications detected

Sync complete.
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog
- `AGENTS.md` - Central template

---
*Document: `.agents/a-docs/agentic/sync-agent-docs.md`*
