---
doc_type: lesson_entry
id: lesson_20260306_2352_spec_lite_flexible_tmp_home
status: active
created_at: '2026-03-06T23:52:00Z'
updated_at: '2026-03-06T23:52:00Z'
source: user_correction
related_session: 260306_2002_execution-intelligence-system
---

# Lesson: `spec-lite` Is Flexible and Temporary Files Need a Governed Home

## Correction

`spec-lite` should remain a flexible workstream-level choice when it is useful. The system should not force an artificial threshold for it.

The scaffold also needs a governed `.agents/tmp/` location for temporary artifacts that do not fit the durable structure yet.

## Prevention Rule

- When the user asks for flexibility, encode that flexibility directly in the governance docs instead of leaving it as an unresolved threshold.
- If temporary artifacts have no approved home, create one in the scaffold instead of letting them leak into durable folders.

## Guardrail

- Keep the parent spec mandatory for meaningful work.
- Treat `spec` and `spec-lite` as local refinement choices.
- Treat `.agents/tmp/` as non-canonical and never as a source of final evidence.
