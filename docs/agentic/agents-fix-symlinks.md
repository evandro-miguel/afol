---
id: TOOL-019
theme: agents-fix-symlinks
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-13T19:36:47-03:00'
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# agents-fix-symlinks.py - Symlink Repair

## Why It Exists

**Problem:** On Windows/WSL, symlinks can break due to:

- Permission issues
- File system differences
- Git checkout problems
- Docker volume mounts

**Solution:** Automatic symlink repair with copy fallback.

## Function

Repairs broken symlinks:

1. **Detect** - Find broken symlinks
2. **Repair** - Fix or replace with copy
3. **Validate** - Verify repair success
4. **Report** - Show repair status

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/` directory | Scan for symlinks |
| `.agents/agents.config` | Configuration |

### Files Written

| File | Purpose |
|------|---------|
| Various | Repaired symlinks or copies |

## How to Configure

### agents.config

```yaml
fix_symlinks:
  enabled: true
  fallback_to_copy: true
  dry_run: false
```

## How to Use

### Commands

```bash
# Check symlinks (dry run)
./.agents/agents fix-symlinks --dry-run

# Fix symlinks
./.agents/agents fix-symlinks

# Fix with verbose output
./.agents/agents fix-symlinks --verbose
```

### Via legacy just command runner

```bash
AFOL-native command pending; do not use legacy just command runners.
```

## How to Modify

### Main Functions

```python
def find_broken_symlinks():
    """Scan for broken symlinks."""

def repair_symlink(path):
    """Repair or replace symlink."""

def validate_repair(path):
    """Verify repair success."""

def report_status(repairs):
    """Show repair status."""
```

### Add New Repair Strategy

1. Create `repair_<type>()` function
2. Add to repair pipeline
3. Update documentation

## Output Examples

### Dry Run

```text
→ Scanning for broken symlinks...

Found 3 broken symlinks:
  - .agents/scripts/lib/utils -> ../../utils (broken)
  - .agents/cache/data -> /mnt/data (broken)
  - .afol/wb/link -> ../sessions (broken)

Run without --dry-run to fix.
```

### Repair

```text
→ Fixing symlinks...

✓ Fixed: .agents/scripts/lib/utils
✓ Fixed: .agents/cache/data
✓ Fixed: .afol/wb/link (copy fallback)

3 symlinks repaired.
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - CLI wrapper
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-fix-symlinks.md`*
