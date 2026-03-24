---
id: TOOL-016
theme: agents-skills-sync
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-03-23T18:40:56-03:00'
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

**Solution:** Synchronize skills from a central universal-skills repository while keeping the scaffold's operator-facing commands and bootstrap behavior stable.

## Function

Synchronizes project skills:

1. **Init** - Initialize sync state
2. **Pull** - Update from upstream
3. **List** - Show available or selected skills
4. **Search** - Search the local source checkout
5. **Plan** - Preview changes
6. **Apply** - Apply selected skills
7. **Ensure** - Install or refresh one skill on demand
8. **Check** - Validate structure
9. **Sync** - Full sync sequence

Current contract note:
- The scaffold currently uses a compatibility manifest with selected skills and mode.
- F-10 evolves that contract toward pinned repo/ref/profile semantics without turning the scaffold into a second skills distribution system.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Sync configuration |
| `../universal-skills/` | Preferred upstream source checkout |
| `.agents/cache/universal-skills/` | Compatibility fallback source |
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
  source_dir: "../universal-skills"
  pool_dir: ".agents/cache/universal-skills"
  project_dir: "skills"
  mode: "copy"
  required: false
  manifest_file: ".agents/skills-sync.manifest.json"
  default_skills:
    - "writing-skills"
    - "markdownlint-skill"
```

Partial-install note:
- Existing repositories should adopt the scaffold with `bootstrap --partial` so the skills surface is added without overwriting project-owned files.
- The bootstrap baseline is generic and history-free; do not copy scaffold-local workbench history into downstream repos.

## How to Use

### Commands

```bash
# Initialize sync
./.agents/agents skills-sync init

# Pull upstream changes
./.agents/agents skills-sync pull

# List available skills
./.agents/agents skills-sync list --runtime codex

# Search upstream skills
./.agents/agents skills-sync search markdown --runtime codex

# Preview changes
./.agents/agents skills-sync plan --skills writing-skills,markdownlint-skill

# Apply skills
./.agents/agents skills-sync apply --skills writing-skills

# Ensure one skill is installed
./.agents/agents skills-sync ensure writing-skills --runtime codex

# Check structure
./.agents/agents skills-sync check --skills writing-skills

# Full sync
./.agents/agents skills-sync sync --skills writing-skills,markdownlint-skill
```

### Via Makefile

```bash
make skills-init
make skills-pull
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
make skills-plan SKILLS=writing-skills,markdownlint-skill
make skills-apply SKILLS=writing-skills
make skills-ensure SKILL=writing-skills RUNTIME=codex
make skills-check SKILLS=writing-skills
make skills-sync SKILLS=writing-skills,markdownlint-skill
```

## How to Modify

### Main Functions

```python
def init_sync():
    """Initialize sync state and local mirror."""

def pull_upstream():
    """Update local mirror from upstream."""

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

## Skill Structure

```
.agents/skills/
└── <skill-name>/
    ├── SKILL.md           # Skill definition
    ├── prompts/           # Prompt templates
    ├── rules/             # Skill rules
    └── examples/          # Usage examples
```

## Output Examples

### Init
```
→ Initializing skills sync...
✓ Resolved local source directory
✓ Cloned universal-skills
✓ Created manifest
```

### Plan
```
→ Planning skills sync...

Skills to sync:
  - writing-skills (new)
  - markdownlint-skill (update)

Changes:
  + writing-skills/SKILL.md
  ~ markdownlint-skill/prompts/main.md
```

### Apply
```
→ Applying skills...
✓ Applied writing-skills
✓ Applied markdownlint-skill
✓ Skills sync complete
```

## Related

- `../../skills/README.md` - Skills directory
- [tools-json.md](./tools-json.md) - Tool catalog

---
*Document: `.agents/a-docs/agentic/agents-skills-sync.md`*
