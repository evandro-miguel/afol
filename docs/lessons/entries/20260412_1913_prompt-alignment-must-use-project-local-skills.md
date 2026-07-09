---
doc_type: lesson_entry
id: lesson_20260412_1913_prompt_alignment_must_use_project_local_skills
status: active
created_at: '2026-04-12T19:13:18-03:00'
source: user_correction
related_workstream_id: none
updated_at: '2026-06-20T00:00:00-03:00'
---

# Lesson: Prompt Alignment Must Classify Skill Ownership

## Correction

The user flagged that the previous orchestrator prompt used stale assumptions
about the scaffold's skill surface.

## Prevention Rule

- Before rewriting scaffold operating prompts, inspect the current repo-local
  `AGENTS.md`, `.afol/config.json`, `.agents/skills/`, and relevant AFOL CLI
  help.
- Treat `.agents/skills/` as the primary surface only for project-specific
  skills. Do not present global Codex skills as scaffold-local core skills, and
  do not vendor universal AFOL operator skills such as `agentic-folder-sys`
  into `.agents/skills/`.

## Guardrail

- For this repository, route governed scaffold/workbench operations through
  global Codex `agentic-folder-sys` guidance and AFOL CLI commands; do not
  reintroduce the older split between `agentic-system-workflow` and
  `workbench-agent-teams`.
