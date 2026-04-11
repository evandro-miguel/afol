---
name: agentic-system-workflow
description: Use when installing, upgrading, validating, or operating this `.agents` scaffold in the current repository or another repository. Activate whenever the user wants to bootstrap a project, adopt or update the framework in an existing repo, refresh project-local skills from the git-backed universal-skills source, propose skill changes upstream, or run the governed workbench flow.
metadata:
  category: agentic
  tags: "agentic-system, workflow, bootstrap, upgrade, skills-sync, workbench, git"
  triggers: "agentic system, bootstrap repo, install scaffold, update framework, upgrade scaffold, skills-sync, universal-skills, workbench, reporting, planning, execution"
  references: "core, patterns, troubleshooting, gotchas"
---

# Agentic System Workflow

Use this as the operational entrypoint for the scaffold. Prefer the repo-local
commands and docs over ad hoc shell conventions.

## Decision Tree

Need to install or upgrade the scaffold in another repo?

- Start with [Core](./references/core/README.md)

Need the git-backed skill refresh or upstream PR proposal flow?

- Open [Patterns](./references/patterns/README.md)

Need to verify, recover from drift, or resolve a failed operation?

- Open [Troubleshooting](./references/troubleshooting/README.md)

Before finalizing, scan [Gotchas](./gotchas.md).

## Operating Rules

- Treat `./.agents/agents bootstrap` as the installer for this scaffold.
- Full bootstrap can create the target directory for a brand new repo.
- Use `bootstrap --partial` for existing projects so project-owned files stay
  intact.
- Keep project-owned repository docs outside `.agents/`; use `docs/map/` for
  current-state repository mapping and analysis evidence.
- Treat git as the upstream source of truth for universal-skills, but keep that
  checkout outside the project scaffold.
- Treat `.agents/source/universal-skills` as the repo-local seed inside each
  project; it must not be a nested git checkout.
- Treat `skills-sync pull` as source refresh only. Use `skills-sync sync` or
  `skills-sync update` to actually refresh `.agents/skills/`.
- Use `skills-sync push` only as a branch/PR proposal flow from an external
  universal-skills checkout; never push directly to universal `main`.
- Prefer `make agents-all` in adopted repos when the project already owns
  `make all`.
- Verify behavior with repo commands before reporting completion.

## Validation

```bash
bun .agents/skills/writing-skills/scripts/check-skill.js \
  /home/ozy/apps/agentic_start_folder/.agents/skills/agentic-system-workflow \
  --tier 2
```
