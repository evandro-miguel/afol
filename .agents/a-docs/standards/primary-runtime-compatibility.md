---
doc_type: standard
id: primary-runtime-compatibility
status: active
created_at: '2026-03-06T22:36:20+00:00'
updated_at: '2026-03-06T19:48:51-03:00'
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
- `.agents/arc/GENERAL-ROADMAP.md` and `.agents/arc/SPECS/` remain the canonical strategic layer.
- `.agents/wb/` remains the canonical execution layer.

Runtime-specific files must adapt this canonical layer, not redefine it.

## Committed Runtime Adapters

Primary runtimes:

### OpenCode

- `OPENCODE.md`
- `opencode.json`
- `.opencode/README.md`
- `.opencode/agent/README.md`

### Codex

- `AGENTS.md`
- `.codex/README.md`
- `.codex/skills` -> `.agents/skills`

### Qwen

- `QWEN.md`
- `.qwen/README.md`
- `.qwen/skills` -> `.agents/skills`

Compatibility runtimes:

### Claude

- `CLAUDE.md`
- `.claude/README.md`

### Gemini

- `GEMINI.md`
- `.gemini/README.md`

## Secret Boundary

Never commit:

- API keys
- auth tokens
- provider credentials
- user-local runtime state
- machine-specific paths that only work on one contributor machine

Committed runtime config must stay safe to review publicly inside the repository.

## Runtime-Specific Rules

### OpenCode

- Use `opencode.json` only for project-safe defaults such as instructions and conservative permission policy.
- Keep project-local agent definitions under `.opencode/agent/` only when they add narrow runtime-specific behavior.

### Codex

- Treat `AGENTS.md` plus `.codex/README.md` as the repo-facing contract.
- Keep any user-local Codex machine configuration outside the repository unless it is explicitly secret-free and portable.

### Qwen

- Treat `QWEN.md` plus `.qwen/README.md` as the repo-facing contract.
- Keep runtime-specific Qwen agent/config files out of the repo unless they are secret-free, portable, and clearly justified.

## Drift Control

- Mirror files should be generated or synced from the canonical source where possible.
- Runtime adapters should stay thin enough that drift is easy to detect in code review.
- If runtime-specific behavior starts to dominate, revisit the canonical contract instead of layering more mirrors.
- Bootstrap and tooling must distinguish primary support (OpenCode, Codex, Qwen) from compatibility mirrors (Claude, Gemini).

## Verification

- `make sync`
- `make lint`
- `make doctor`
- `make all`

## Acceptance

- OpenCode is treated as a first-class runtime in repo structure and bootstrap.
- Runtime adapter files are documented and secret-free.
- Canonical governance remains runtime-agnostic and primary.
