---
id: TOOL-014
theme: agents-bootstrap
type: tool-doc
status: active
owner: system
created_at: '2026-02-23T00:00:00-03:00'
updated_at: '2026-03-06T19:48:51-03:00'
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
2. **Copies mandatory files** - Core configs, arc baseline docs, governing specs, mirror docs, OpenCode adapter
3. **Creates folders** - Required structure and runtime agent folders
4. **Configures Makefile** - Wrapper in target repo
5. **Runs system setup** - Sync docs, optional skills sync, and symlink repair
6. **Validates** - Runs doctor and tools checks

Primary runtime baseline:
- OpenCode
- Codex
- Qwen

Compatibility mirrors kept for broader reuse:
- Claude
- Gemini

## What It Touches

### Files Read (Source)

| File | Purpose |
|------|---------|
| `AGENTS.md` | Canonical instruction template |
| `OPENCODE.md` | Mandatory OpenCode instruction replica |
| `QWEN.md` | Mandatory agent instruction replica |
| `CLAUDE.md` | Mandatory agent instruction replica |
| `GEMINI.md` | Mandatory agent instruction replica |
| `opencode.json` | OpenCode project adapter |
| `.agents/agents` | CLI wrapper |
| `.agents/agents.config` | Configuration |
| `.agents/tools.json` | Tool catalog |
| `.agents/skills-sync.manifest.json` | Skills sync state |
| `.agents/arc/ARCHITECTURE.md` | Architecture baseline |
| `.agents/arc/GENERAL-ROADMAP.md` | Roadmap baseline |
| `.agents/arc/SPECS/` | Governing spec baseline |
| `.agents/scripts/` | Python scripts |
| `.agents/a-docs/` | Documentation |
| `.agents/rules/` | Agent rules |
| `.agents/skills/` | Project skills |
| `.agents/data/telemetry/schemas/` | Telemetry schema |

### Files Written (Destination)

| Location | Action |
|----------|--------|
| `<target>/AGENTS.md` | Copied |
| `<target>/OPENCODE.md` | Copied |
| `<target>/QWEN.md` | Copied |
| `<target>/CLAUDE.md` | Copied |
| `<target>/GEMINI.md` | Copied |
| `<target>/.agents/` | Complete structure |
| `<target>/.agents/tmp/` | Temporary non-canonical workspace |
| `<target>/.opencode/.claude/.qwen/.codex/.gemini` | Runtime folders ensured |
| `<target>/Makefile` | Wrapper configured |
| `<target>/.agents/arc/` | Folders created |
| `<target>/.agents/wb/` | Folders created |

Bootstrap fails fast if any mandatory source file or directory is missing.
Bootstrap also runs:

- `.agents/agents sync --force`
- `.agents/agents skills-sync sync` (non-blocking when skills sync is optional)
- `.agents/agents fix-symlinks --force`

Primary-vs-compatibility rule:
- OpenCode, Codex, and Qwen are the primary supported runtimes for this scaffold.
- Claude and Gemini remain compatibility mirrors and portability adapters.
- Bootstrap keeps all committed mirrors/adapters present, but governance and validation should prioritize the primary runtime set first.

Installer resilience rule:
- Bootstrap must succeed in a clean external repository even if optional upstream skills sync is unavailable.
- Optional sync failures should be surfaced as warnings, not installation blockers.

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
MANDATORY_FILES_TO_COPY = [
    "AGENTS.md",
    "OPENCODE.md",
    "QWEN.md",
    "CLAUDE.md",
    "GEMINI.md",
    "opencode.json",
    ".agents/agents",
    ".agents/agents.config",
    ".agents/tools.json",
    ".agents/skills-sync.manifest.json",
    ".agents/arc/ARCHITECTURE.md",
    ".agents/arc/GENERAL-ROADMAP.md",
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
