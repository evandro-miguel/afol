---
description: Operational playbooks for skills refresh, upstream PR proposals, and workbench execution
metadata:
  tags: "agentic-folder-sys, skills-sync, git, workbench, operational-playbooks"
---

# Agentic Folder Sys Patterns

Use these playbooks when the scaffold is already installed and the agent needs
to operate it safely.

## 1. Git-Backed Skills Refresh

```bash
./.agents/agents skills-sync status
./.agents/agents skills-sync pull
./.agents/agents skills-sync update --runtime codex
```

Use this when the project already has the scaffold and you want the installed
skills under `.agents/skills/` to reflect the current upstream git source.

Rule:

- `skills-sync pull` refreshes only an external git-backed source when one is
  configured. `skills-sync sync` / `skills-sync update` refresh the actual
  project skill copies under `.agents/skills/`. Treat skill and profile names
  from CLI, manifest, and upstream profiles as identifiers, not paths. A safe
  implementation rejects absolute paths, path separators, NUL bytes, `.`, and
  `..`, then verifies resolved source and destination paths stay under their
  configured roots before delete/copy/link.

## 2. Ensure One Operational Skill

```bash
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex --pull
```

Use this when the repo needs the scaffold-operating skill available locally
without doing a broader skill refresh.

## 3. Verified Scaffold Refresh

```bash
./.agents/agents scaffold-update --channel stable \
  --source /path/to/scaffold-source --plan-only
./.agents/agents scaffold-update --channel stable \
  --source /path/to/scaffold-source --diff-only
```

Use this only for scaffold-owned `.agents` files, not project-owned docs or app
code. The source must provide stable channel metadata and release artifacts; the
command verifies the signed tag when the source is a git checkout, validates the
allowlisted payload checksum, stages changes, backs up touched files, and rolls
back if validation fails. Add `--apply` only after the plan/diff is expected.

## 4. Propose a Local Skill Change Back to Universal-Skills

```bash
./.agents/agents skills-sync push agentic-folder-sys \
  --branch skills-sync/agentic-folder-sys \
  --commit --push --pr
```

Use this only with an external universal-skills checkout configured. The command
creates a proposal branch and can open a PR; it must never push directly to
universal `main`.

## 5. Governed Workbench Execution

When the change is non-trivial, use the scaffold's workbench flow:

```bash
./.agents/agents new <theme> --feature-id F-10 --parent-spec <spec-id>
./.agents/agents wb-update touch
./.agents/agents verify-tasks --strict .afol/wb/$(cat .afol/wb/.active_session)
```

State rules:

- use the task marker board as the source of truth with canonical markers: `[
  ]`, `[/]`, `[!]`, `[>]`, `[%]`, `[&]`, `[x]` move from `[%]` to `[&]` only
  after test evidence exists mark `[x]` only after closure evidence exists
