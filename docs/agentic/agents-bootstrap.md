---
id: TOOL-014
theme: agents-bootstrap
type: tool-doc
status: active
owner: system
created_at: '2026-02-23T00:00:00-03:00'
updated_at: '2026-04-02T14:34:51-03:00'
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

**Solution:** Automatic bootstrap that installs `.agents` in any repository with one command while exporting a generic baseline instead of this scaffold's local history.
The bootstrap also prepares a safe skills baseline for downstream repos so fresh and partial installs share the same adoption model.
Bootstrap also prepares a repo-local `.agents/source/universal-skills` checkout so project-local skills can stay repo-specific without relying on a large global Codex skill set, and the default path seeds that checkout from committed repo assets instead of cloning over the network.

## Function

Installs `.agents` system in another repository:

1. **Detects stack** - Node.js, Python, Go, etc.
2. **Copies reusable system assets** - Core configs, scripts, docs, rules, templates, mirror docs, OpenCode adapter
3. **Generates clean governance baseline** - Starter roadmap, architecture, project brief, tech stack, guidelines, and empty indexes
4. **Creates folders** - Required structure and runtime agent folders
5. **Configures Makefile** - Wrapper in target repo
6. **Runs system setup** - Sync docs, optional skills sync, and symlink repair
7. **Validates** - Runs doctor and tools checks

Sanitization rule:

- Bootstrap must not leak this scaffold's local workbench sessions, knowledge index content, lesson-entry history, telemetry reports, or the scaffold's live roadmap/spec backlog into the target repository.
- The target repo should start with generic placeholders and empty indexes where project-specific history would otherwise be misleading.
- Skills configuration is treated as a compatibility baseline that downstream repos can evolve into a pinned source/ref/profile contract.

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
| `PLANS.md` | Canonical ExecPlan contract |
| `OPENCODE.md` | Mandatory OpenCode instruction replica |
| `QWEN.md` | Mandatory agent instruction replica |
| `CLAUDE.md` | Mandatory agent instruction replica |
| `GEMINI.md` | Mandatory agent instruction replica |
| `opencode.json` | OpenCode project adapter |
| `.agents/agents` | CLI wrapper |
| `.agents/agents.config` | Configuration |
| `.agents/tools.json` | Tool catalog |
| `.agents/skills-sync.manifest.json` | Skills sync state |
| `docs/arc/README.md` | Arc folder overview |
| `docs/arc/SPECS/README.md` | Specs folder guidance |
| `docs/arc/SPECS/TEMPLATE_*.md` | Spec templates |
| `docs/arc/DECISIONS/TEMPLATE_adr.md` | ADR template |
| `.agents/scripts/` | Python scripts |
| `docs/` | Documentation, copied with history/report sanitization |
| `.agents/rules/` | Agent rules |
| `.agents/skills/` | Project skills |
| `.agents/data/telemetry/schemas/` | Telemetry schema |

### Files Written (Destination)

| Location | Action |
|----------|--------|
| `<target>/AGENTS.md` | Copied |
| `<target>/PLANS.md` | Copied |
| `<target>/OPENCODE.md` | Copied |
| `<target>/QWEN.md` | Copied |
| `<target>/CLAUDE.md` | Copied |
| `<target>/GEMINI.md` | Copied |
| `<target>/.agents/` | Complete structure |
| `<target>/.agents/tmp/` | Temporary non-canonical workspace |
| `<target>/.opencode/.claude/.qwen/.codex/.gemini` | Runtime folders ensured |
| `<target>/Makefile` | Wrapper configured |
| `<target>/docs/arc/` | Folders created |
| `<target>/.agents/wb/` | Folders created |
| `<target>/docs/arc/*.md` | Generic baseline generated for the target repo |
| `<target>/docs/arc/SPECS/INDEX.md` | Empty starter index generated |
| `<target>/docs/arc/DECISIONS/INDEX.md` | Empty starter index generated |
| `<target>/docs/knowledge/INDEX.md` | Empty starter index generated |

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

- Bootstrap must succeed in a clean external repository using committed repo assets even if network access or optional upstream skills sync is unavailable.
- Optional sync failures should be surfaced as warnings, not installation blockers.

Generic-export rule:

- `.agents/wb/` is created as an empty working area; active sessions and historical plans/reports are not copied.
- `docs/knowledge/INDEX.md` is regenerated empty.
- `docs/lessons/entries/` keeps only reusable scaffolding such as `README.md`; historical lesson entries are not copied.
- `docs/telemetry/reports/` is omitted from bootstrap output.
- `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/PROJECT-BRIEF.md`, `docs/arc/TECH-STACK.md`, `docs/arc/ENGINEERING-GUIDELINES.md`, and specs indexes are generated as target-project starters, not copied from this repository's live state.

Installation modes:

- Full bootstrap: target repo is new or mostly empty, so the scaffold provisions the full `.agents` runtime and generic governance baseline.
- Partial install: target repo already exists, so bootstrap preserves existing files by default and fills only the missing scaffold files and directories.
- `--force` converts the partial path into an overwrite path for files that already exist.
- Existing projects should prefer partial install so the bootstrap can add the skills baseline without overwriting project-owned content.
- Bootstrap prefers a repo-local `.agents/source/universal-skills` checkout as the upstream skill source.
- The default bootstrap path seeds that source locally; it does not require a clone from GitHub.

## How to Configure

### Basic Usage

```bash
# Bootstrap in another repository
./.agents/agents bootstrap /path/to/target-repo

# Partial install in an existing repository
./.agents/agents bootstrap /path/to/existing-project --partial

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
| `--partial` | Install the scaffold into an existing project without clobbering project-owned files |
| `--skip-checks` | Skip doctor/tools-check |

Usage notes:

- Existing repos should use `--partial`; the command skips files that already exist unless `--force` is set.
- The generated roadmap/spec baseline is generic; project owners should replace the placeholders with the real backlog before non-trivial work starts.
- Optional upstream skills sync warnings are non-blocking and do not mean the bootstrap failed.
- The skills baseline is generic by design and should be upgraded by the target repo owner rather than treated as scaffold-local history.
- Keep global Codex skills lean; the target repo should rely primarily on `.agents/skills/` plus the repo-local `.agents/source/universal-skills` source checkout when available.
- `skills-sync pull` is only meaningful when that source checkout is backed by git; repo-local seeded sources are treated as already available.

See the installation playbook: [bootstrap-other-repo.md](../standards/bootstrap-other-repo.md)

## How to Modify

### Add Files to Bootstrap

Edit `agents-bootstrap.py`:

```python
MANDATORY_FILES_TO_COPY = [
    "AGENTS.md",
    "PLANS.md",
    "OPENCODE.md",
    "QWEN.md",
    "CLAUDE.md",
    "GEMINI.md",
    "opencode.json",
    ".agents/agents",
    ".agents/agents.config",
    ".agents/tools.json",
    ".agents/skills-sync.manifest.json",
    "docs/arc/SPECS/README.md",
    "docs/arc/SPECS/TEMPLATE_spec.md",
]
```

Generated target-project baselines live in `generated_baseline_content()` and sanitization rules for copied directories live in `_ignore_for_dir()`.

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
test ! -f /tmp/test-repo/docs/telemetry/reports/implementation_report.md
test ! -f /tmp/test-repo/docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md
```

For a live project, the partial-install expectation is that pre-existing files remain untouched unless `--force` is used.

## Output

```text
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
- [bootstrap-other-repo.md](../standards/bootstrap-other-repo.md) - Full and partial install playbook

---

*Document: `docs/agentic/agents-bootstrap.md`*
