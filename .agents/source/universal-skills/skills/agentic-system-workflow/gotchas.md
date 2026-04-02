---
description: Known traps for scaffold install, skills sync, and governed execution
metadata:
  tags: "agentic-system, gotchas, bootstrap, skills-sync, workbench"
---

# Agentic System Operational Gotchas

## 1. Do Not Modify `updated_at` Manually

Do not edit workbench timestamps manually.

Always update metadata via scripts:
- `make wb-touch`
- `./.agents/agents wb-update touch`

## 2. `--partial` Still Requires an Existing Repo

Full bootstrap can create a missing target directory. `bootstrap --partial`
still requires an existing repository path.

## 3. `skills-sync pull` Does Not Update `.agents/skills/`

Use `skills-sync sync` or `skills-sync update` to refresh the installed project
skills.

## 4. Git Is the Refresh and Publish Truth

Treat the repo-local seed under `.agents/source/universal-skills` as the local
baseline. Treat the configured git-backed source or mirror as the refresh and
publish path.

## 5. Use `--partial` for Live Repositories

Do not full-bootstrap over a repo with active project files unless overwrite is
intentional.

## 6. The Project Skill Surface Is a Curated Subset

Do not copy mirrors or caches into `.agents/skills/`. Keep `.agents/skills/` as
the project-owned subset that the agent actually uses.

## 7. Verify Before Closing

Do not mark tasks done just because files changed.

## 8. Use the Scaffold Repo-Map Wrapper

Do not call raw repo-analysis repo-map generation without an explicit output
root. Use `./.agents/agents repo-map .` or `make repo-map` so the map stays in
`docs/map/` instead of legacy locations.

## 9. Safety Rules
- Never expose secrets in code, logs, docs, or commits.
- Avoid destructive operations unless explicitly authorized. Do not delete logic, only refactor.
- Archive before delete under `.agents/z-arq/YYYYMMDD_<description>/`.
- Do not add dependencies without clear justification.
