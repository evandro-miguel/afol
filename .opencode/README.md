# OpenCode Agent Configuration

## Skills

Skills are symlinked from `.agents/skills/` - the mandatory skills folder.

```text
.opencode/skills -> ../.agents/skills
```

Do not store skills directly in this folder.

## Project Adapter

- `opencode.json` at the repository root is the committed OpenCode project adapter.
- `.opencode/agent/` is the place for secret-free project-local OpenCode agent definitions when they are truly needed.
- Keep OpenCode-specific files thin and aligned with `AGENTS.md` and `.agents/*`.

## Canonical Contract

- `OPENCODE.md` is the runtime-facing instruction mirror for OpenCode and must derive from `AGENTS.md`.
- `docs/arc/GENERAL-ROADMAP.md` and `docs/arc/SPECS/` remain the strategic source of truth.
- `.agents/wb/` remains the execution source of truth.

## Secret Boundary

Do not commit:

- provider credentials
- auth tokens
- user-local OpenCode state
- machine-specific personal config

---

*Agent folder: `.opencode/`*
