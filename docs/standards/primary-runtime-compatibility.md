---
doc_type: standard
id: primary-runtime-compatibility
status: active
created_at: '2026-03-06T22:36:20+00:00'
updated_at: '2026-04-13T19:37:00-03:00'
---

# Primary Runtime Compatibility

## Purpose

Define the committed compatibility contract for the three primary runtimes supported by this scaffold:

- OpenCode
- Codex
- Qwen

Compatibility runtimes kept in sync for broader reuse:

- Claude
- Gemini

## Canonical Source Rule

- `AGENTS.md` is the canonical instruction source.
- `docs/arc/GENERAL-ROADMAP.md` and `docs/arc/SPECS/` remain the canonical strategic layer.
- `.afol/wb/` remains the canonical execution layer.

Runtime-specific files must adapt this canonical layer, not redefine it.

## Committed Runtime Adapters

Primary runtime contract:

### Canonical Instructions

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/README.md`

OpenCode, Qwen, Gemini, and Codex do not require committed root mirrors or
project-local adapter folders in this scaffold. They should use `AGENTS.md`
directly or host-level global runtime configuration.

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

### Claude

- Treat `CLAUDE.md` as the committed mirror of `AGENTS.md`.
- Keep `.claude/` thin and secret-free.

## Drift Control

- Mirror files should be generated or synced from the canonical source where possible.
- Runtime adapters should stay thin enough that drift is easy to detect in code review.
- If runtime-specific behavior starts to dominate, revisit the canonical contract instead of layering more mirrors.
- Bootstrap and tooling must distinguish primary support (OpenCode, Codex, Qwen) from compatibility mirrors (Claude, Gemini).

## Verification

- `just sync`
- `just lint`
- `just doctor`
- `just all`

## Acceptance

- OpenCode is treated as a first-class runtime in repo structure and bootstrap.
- Runtime adapter files are documented and secret-free.
- Canonical governance remains runtime-agnostic and primary.
