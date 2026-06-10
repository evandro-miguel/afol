---
id: TOOL-008
theme: sync-agent-docs
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-13T19:36:55-03:00'
links:
  tools_json: ./tools-json.md
  agents_md: ../../AGENTS.md
---

# sync-agent-docs.py - Agent Documentation Synchronization

## Why It Exists

**Problem:** Multiple runtimes and agents have separate instruction files.
Keeping them synchronized manually is:

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

| File        | Purpose             |
|-------------|---------------------|
| `AGENTS.md` | Central template    |
| `CLAUDE.md` | CLAUDE instructions |

### Files Written

| File        | Purpose               |
|-------------|-----------------------|
| `CLAUDE.md` | Updated from template |

## How to Configure

### agents.config

```yaml
sync:
  source_file: AGENTS.md
  target_files:
    - CLAUDE.md
```

### Header Template

```python
HEADER_TEMPLATE = """<!-- Agent-specific instructions for {agent_name}. -->
<!-- Auto-synced from AGENTS.md. Run sync-agent-docs.py to update. -->

"""
```

## How to Modify

### Add New Agent

1. Create file (e.g., `COPILOT.md`)
2. Add to `agents.config` sync.target_files
3. Run sync

## How to Use

No public `afol sync` verb exists yet. The command below is factory-only compatibility.

```bash
# Sync all agents
./.agents/agents sync --force

# Legacy just targets are retired migration debt.
# Keep sync wrapper usage factory-only until a public AFOL verb lands.
```

## Output

```text
→ Syncing AGENTS.md to agent files...
CLAUDE.md: 3 differences found

Sync complete.
```

## Related

- [tools-json.md](./tools-json.md) - Tool catalog
- `AGENTS.md` - Central template

---

*Document: `docs/agentic/sync-agent-docs.md`*
