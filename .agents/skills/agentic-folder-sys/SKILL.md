---
name: agentic-folder-sys
description: Use when installing, upgrading, validating, or operating this project-local `.agents` scaffold, including bootstrap, skills-sync, runtime validation, workbench sessions, task/report/log artifacts, and closure evidence.
metadata:
  category: agentic
  tags: "agentic-folder-sys, agentic-system, workflow, bootstrap, upgrade, skills-sync, workbench, wb, git, validation"
  triggers: "agentic folder sys, agentic-folder-sys, .agents scaffold, bootstrap repo, install scaffold, update framework, upgrade scaffold, skills-sync, universal-skills, workbench, wb-update, verify-tasks, reporting, planning, execution"
  references: "core, patterns, troubleshooting, workbench, templates, gotchas"
  version: "1.0.0"
  updated_at: "2026-04-18T21:39:30-03:00"
  target_provider: universal
---

# Agentic Folder Sys

Use this as the single operational entrypoint for the repo-local `.agents`
folder system. It merges the scaffold lifecycle workflow and the governed
workbench workflow so agents do not route through two overlapping skills.

## Decision Tree

Need to install or upgrade the scaffold in another repo?

- Start with [Core](./references/core/README.md)

Need the git-backed skill refresh or upstream PR proposal flow?

- Open [Patterns](./references/patterns/README.md)

Need to verify, recover from drift, or resolve a failed operation?

- Open [Troubleshooting](./references/troubleshooting/README.md)

Need to organize a governed `.agents/wb/` session?

- Use the workbench rules below and copy from [Templates](./references/templates/)

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
- Workbench lives at `.agents/wb/`; keep one session folder per workstream.
- Treat `.agents/wb/.active_session` as canonical when it exists.
- Use standardized workbench artifacts: `plan`, `task`, `log`, and `report`.
- For major work, also use `brainstorm`, `explorer-check`, and `postmortem`.
- Before touching any file or artifact, resolve the applicable rule, standard,
  template, skill, and spec for that element. Apply all cumulative guidance for
  the element type and work intent, such as TypeScript plus feature plus spec.
- For every feature addition or meaningful feature behavior change, update the
  affected project-local skill under `.agents/skills/`, update the affected
  project docs, and record a pending item to propose the relevant skill change
  back to universal-skills through the approved branch/PR flow.
- Prefer `./.agents/agents wb-update ...` over manual timestamp, task-state,
  evidence, and file-list edits.
- Mark tasks done only after evidence exists and strict verification passes.
- Verify behavior with repo commands before reporting completion.

## Workbench Workflow

1. Create or target a session through `./.agents/agents new ...` so
   `.active_session` stays accurate.
2. Keep `roadmap_feature` and `parent_spec` context on major workstreams.
3. Resolve the applicable rules for each element the workstream will touch.
4. For feature work, keep local skills and docs in sync with behavior changes
   and leave a universal-skills propagation pending item.
5. Start with `plan` and `task`; add `brainstorm` and `explorer-check` before
   execution for major work.
6. Execute the change and record progress in `log`.
7. Record validation with `./.agents/agents wb-update evidence ...`.
8. Run repo checks and strict session verification before closure.
9. Close with `report` and, for major workstreams, `postmortem`.

## Workbench Artifacts

Minimum artifact set:

- `plan`
- `task`
- `log`
- `report`

Common companion artifacts:

- `brainstorm`
- `explorer-check`
- `research`
- `spec` or `spec-child`
- `spec-test` for test-focused strategy work
- `spec-lite` as a legacy compatibility alias
- `blocks`
- `postmortem`

Use templates from `./references/templates/` when creating or repairing
workbench files.

## Validation

```bash
./.agents/agents skills-sync check --skills agentic-folder-sys
./.agents/agents verify-tasks --strict .agents/wb/$(cat .agents/wb/.active_session)
make lint
```
