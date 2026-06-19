---
description: Handoff guidance for delegating AFOL work to scoped agents.
metadata:
  tags: "agentic-folder-sys, afol, delegation, agents, handoff, parallel"
---

# AFOL Delegation Guidance

Use this when spawning or coordinating agents. Keep each agent's context narrow:
give it only the references needed for its role.

## Handoff Fields

Every handoff should include:

- goal;
- repo root;
- branch and dirty-state warning;
- allowed files;
- forbidden files or legacy surfaces;
- session id and task id, if governed;
- suggested skills/references;
- edit permission: read-only or may edit;
- expected output contract.

## Suggested Skill References By Role

| Role | Suggested references | Do not include by default |
| --- | --- | --- |
| Planner | `agentic-folder-sys: planning`, `tools` | execution, benchmark |
| Executor | `agentic-folder-sys: execution`, `tools` | install/adoption unless relevant |
| Reviewer | `tools`, `troubleshooting` if failures exist | templates, benchmark |
| Benchmark agent | `benchmarking`, `tools` | install/adoption |
| Adoption agent | `core`, `patterns`, `troubleshooting` | benchmark |
| Skill editor | `patterns` section 5, `tools`, local skill files | release benchmark unless exporting |

## Example Handoff

```markdown
Goal: Update `afol health` default behavior and prove installed binary output.
Repo root: `/home/ozy/apps/agentic_start_folder`.
Dirty state: unrelated skill/template files are already modified; do not touch
them.
Allowed files: `cli/services/health/**`, `cli/tests/health-system.test.ts`.
Forbidden: `.agents/runtime`, `.agents/scripts`, unrelated skill docs.
Session/task: `260616_1507_health-core-default`, `T-01`.
Suggested skills: `agentic-folder-sys` references `execution`, `tools`; no
benchmarking.
Output: changed paths, commands run, evidence ids, residual risk.
```

## Parallel Work Rules

- Prefer explicit `--session` and `--task-id`; do not rely on active-session
  discovery.
- Assign distinct files or tasks to each agent.
- If two agents need the same file, serialize the edits.
- Have reviewers inspect diffs and commands, not rewrite broad context.
- Merge results only after checking `git status --short --branch`.
