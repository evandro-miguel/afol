---
doc_type: standard
id: "skills-sync-standard"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Skills Sync Standard

## Purpose

Standardize how project repositories consume relevant skills from a centralized universal-skills repository.

## Hard Constraints

- Project skills must always follow: `skills/<skill-name>/SKILL.md`
- Do not create technical mirror/cache folders inside `skills/`
- Mirror/cache for sync must live outside `skills/` (default: `.agents/cache/universal-skills`)

## Configuration

Configure `.agents/agents.config`:

```yaml
skills_sync:
  enabled: true
  upstream_repo_url: "<universal-skills-git-url>"
  upstream_branch: "main"
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

3. Plan selected subset impact:

```bash
make skills-plan SKILLS=writing-skills,markdownlint-skill
```

4. Apply selected skills to project:

```bash
make skills-apply SKILLS=writing-skills,markdownlint-skill
```

5. Verify sync and structure:

```bash
make skills-check SKILLS=writing-skills,markdownlint-skill
```

6. Full sequence:

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
2. Choose `mode` (`copy` recommended for template repos)
3. Define selected skills via `SKILLS=...` and persist in manifest
4. Enable gate with `skills_sync.required=true`
5. Ensure `make all` passes with `skills-check`

## Evidence to record in report

- Commands run
- Pass/fail
- Selected skills list
- Drift issues and resolution notes

---
*Standard: `.agents/a-docs/standards/skills-sync.md`*
