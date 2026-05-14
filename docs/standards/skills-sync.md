---
doc_type: standard
id: skills-sync-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-05-04T16:08:30-03:00'
---

# Skills Sync Standard

## Purpose

Standardize how project repositories consume relevant skills from a repo-local or centralized universal-skills source while keeping the scaffold's bootstrap and runtime adapters interactive-CLI-first.

## Hard Constraints

- Project skills must always follow: `skills/<skill-name>/SKILL.md`
- Do not create technical mirror/cache folders inside `skills/`
- The preferred repo-local source seed must live outside `skills/` (default: `.agents/source/universal-skills`) and must not be a nested git checkout
- Do not create or use `.agents/cache/universal-skills`
- Bootstrapped repos must be able to resolve their selected skills from the repo-local source seed without network access
- When a repo-local source is only a bootstrap seed, Git-backed refresh and upstream proposal work must use an external universal-skills checkout configured with `AGENTS_UNIVERSAL_SKILLS_SOURCE` or `skills_sync.external_source_dir`
- Treat the current manifest as the scaffold-side adapter over the richer universal-skills repo/ref/profile contract
- Prefer project-local skills under `.agents/skills/`; keep global Codex skills minimal and avoid using them as the primary project skill surface

## Classification Model

Skills sync must distinguish these cases:

- `source-drift` - the selected universal-skills source/ref/profile changed
- `stale-manifest-entry` - the local manifest still requests a skill that is no
  longer required for the selected source/profile
- `local-extra` - the repo intentionally keeps a project-specific skill outside
  the universal source contract
- `install-update` - the requested skill is part of the active selection and
  should be refreshed in `.agents/skills/`
- `proposal-update` - the skill should be proposed back to the external
  universal-skills checkout through the branch/PR flow

The default check should report stale entries and local extras separately from
real source drift. That keeps existing repos from treating intentional local
customization as a universal-source failure.

## Feature-Driven Skill Propagation

Every feature addition or meaningful feature behavior change must keep the
agent-facing skill surface current:

- Update affected project-local skills under `.agents/skills/` as part of the
  feature work.
- Update README, standards, specs, command references, and runtime mirrors when
  their guidance changes.
- Record a visible pending item in the roadmap, spec, workbench task, plan, or
  report to propose the same skill change back to the external universal-skills
  checkout.
- Use only the branch/PR proposal flow for upstream propagation. Do not push
  directly to universal `main`.

## Configuration

Configure `.agents/agents.config`:

```yaml
skills_sync:
  enabled: true
  upstream_repo_url: "<universal-skills-git-url>"
  upstream_branch: "main"
  source_dir: ".agents/source/universal-skills"
  external_source_dir: "" # optional external checkout; env AGENTS_UNIVERSAL_SKILLS_SOURCE also works
  proposal_branch_prefix: "skills-sync"
  project_dir: "skills"
  mode: "copy"          # copy | link
  required: true
  manifest_file: ".agents/skills-sync.manifest.json"
```

## Agent Execution Workflow

1. Initialize sync state:

```bash
just skills-init
```

2. Refresh the external git-backed universal-skills source when configured:

```bash
just skills-pull
```

`skills-pull` is the explicit network refresh command.
`skills-sync` and `skills-update` are local-only by default and will not call `git fetch/checkout/pull` unless `--pull` is passed.

If only the repo-local bootstrap seed exists, `just skills-pull` is a no-op. It never creates a git checkout under `.agents/cache/`.

3. Discover what is available:

```bash
just skills-list RUNTIME=codex
just skills-search QUERY=markdown RUNTIME=codex
```

When an external universal-skills checkout is configured, discovery commands prefer that full catalog. The repo-local source seed remains the default offline install/apply baseline.

4. Plan selected subset impact:

```bash
just skills-plan SKILLS=agentic-folder-sys
```

5. Apply selected skills to project:

```bash
just skills-apply SKILLS=agentic-folder-sys
```

6. Ensure one skill on demand:

```bash
just skills-ensure SKILL=agentic-folder-sys RUNTIME=codex
```

7. Run the one-step update flow into `.agents/skills/`:

```bash
just skills-sync SKILLS=agentic-folder-sys
just skills-update SKILLS=agentic-folder-sys
```
Without `--pull`, these commands use the current local source only.
Use `--pull` when you want to refresh the external source before syncing.

8. Record source provenance in manifest:

`skills-sync` and `skills-pull` record source metadata in `.agents/skills-sync.manifest.json` under `source`.
Observed fields are:
- `path`: seed path (relative when inside the repo, absolute otherwise)
- `source_type`: `git` or `local`
- `ref`: branch/ref intended for sync
- `branch`: resolved git branch when available
- `commit`: resolved git commit when available

9. Propose one locally edited skill back to universal-skills only through a branch:

```bash
just skills-push SKILL=agentic-folder-sys BRANCH=skills-sync/agentic-folder-sys COMMIT=1 PUSH=1 PR=1
```

This command must never push to `main` directly. It requires an external universal-skills checkout and pushes only a proposal branch; use `PR=1` when the change should be opened as a GitHub pull request.

10. Verify sync and structure:

```bash
just skills-check SKILLS=agentic-folder-sys
```

## Default Template Skills

- `agentic-folder-sys`
- `agentic-scaffold-mcp`

These are preconfigured as default selected skills in the template manifest/config. The repo-local seed intentionally avoids mirroring universal core skills that are already available globally, keeping only scaffold-specific skills needed by this repository.

## Mandatory Project Adaptations

After initial setup in each repository:

1. Set `skills_sync.upstream_repo_url`
2. Prefer a repo-local source checkout via `skills_sync.source_dir`
3. Choose `mode` (`copy` recommended for template repos)
4. Define selected skills via `SKILLS=...` and persist in manifest when needed
5. Enable gate with `skills_sync.required=true`
6. Ensure `just all` passes with `skills-check`
7. For live repos, use bootstrap `--partial` so skills and scaffold files are added without clobbering project-owned content
8. Ensure bootstrap provisions `.agents/source/universal-skills` before expecting `skills-sync sync` to use a local-first source
9. Treat repo/ref/profile fields as the canonical upgrade path for F-10 rather than inventing another local skills contract
10. Use `skills-sync push` only as a branch/PR proposal flow with an external universal-skills checkout; never push local skill edits directly to universal `main`
11. Keep `agentic-folder-sys` available locally so agents can discover the canonical scaffold install, upgrade, and workbench flow from inside the repo

## Evidence to record in report

- Commands run
- Pass/fail
- Selected skills list
- Drift issues and resolution notes

---

*Standard: `docs/standards/skills-sync.md`*
