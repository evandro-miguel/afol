---
id: TOOL-016
theme: agents-skills-sync
type: tool-doc
status: active
owner: system
created_at: 2026-02-23 00:00:00-03:00
updated_at: '2026-04-02T15:21:56-03:00'
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
2. **Pull** - Refresh the git-backed source checkout or mirror
3. **List** - Show available or selected skills
4. **Search** - Search the local source checkout
5. **Plan** - Preview changes
6. **Apply** - Apply selected skills
7. **Ensure** - Install or refresh one skill on demand
8. **Check** - Validate structure
9. **Sync / Update** - One-step refresh into `.agents/skills/`
10. **Push** - Publish selected local skills back to the git-backed source

Current contract note:
- The scaffold currently uses a compatibility manifest with selected skills and mode.
- F-10 evolves that contract toward pinned repo/ref/profile semantics without turning the scaffold into a second skills distribution system.
- Bootstrapped repos receive a repo-local source seed under `.agents/source/universal-skills`, so the default sync path is local-first.
- When that repo-local source is only a seed, git refresh and publish operations use the git-backed mirror in `.agents/cache/universal-skills`.

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Sync configuration |
| `.agents/source/universal-skills/` | Preferred upstream source checkout |
| `.agents/cache/universal-skills/` | Git-backed mirror / compatibility fallback source |
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
  pool_dir: ".agents/cache/universal-skills"
  project_dir: "skills"
  mode: "copy"
  required: false
  manifest_file: ".agents/skills-sync.manifest.json"
  default_skills:
    - "agentic-system-workflow"
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

# Refresh the git-backed source checkout or mirror
./.agents/agents skills-sync pull

# One-step refresh into .agents/skills/
./.agents/agents skills-sync sync --runtime codex
./.agents/agents skills-sync update --runtime codex

# List available skills from the git-backed catalog when it already exists
./.agents/agents skills-sync list --runtime codex

# Search upstream skills from the catalog or repo-local seed
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

# Publish one edited local skill back to the git-backed source
./.agents/agents skills-sync push writing-skills --commit --push
```

### Via Makefile

```bash
make skills-init
make skills-pull
make skills-update SKILLS=writing-skills,markdownlint-skill
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
make skills-plan SKILLS=writing-skills,markdownlint-skill
make skills-apply SKILLS=writing-skills
make skills-ensure SKILL=writing-skills RUNTIME=codex
make skills-check SKILLS=writing-skills
make skills-sync SKILLS=writing-skills,markdownlint-skill
make skills-push SKILL=writing-skills COMMIT=1 PUSH=1
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

For the scaffold itself, keep `agentic-system-workflow` available so agents can
discover the canonical install, upgrade, validation, and git-backed publish
flow from the project-local skill surface.

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
✓ Found repo-local source seed
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
*Document: `docs/agentic/agents-skills-sync.md`*
