---
description: Known traps for scaffold install, skills sync, governed execution, and workbench sessions
metadata:
  tags: "agentic-folder-sys, gotchas, bootstrap, skills-sync, workbench"
---

# Agentic Folder Sys Gotchas

## 1. Do Not Modify `updated_at` Manually

Do not edit workbench timestamps manually.

Always update metadata via scripts:

- `make wb-touch` `./.agents/agents wb-update touch`

## 2. `--partial` Still Requires an Existing Repo

Full bootstrap can create a missing target directory. `bootstrap --partial`
still requires an existing repository path.

## 3. `skills-sync pull` Does Not Update `.agents/skills/`

Use `skills-sync sync` or `skills-sync update` to refresh the installed project
skills.

## 4. `scaffold-update` Is Preview-First

`scaffold-update --channel stable` does not mutate by default. Use `--plan-only`
or `--diff-only` first, and add `--apply` only after the source channel,
allowlist, and expected diff are clear. Do not bypass this with a mutable
checkout that lacks `releases/channels/stable.json`.

## 5. Git Refreshes, PRs Propose

Treat the repo-local seed under `.agents/source/universal-skills` as the local
baseline. Treat a configured external universal-skills checkout as the refresh
path. Any upstream skill change must go through a proposal branch and PR, never
a direct push to universal `main`.

## 6. Skill Names Are Not Paths

Reject skill and profile identifiers that are empty, absolute paths, contain
path separators, contain NUL bytes, or equal `.` / `..`. Validate CLI, manifest,
and upstream profile selections before removing or copying any destination under
`.agents/skills/`.

## 7. Use `--partial` for Live Repositories

Do not full-bootstrap over a repo with active project files unless overwrite is
intentional.

## 8. The Project Skill Surface Is a Curated Subset

Do not copy mirrors or caches into `.agents/skills/`. Keep `.agents/skills/` as
the project-owned subset that the agent actually uses.

## 9. Do Not Split Scaffold And Workbench Routing

Use `agentic-folder-sys` for both scaffold lifecycle operations and governed
`docs/plans/` work. Do not reintroduce separate `agentic-system-workflow` and
`workbench-agent-teams` skills in this repo.

## 10. Verify Before Closing

Do not mark tasks `[x]` just because files changed.

## 11. Use the Scaffold Repo-Map Wrapper

Do not call raw repo-analysis repo-map generation without an explicit output
root. Use `./.agents/agents repo-map .` or `make repo-map` so the map stays in
`docs/map/` instead of legacy locations.

## 12. Safety Rules

- Never expose secrets in code, logs, docs, or commits. Avoid destructive
  operations unless explicitly authorized. Do not delete logic, only refactor.
  Archive before delete under `.agents/z-arq/YYYYMMDD_<description>/`. Do not
  add dependencies without clear justification.
