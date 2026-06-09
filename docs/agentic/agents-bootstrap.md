---
id: TOOL-014
theme: agents-bootstrap
type: tool-doc
status: active
owner: system
created_at: '2026-02-23T00:00:00-03:00'
updated_at: '2026-04-16T23:01:19-03:00'
links:
  tools_json: ./tools-json.md
  wrapper: ./agents-wrapper.md
---

# afol bootstrap - Bootstrap in Other Repositories

## Why It Exists

**Problem:** Setting up `.agents` system manually in another repository requires:

- Copying multiple files and folders
- Creating required directory structure
- Writing the native `afol` front door
- Detecting target project stack
- Validating installation

**Solution:** Native `afol bootstrap` installs `.agents` in any repository with one command while exporting a generic baseline instead of this scaffold's local history.
The bootstrap also prepares a safe skills baseline for downstream repos so fresh and partial installs share the same adoption model.
Bootstrap also prepares a repo-local `.agents/source/universal-skills` checkout so project-local skills can stay repo-specific without relying on a large global Codex skill set, and the default path seeds that checkout from committed repo assets instead of cloning over the network.

## Function

Installs `.agents` system in another repository:

1. **Detects stack** - Node.js, Python, Go, etc.
2. **Copies reusable system assets** - Core configs, docs, rules, templates, mirror docs, and native CLI wrappers
3. **Generates clean governance baseline** - Starter roadmap, architecture, project brief, tech stack, guidelines, and empty indexes
4. **Creates folders** - Required structure, local state, workbench, rules, and skill folders
5. **Configures command runner surface** - `afol` canonical
6. **Runs system setup** - Writes the native front door and exported baseline
7. **Validates** - Runs native front-door checks

When the target repository already exists, bootstrap must behave as an overlay:

- `create` for missing scaffold-managed files
- `skip` for existing project-owned files
- `patch-managed` for scaffold-owned files that can be safely updated
- `adapt-config` for legacy layout or path translation
- `add-wrapper` for missing native adapters such as `afol`
- `reconcile-skills` for manifest/source drift that needs explicit
  classification
- `conflict` when overwrite would touch project-owned content
- `benchmark` for timing and verification evidence

The overlay contract exists so an existing repo can adopt the scaffold without
losing its own docs, workbench, or local runtime choices.

## Public onboarding and examples

Public distribution entrypoint:

- `full` install command:
  - `afol bootstrap /path/to/target-repo`
- `partial` install command:
  - `afol bootstrap /path/to/existing-project --partial`

Front-door checks available in all adopted repos:

- `afol` is the public native front door for status and workflow commands.
- `afol s` (or `afol status`) reports status.
- `afol ck` (or `afol check`) reports validation/runtime metadata when supported by the wrapper in that repo.
- `afol st`, `afol d -x "afol validate"`, and `afol c` are the token-optimized
  workbench lifecycle aliases.
- Validate the onboarding result with `afol status` and `afol validate`.

Sanitization rule:

- Bootstrap must not leak this scaffold's local workbench sessions, knowledge index content, lesson-entry history, telemetry reports, or the scaffold's live roadmap/spec backlog into the target repository.
- The target repo should start with generic placeholders and empty indexes where project-specific history would otherwise be misleading.
- Skills configuration is treated as a compatibility baseline that downstream repos can evolve into a pinned source/ref/profile contract.
- Existing repo adoption should prefer MCP/runtime planning and validation,
  then use shell wrappers only as a fallback surface when the runtime path is
  unavailable.

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
| `CLAUDE.md` | Mandatory agent instruction replica |
| `RTK.md` | Selective shell-output compression policy |
| `.agents/config.json` | Canonical project config seed |
| `.agents/skills-sync.manifest.json` | Skills sync state |
| `docs/arc/README.md` | Arc folder overview |
| `docs/arc/SPECS/README.md` | Specs folder guidance |
| `docs/templates/spec*.md` | Spec templates |
| `docs/templates/adr.md` | ADR template |
| `docs/` | Documentation, copied with history/report sanitization |
| `.agents/rules/` | Agent rules |
| `.agents/skills/` | Project skills |
| `.agents/data/telemetry/schemas/` | Telemetry schema |

### Files Written (Destination)

| Location | Action |
|----------|--------|
| `<target>/AGENTS.md` | Copied |
| `<target>/CLAUDE.md` | Copied |
| `<target>/RTK.md` | Copied |
| `<target>/.agents/` | Complete structure |
| `<target>/.agents/tmp/` | Temporary non-canonical workspace |
| `<target>/.claude/` | Runtime folder ensured |
| `<target>/docs/arc/` | Folders created |
| `<target>/.afol/wb/` | Folders created |
| `<target>/docs/arc/*.md` | Generic baseline generated for the target repo |
| `<target>/docs/arc/SPECS/INDEX.md` | Empty starter index generated |
| `<target>/docs/arc/DECISIONS/INDEX.md` | Empty starter index generated |
| `<target>/docs/knowledge/INDEX.md` | Empty starter index generated |

Bootstrap fails fast if any mandatory source file or directory is missing.
Python bootstrap compatibility does not define the public downstream install
contract. New public documentation and installer examples must use
`afol bootstrap`; `.agents/scripts/agents-bootstrap.py` is factory-only recovery
tooling while the old Python path is retired.

Primary-vs-compatibility rule:

- OpenCode, Codex, and Qwen are the primary supported runtimes for this scaffold.
- Claude and Gemini remain compatibility mirrors and portability adapters.
- Bootstrap keeps all committed mirrors/adapters present, but governance and validation should prioritize the primary runtime set first.

Installer resilience rule:

- Bootstrap must succeed in a clean external repository using committed repo assets even if network access or optional upstream skills sync is unavailable.
- Optional sync failures should be surfaced as warnings, not installation blockers.

Generic-export rule:

- `.afol/wb/` is created as an empty working area; active sessions and historical plans/reports are not copied.
- `docs/knowledge/INDEX.md` is regenerated empty.
- `docs/lessons/entries/` keeps only reusable scaffolding such as `README.md`; historical lesson entries are not copied.
- `docs/telemetry/reports/` is omitted from bootstrap output.
- `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/PROJECT-BRIEF.md`, `docs/arc/TECH-STACK.md`, `docs/arc/ENGINEERING-GUIDELINES.md`, and specs indexes are generated as target-project starters, not copied from this repository's live state.

Installation modes:

- Full bootstrap: target repo is new or mostly empty, so the scaffold provisions the native `.agents` baseline and generic governance baseline.
- Partial install: target repo already exists, so bootstrap preserves existing files by default and fills only the missing scaffold files and directories.
- `--force-managed` converts conflicting managed files into an explicit overwrite path.
- Existing projects should prefer partial install so the bootstrap can add the skills baseline without overwriting project-owned content.
- Bootstrap prefers a repo-local `.agents/source/universal-skills` checkout as the upstream skill source.
- The default bootstrap path seeds that source locally; it does not require a clone from GitHub.

## How to Configure

### Basic Usage

```bash
# Bootstrap in another repository
afol bootstrap /path/to/target-repo

# Partial install in an existing repository
afol bootstrap /path/to/existing-project --partial

# Dry run (show what will be done)
afol bootstrap /path/to/target --dry-run

# Force overwrite
afol bootstrap /path/to/target --force-managed
```

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without writing |
| `--force-managed` | Overwrite managed/conflicting scaffold files |
| `--partial` | Install the scaffold into an existing project without clobbering project-owned files |

Usage notes:

- Existing repos should use `--partial`; the command preserves project-owned files unless managed overwrite is explicitly requested.
- The generated roadmap/spec baseline is generic; project owners should replace the placeholders with the real backlog before non-trivial work starts.
- Optional upstream skills sync warnings are non-blocking and do not mean the bootstrap failed.
- The skills baseline is generic by design and should be upgraded by the target repo owner rather than treated as scaffold-local history.
- Keep global Codex skills lean; the target repo should rely primarily on `.agents/skills/` plus the repo-local `.agents/source/universal-skills` source checkout when available.
- During bootstrap, the installer first tries to refresh an external
  `universal-skills` checkout from `AGENTS_UNIVERSAL_SKILLS_SOURCE` or from a
  sibling `universal-skills` / `skill-universal` repo, then writes a plain
  repo-local seed under `.agents/source/universal-skills`.
- `skills-sync pull` is only meaningful when an external source checkout is
  backed by git; repo-local seeded sources are treated as already available.
- Existing repo adoption should never replace project-owned docs or runtime
  adapters by default. If a target file needs replacement, the update should
  surface a conflict and require explicit operator intent.

See the installation playbook: [bootstrap-other-repo.md](../standards/bootstrap-other-repo.md)

## How to Modify

### Add Files to Bootstrap

Edit `src/project-template/` and regenerate the native template payload:

```bash
bun run template:generate
bun run validate:bootstrap
```

Factory-only compatibility behavior remains in `.agents/scripts/agents-bootstrap.py`
until all Python bootstrap use has been retired.

## How to Test

```bash
# Create test repo
mkdir /tmp/test-repo
cd /tmp/test-repo
git init

# Bootstrap
afol bootstrap /tmp/test-repo

# Verify
ls -la /tmp/test-repo/.agents/
test ! -f /tmp/test-repo/docs/telemetry/reports/implementation_report.md
test ! -f /tmp/test-repo/docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md
```

For a live project, the partial-install expectation is that pre-existing files remain untouched unless managed overwrite is explicitly requested.

## Output

```text
→ Bootstrapping .agents system into: /path/to/target
→ Detected stack: Python
→ Copying files...
→ Creating directories...
→ Configuring AFOL front door...
→ Running validation...
✓ Bootstrap complete
```

## Related

- [agents-wrapper.md](./agents-wrapper.md) - CLI wrapper
- [tools-json.md](./tools-json.md) - Tool catalog
- [bootstrap-other-repo.md](../standards/bootstrap-other-repo.md) - Full and partial install playbook

---

*Document: `docs/agentic/agents-bootstrap.md`*
