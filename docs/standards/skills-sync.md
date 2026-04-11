---
doc_type: standard
id: skills-sync-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-02T15:21:56-03:00'
---

# Skills Sync Standard

## Purpose

Standardize how project repositories consume relevant skills from a repo-local or centralized universal-skills source while keeping the scaffold's bootstrap and runtime adapters interactive-CLI-first.

## Hard Constraints

- Project skills must always follow: `skills/<skill-name>/SKILL.md`
- Do not create technical mirror/cache folders inside `skills/`
- The preferred upstream source checkout must live outside `skills/` (default: `.agents/source/universal-skills`)
- `.agents/cache/universal-skills` is only a compatibility fallback for older repos
- Bootstrapped repos must be able to resolve their selected skills from the repo-local source seed without network access
- When a repo-local source is only a bootstrap seed, git-backed refresh/publish should use a mirror outside `skills/` and then update selected local skills explicitly
- Treat the current manifest as the scaffold-side adapter over the richer universal-skills repo/ref/profile contract
- Prefer project-local skills under `.agents/skills/`; keep global Codex skills minimal and avoid using them as the primary project skill surface

## Configuration

Configure `.agents/agents.config`:

```yaml
skills_sync:
  enabled: true
  upstream_repo_url: "<universal-skills-git-url>"
  upstream_branch: "main"
  source_dir: ".agents/source/universal-skills"
  pool_dir: ".agents/cache/universal-skills"
  project_dir: "skills"
  mode: "copy"          # copy | link
  required: true
  manifest_file: ".agents/skills-sync.manifest.json"
```

## Agent Execution Workflow

1. Initialize sync state:

```bash
make skills-init
```

2. Refresh the git-backed universal-skills source or mirror:

```bash
make skills-pull
```

If the preferred local source is only a repo-local bootstrap seed, `make skills-pull` refreshes the git mirror in `.agents/cache/universal-skills` instead of mutating `.agents/skills/`.

3. Discover what is available:

```bash
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
```

When a git-backed mirror already exists, discovery commands should prefer that full catalog. The repo-local source seed remains the default install/apply baseline.

4. Plan selected subset impact:

```bash
make skills-plan SKILLS=writing-skills,markdownlint-skill
```

5. Apply selected skills to project:

```bash
make skills-apply SKILLS=writing-skills,markdownlint-skill
```

6. Ensure one skill on demand:

```bash
make skills-ensure SKILL=writing-skills RUNTIME=codex
```

7. Run the one-step update flow into `.agents/skills/`:

```bash
make skills-sync SKILLS=writing-skills,markdownlint-skill
make skills-update SKILLS=writing-skills,markdownlint-skill
```

8. Publish one locally edited skill back to the git-backed source:

```bash
make skills-push SKILL=writing-skills COMMIT=1 PUSH=1
```

9. Verify sync and structure:

```bash
make skills-check SKILLS=writing-skills,markdownlint-skill
```

## Default Template Skills

- `agentic-system-workflow`
- `writing-skills`
- `markdownlint-skill`

These are preconfigured as default selected skills in the template manifest/config. The default manifest keeps the configured default profile and also pins the explicit default skills so scaffold-operating skills such as `agentic-system-workflow` remain available even when the upstream profile omits them.

## Mandatory Project Adaptations

After initial setup in each repository:

1. Set `skills_sync.upstream_repo_url`
2. Prefer a repo-local source checkout via `skills_sync.source_dir`
3. Choose `mode` (`copy` recommended for template repos)
4. Define selected skills via `SKILLS=...` and persist in manifest when needed
5. Enable gate with `skills_sync.required=true`
6. Ensure `make all` passes with `skills-check`
7. For live repos, use bootstrap `--partial` so skills and scaffold files are added without clobbering project-owned content
8. Ensure bootstrap provisions `.agents/source/universal-skills` before expecting `skills-sync pull|sync` to use a local-first source
9. Treat repo/ref/profile fields as the canonical upgrade path for F-10 rather than inventing another local skills contract
10. Use `skills-sync push` only for selected local skills that are ready to be published back to the universal-skills git source
11. Keep `agentic-system-workflow` available locally so agents can discover the canonical scaffold install and upgrade flow from inside the repo

## Evidence to record in report

- Commands run
- Pass/fail
- Selected skills list
- Drift issues and resolution notes

---

*Standard: `docs/standards/skills-sync.md`*
