---
description: Operational playbooks for skills refresh, publish, and workbench execution
metadata:
  tags: "agentic-system, skills-sync, git, workbench, operational-playbooks"
---

# Agentic System Patterns

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
- `skills-sync pull` refreshes the git-backed source or mirror only.
- `skills-sync sync` / `skills-sync update` refresh the actual project skill
  copies under `.agents/skills/`.

## 2. Ensure One Operational Skill

```bash
./.agents/agents skills-sync ensure agentic-system-workflow --runtime codex --pull
```

Use this when the repo needs the scaffold-operating skill available locally
without doing a broader skill refresh.

## 3. Publish a Local Skill Change Back to Git

```bash
./.agents/agents skills-sync push agentic-system-workflow --commit --push
```

Use this only when the local skill change is ready to become upstream state.
Commit and push remain explicit so the agent does not publish by accident.

## 4. Governed Workbench Execution

When the change is non-trivial, use the scaffold's workbench flow:

```bash
./.agents/agents new <theme> --feature-id F-10 --parent-spec <spec-id>
./.agents/agents wb-update touch
./.agents/agents verify-tasks --strict .agents/wb/$(cat .agents/wb/.active_session)
```

State rules:
- use the task state board as the source of truth
- move to `ready_for_test` only after implementation is in place
- mark `done` only after evidence exists
