---
id: TOOL-016
theme: agents-skills-sync
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-12T10:43:14-03:00'
links:
  tools_json: ./tools-json.md
  skills_readme: ../../skills/README.md
---

# agents-skills-sync.py - Skills Synchronization

## Why It Exists

**Problem:** Projects need consistent skill definitions across repositories. Manual skill management leads to:

- Inconsistent skill definitions
- Outdated skill versions
- Missing skill dependencies

**Solution:** Synchronize skills from a repo-local or central universal-skills source while keeping the scaffold's operator-facing commands and bootstrap behavior stable.

## Function

Synchronizes project skills:

1. **Init** - Initialize sync state
2. **Pull** - Refresh an external git-backed source checkout when configured
3. **List** - Show available or selected skills
4. **Search** - Search the local source checkout
5. **Plan** - Preview changes
6. **Apply** - Apply selected skills
7. **Ensure** - Install or refresh one skill on demand
8. **Check** - Validate structure
9. **Sync / Update** - One-step refresh into `.agents/skills/`
10. **Push** - Propose upstream changes through an external checkout branch/PR; never push to universal `main`

Current contract note:

- The scaffold currently uses a compatibility manifest with selected skills and mode.
- F-10 evolves that contract toward pinned repo/ref/profile semantics without turning the scaffold into a second skills distribution system.
- Bootstrapped repos receive a repo-local source seed under `.agents/source/universal-skills`, so the default sync path is local-first.
- When that repo-local source is only a seed, git refresh and upstream proposal operations must use an external universal-skills checkout, not a nested `.agents/cache/universal-skills` checkout.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Sync configuration |
| `.agents/source/universal-skills/` | Preferred repo-local source seed |
| `AGENTS_UNIVERSAL_SKILLS_SOURCE` / `skills_sync.external_source_dir` | Optional external universal-skills checkout |
| `.agents/skills/` | Local skills |

### Files Written

| File | Purpose |
|------|---------|
| `.agents/skills/<name>/` | Skill directories |
| `.agents/skills-sync.manifest.json` | Sync state |

## How to Configure

### agents.config

```yaml
skills_sync:
  enabled: false
  upstream_repo_url: "{UNIVERSAL_SKILLS_GIT_URL}"
  upstream_branch: "main"
  source_dir: ".agents/source/universal-skills"
  external_source_dir: ""
  proposal_branch_prefix: "skills-sync"
  project_dir: "skills"
  mode: "copy"
  required: false
  manifest_file: ".agents/skills-sync.manifest.json"
  default_skills:
    - "agentic-folder-sys"
    - "agentic-scaffold-mcp"
```

Partial-install note:

- Existing repositories should adopt the scaffold with `bootstrap --partial` so the skills surface is added without overwriting project-owned files.
- The bootstrap baseline is generic and history-free; do not copy scaffold-local workbench history into downstream repos.

## How to Use

### Commands

```bash
# Initialize sync
./.agents/agents skills-sync init

# Refresh an external git-backed source checkout when configured
./.agents/agents skills-sync pull

# One-step refresh into .agents/skills/
./.agents/agents skills-sync sync --runtime codex
./.agents/agents skills-sync update --runtime codex

# List available skills from the external catalog when configured
./.agents/agents skills-sync list --runtime codex

# Search upstream skills from the catalog or repo-local seed
./.agents/agents skills-sync search markdown --runtime codex

# Preview changes
./.agents/agents skills-sync plan --skills agentic-folder-sys

# Apply skills
./.agents/agents skills-sync apply --skills agentic-folder-sys

# Ensure one skill is installed
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex

# Check structure
./.agents/agents skills-sync check --skills agentic-folder-sys

# Full sync
./.agents/agents skills-sync sync --skills agentic-folder-sys

# Propose upstream skill changes through a branch/PR; never push to main.
./.agents/agents skills-sync push agentic-folder-sys --branch skills-sync/agentic-folder-sys --commit --push --pr
```

### Via Makefile

```bash
make skills-init
make skills-pull
make skills-update SKILLS=agentic-folder-sys
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
make skills-plan SKILLS=agentic-folder-sys
make skills-apply SKILLS=agentic-folder-sys
make skills-ensure SKILL=agentic-folder-sys RUNTIME=codex
make skills-check SKILLS=agentic-folder-sys
make skills-sync SKILLS=agentic-folder-sys
# Disabled by default in this scaffold:
# make skills-push SKILL=agentic-folder-sys COMMIT=1 PUSH=1
```

## How to Modify

### Main Functions

```python
def init_sync():
    """Initialize sync state and local source seed."""

def pull_upstream():
    """Update external git source when configured."""

def plan_sync(skills):
    """Preview missing/drift state."""

def apply_skills(skills):
    """Apply selected skills to project."""

def check_structure(skills):
    """Validate skill structure."""
```

### Add New Skill

1. Add to `default_skills` in config
2. Run `make skills-sync SKILLS=new-skill`
3. Verify structure in `.agents/skills/new-skill/`

For the scaffold itself, keep `agentic-folder-sys` available so agents can
discover the canonical install, upgrade, validation, source sync, and workbench
flow from the project-local skill surface.

## Skill Structure

```text
.agents/skills/
└── <skill-name>/
    ├── SKILL.md           # Skill definition
    ├── prompts/           # Prompt templates
    ├── rules/             # Skill rules
    └── examples/          # Usage examples
```

## Output Examples

### Init

```text
→ Initializing skills sync...
✓ Resolved local source directory
✓ Found repo-local source seed
✓ Created manifest
```

### Plan

```text
→ Planning skills sync...

Skills to sync:
  - agentic-folder-sys (new)

Changes:
  + agentic-folder-sys/SKILL.md
```

### Apply

```text
→ Applying skills...
✓ Applied agentic-folder-sys
✓ Skills sync complete
```

## Related

- `../../skills/README.md` - Skills directory
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-skills-sync.md`*
