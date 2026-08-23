---
id: lesson_20260626_1052_universal_skills_private_repo_path
title: Universal skills private repo path
status: active
created_at: '2026-06-26T10:52:55-03:00'
updated_at: '2026-06-26T10:52:55-03:00'
owner: codex
---

## Lesson: Universal Skills Private Repo Path

Workbench context: `N/A`.

### What happened

- AFOL guidance pointed to the system source-state mirror at
  `/home/ozy/00_sys/os/.agents/source/universal-skills`.
- The durable universal skills repository for this machine is
  `/home/ozy/01_projects/dev/universall-skill-sys-pvt`.

### Prevention Rule

- Treat `.afol/adm/source/universal-skills` and
  `/home/ozy/00_sys/os/.agents/source/universal-skills` as local seeds or
  mirrors, not the durable universal skills repository.
- For durable universal skill checks or upstream changes, use
  `/home/ozy/01_projects/dev/universall-skill-sys-pvt`.

### Guardrail

- Before documenting a universal skill source path, verify that
  `skills/agentic-folder-sys/SKILL.md` exists in that checkout.
- This source-path check is historical provenance only; active AFOL routing is
  local `AGENTS.md`, resolved rules, and `afol help <command>`.
