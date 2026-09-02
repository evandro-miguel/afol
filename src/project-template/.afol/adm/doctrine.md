---
id: "doctrine"
type: "reference"
desc: "AFOL doctrine and design principles"
created: "2026-06-20"
updated: "2026-06-20"
---

# Doctrine

- AFOL is the active governance surface.
- Keep mutable runtime state in `.afol/*` and keep `.agents/` metadata-facing only.
- Use workbench evidence for execution; do not encode lifecycle state in docs templates.
