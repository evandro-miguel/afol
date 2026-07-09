---
doc_type: lesson_entry
id: lesson_20260705_0000_agentic_folder_sys_stays_global
status: active
created_at: '2026-07-05T00:00:00-03:00'
source: user_correction
related_workstream_id: none
---

# Lesson: Agentic Folder Sys Stays Global

## Correction

The user clarified that `agentic-folder-sys` must not be required inside
project-local `.agents/skills/` folders. Local copies caused confusion with
older skill versions.

## Prevention Rule

- Keep `agentic-folder-sys` in the global Codex skill layer.
- Do not vendor `agentic-folder-sys` under `.agents/skills/`,
  `src/project-template/.agents/skills/`, or universal-skills seed folders.
- Project-local `.agents/skills/` remains available only for skills that are
  genuinely specific to the target repo or provider surface.

## Guardrail

- Template and manifest validation must fail if a project-local
  `agentic-folder-sys` copy is reintroduced.
