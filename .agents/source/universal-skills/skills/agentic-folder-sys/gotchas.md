# AFOL Gotchas

- Do not create mutable state under `.agents/`; it is retained static metadata.
- Do not keep checklist items open after the state board marks a task done.
- Do not use verbose AFOL command output unless a concrete conflict requires it.
- Record evidence before closing governed tasks.
- Keep project-structure maps in `.afol/pstr/` and human-facing maps in
  `docs/map/`.
- Archive or migrate useful old material into AFOL-owned paths before relying
  on it as active guidance.
