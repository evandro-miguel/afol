---
doc_type: standard
id: 000000_000000_tech-stack_standard_01
status: active
created_at: '2026-03-07T00:00:00Z'
updated_at: '2026-03-06T22:29:30-03:00'
---

# Tech Stack

## Primary Stack

- Bun and TypeScript for the current CLI/kernel under `cli/**`
- `afol`/`./a` as the public downstream command surface
- Bash and Just for wrapper automation
- Markdown, YAML, JSON, and TOML for durable project artifacts

## Boundary Notes

- `src/project-template/` is the exportable scaffold source
- `.agents/agents`, `.agents/scripts`, and `.agents/runtime` stay in the
  factory tree as legacy compatibility during migration; they are retained for
  fallback-only behavior and are retired only when all delegated command families
  are covered by native TS implementations.
- Root `.agents/wb/` is factory workbench history and does not ship downstream

## Runtime Surface

- Canonical governance: `AGENTS.md` and `.agents/*`
- Primary runtimes: OpenCode, Codex, and Qwen
- Additional mirror: Gemini-facing adapter documentation

## Verification Stack

- `bun run typecheck` for TypeScript checks
- `bun test` and focused `bun test cli/tests/...` runs for the CLI
- `just lint` for docs/prompt/process surfaces when needed
- Targeted legacy compatibility checks only when touching factory-only
  `.agents/*` compatibility files
