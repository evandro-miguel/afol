# OpenCode Project Agents

Use this folder for project-local OpenCode agent definitions when the repository needs runtime-specific roles.

Rules:

- Keep agent definitions secret-free.
- Keep role behavior aligned with `AGENTS.md` and `.agents/*` governance.
- Do not duplicate full project governance here; reference the canonical docs instead.
- Prefer adding narrow runtime-specific behavior only when the canonical layer is insufficient.

Suggested uses:

- Read-only review agent
- Roadmap/spec planning agent
- Implementation agent with stricter runtime permissions

---

*Folder: `.opencode/agent/`*
