---
doc_type: standard
id: primary-runtime-compatibility
status: active
created_at: '2026-03-06T22:36:20+00:00'
updated_at: '2026-04-13T19:37:00-03:00'
---

# Primary Runtime Compatibility

## Purpose

Define the committed compatibility contract for the runtimes supported by this
scaffold:

- OpenCode
- Codex
- Qwen

Optional runtime adapters kept thin for broader reuse when enabled:

- Claude
- Gemini

## Canonical Source Rule

- `AGENTS.md` is the canonical instruction source.
- `.afol/adm/` is the canonical strategic and governance layer.
- `.afol/pstr/` is the generated observed project-structure map layer when
  present; missing or stale maps are not authoritative.
- `.afol/wb/` remains the canonical execution layer.
- `.agents/` is limited to static scaffold metadata and provider skills:
  `lock.json`, `manifest.json`, and `.agents/skills/**`. Hooks, rules, source
  seeds, and mutable state belong under `.afol/**`.

Runtime-specific files must adapt this canonical layer, not redefine it.

## Committed Runtime Adapters

Primary runtime contract:

### Canonical Instructions

- `AGENTS.md`

OpenCode, Qwen, Gemini, and Codex should use `AGENTS.md` directly or
host-level global runtime configuration unless a project explicitly enables an
adapter.

## Secret Boundary

Never commit:

- API keys
- auth tokens
- provider credentials
- user-local runtime state
- machine-specific paths that only work on one contributor machine

Committed runtime config must stay safe to review publicly inside the repository.

## Runtime-Specific Rules

### Codex, OpenCode, Qwen, and Gemini

- Treat `AGENTS.md` as the repo-facing contract.
- Keep user-local or global runtime configuration outside the repository unless
  a future project explicitly justifies a portable, secret-free adapter.

- Runtime adapters are optional and controlled by `.afol/config.json`; legacy
  `.agents/config.json` is fallback only.
- If the Claude adapter is disabled, do not create or sync `CLAUDE.md` or
  `.claude/**`.
- If the Claude adapter is enabled, keep its mirror thin and synchronized with
  `AGENTS.md`.

## Drift Control

- Runtime files should be minimal and drift-resistant.
- Keep runtime-specific behavior in runtime-local configuration when possible.
- Bootstrap and tooling must distinguish primary support (OpenCode, Codex, Qwen)
  from optional adapters (for example, Claude or Gemini) and avoid treating
  adapter mirrors as independent policy sources.

## Verification

- `afol validate select --changed-path <adapter-path>`
- `afol validate select --changed-path AGENTS.md`
- `afol validate select --changed-path docs/standards/primary-runtime-compatibility.md`
- `afol validate project --json`
- `bun run validate:release`

## Acceptance

- OpenCode is treated as a first-class runtime in repo structure and bootstrap.
- Runtime adapter files are documented and secret-free.
- Canonical governance remains runtime-agnostic and primary.
