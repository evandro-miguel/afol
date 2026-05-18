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
  project skill copies under `.agents/skills/`.

## 2. Ensure One Operational Skill

```bash
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex --pull
```

Use this when the repo needs the scaffold-operating skill available locally
without doing a broader skill refresh.

## 3. Propose a Local Skill Change Back to Universal-Skills

```bash
./.agents/agents skills-sync push agentic-folder-sys \
  --branch skills-sync/agentic-folder-sys \
  --commit --push --pr
```

Use this only with an external universal-skills checkout configured. The command
creates a proposal branch and can open a PR; it must never push directly to
universal `main`.

## 4. Governed Workbench Execution

When the change is non-trivial, use the scaffold's workbench flow:

```bash
./.agents/agents new <theme> --feature-id F-10 --parent-spec <spec-id>
./.agents/agents wb-update touch
./.agents/agents verify-tasks --strict .agents/wb/$(cat .agents/wb/.active_session)
```

State rules:

- use the task marker board as the source of truth with canonical markers:
  `[ ]`, `[/]`, `[!]`, `[>]`, `[%]`, `[&]`, `[x]` move from `[%]` to `[&]` only
  after test evidence exists mark `[x]` only after closure evidence exists
