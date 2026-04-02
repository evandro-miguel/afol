# Qwen Agent Configuration

## Skills

Skills are symlinked from `.agents/skills/` - the mandatory skills folder.

```
.qwen/skills -> ../.agents/skills
```

Do not store skills directly in this folder.

## Canonical Contract

- `QWEN.md` is the runtime-facing instruction mirror for Qwen and must derive from `AGENTS.md`.
- `docs/arc/GENERAL-ROADMAP.md` and `docs/arc/SPECS/` remain the strategic source of truth.
- `.agents/wb/` remains the execution source of truth.

## Secret Boundary

Do not commit:

- provider credentials
- auth tokens
- user-local Qwen state
- machine-specific personal config

Keep `.qwen/` thin, portable, and traceable back to the canonical governance files.

---
*Agent folder: `.qwen/`*
