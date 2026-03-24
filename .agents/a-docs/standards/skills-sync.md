---
doc_type: standard
id: skills-sync-standard
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-03-23T19:07:53-03:00'
---

# Skills Sync Standard

## Purpose

Standardize how project repositories consume relevant skills from a centralized universal-skills repository while keeping the scaffold's bootstrap and runtime adapters interactive-CLI-first.

## Hard Constraints

- Project skills must always follow: `skills/<skill-name>/SKILL.md`
- Do not create technical mirror/cache folders inside `skills/`
- The preferred upstream source checkout must live outside `skills/` (default: `../universal-skills`)
- `.agents/cache/universal-skills` is only a compatibility fallback for older repos
- Treat the current manifest as the scaffold-side adapter over the richer universal-skills repo/ref/profile contract
- Prefer project-local skills under `.agents/skills/`; keep global Codex skills minimal and avoid using them as the primary project skill surface

## Configuration

Configure `.agents/agents.config`:

```yaml
skills_sync:
  enabled: true
  upstream_repo_url: "<universal-skills-git-url>"
  upstream_branch: "main"
  source_dir: "../universal-skills"
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

2. Pull latest universal skills:

```bash
make skills-pull
```

3. Discover what is available:

```bash
make skills-list RUNTIME=codex
make skills-search QUERY=markdown RUNTIME=codex
```

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

7. Verify sync and structure:

```bash
make skills-check SKILLS=writing-skills,markdownlint-skill
```

8. Full sequence:

```bash
make skills-sync SKILLS=writing-skills,markdownlint-skill
```

## Default Template Skills

- `writing-skills`
- `markdownlint-skill`

These are preconfigured as default selected skills in the template manifest/config.

## Mandatory Project Adaptations

After initial setup in each repository:

1. Set `skills_sync.upstream_repo_url`
2. Prefer a sibling local source checkout via `skills_sync.source_dir`
3. Choose `mode` (`copy` recommended for template repos)
4. Define selected skills via `SKILLS=...` and persist in manifest when needed
5. Enable gate with `skills_sync.required=true`
6. Ensure `make all` passes with `skills-check`
7. For live repos, use bootstrap `--partial` so skills and scaffold files are added without clobbering project-owned content
8. Treat repo/ref/profile fields as the canonical upgrade path for F-10 rather than inventing another local skills contract

## Evidence to record in report

- Commands run
- Pass/fail
- Selected skills list
- Drift issues and resolution notes

---
*Standard: `.agents/a-docs/standards/skills-sync.md`*
