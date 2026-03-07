# Codex Agent Configuration

## Skills

Skills are symlinked from `.agents/skills/` - the mandatory skills folder.

```
.codex/skills -> ../.agents/skills
```

Do not store skills directly in this folder.

## Canonical Contract

- `AGENTS.md` is the canonical repo instruction source for Codex.
- `.agents/arc/GENERAL-ROADMAP.md` and `.agents/arc/SPECS/` remain the strategic source of truth.
- `.agents/wb/` remains the execution source of truth.

## Secret Boundary

Do not commit:

- provider credentials
- auth tokens
- user-local Codex state
- machine-specific personal config

Keep `.codex/` thin, portable, and traceable back to the canonical governance files.

---
*Agent folder: `.codex/`*
