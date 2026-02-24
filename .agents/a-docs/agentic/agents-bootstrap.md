---
id: TOOL-014
theme: agents-bootstrap
type: tool-doc
status: active
owner: system
created_at: 2026-02-23T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# agents-bootstrap.py - Bootstrap in Other Repositories

## Why It Exists

**Problem:** Setting up `.agents` system manually in another repository requires:
- Copying multiple files and folders
- Creating required directory structure
- Configuring Makefile wrapper
- Detecting target project stack
- Validating installation

**Solution:** Automatic bootstrap that installs `.agents` in any repository with one command.

## Function

Installs `.agents` system in another repository:

1. **Detects stack** - Node.js, Python, Go, etc.
2. **Copies files** - Scripts, configs, templates
3. **Creates folders** - Required structure
4. **Configures Makefile** - Wrapper in target repo
5. **Validates** - Runs doctor and checks tools

## What It Touches

### Files Read (Source)

| File | Purpose |
|------|---------|
| `.agents/agents` | CLI wrapper |
| `.agents/agents.config` | Configuration |
| `.agents/tools.json` | Tool catalog |
| `.agents/scripts/` | Python scripts |
| `.agents/a-docs/` | Documentation |
| `.agents/rules/` | Agent rules |

### Files Written (Destination)

| Location | Action |
|----------|--------|
| `<target>/AGENTS.md` | Copied |
| `<target>/.agents/` | Complete structure |
| `<target>/Makefile` | Wrapper configured |
| `<target>/.agents/arc/` | Folders created |
| `<target>/.agents/wb/` | Folders created |

## How to Configure

### Basic Usage

```bash
# Bootstrap in another repository
./.agents/agents bootstrap /path/to/target-repo

# Dry run (show what will be done)
./.agents/agents bootstrap /path/to/target --dry-run

# Force overwrite
./.agents/agents bootstrap /path/to/target --force

# Skip post-bootstrap validation
./.agents/agents bootstrap /path/to/target --skip-checks
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without writing |
| `--force` | Overwrite existing files |
| `--skip-checks` | Skip doctor/tools-check |

## How to Modify

### Add Files to Bootstrap

Edit `agents-bootstrap.py`:

```python
FILES_TO_COPY = [
    "agents",
    "agents.config",
    "tools.json",
    "scripts/",
    "a-docs/",
    "rules/",
]
```

## How to Test

```bash
# Create test repo
mkdir /tmp/test-repo
cd /tmp/test-repo
git init

# Bootstrap
./.agents/agents bootstrap /tmp/test-repo

# Verify
ls -la /tmp/test-repo/.agents/
```

## Output

```
→ Bootstrapping .agents system into: /path/to/target
→ Detected stack: Python
→ Copying files...
→ Creating directories...
→ Configuring Makefile...
→ Running validation...
✓ Bootstrap complete
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - CLI wrapper
- [tools-json.md](./tools-json.md) - Tool catalog

---
*Document: `.agents/a-docs/agentic/agents-bootstrap.md`*
