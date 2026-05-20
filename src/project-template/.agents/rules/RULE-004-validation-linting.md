---
id: RULE-004
theme: validation-linting
version: 1.0
created: 2026-02-23
applies_to: All agents (QWEN, CLAUDE, GEMINI)
updated_at: '2026-05-14T20:05:00-03:00'
---

# Validation & Linting

**Purpose:** No closure without proof.

## Pre-Commit Validation (MANDATORY)

```bash
just doctor
just lint
just verify
```

Full pass:

```bash
just all
```

## Validation Commands

```bash
./.agents/agents doctor
./.agents/agents lint-docs .agents/wb/
./.agents/agents lint-docs .agents/wb --fix
./.agents/agents verify-tasks .agents/wb/<session>/
./.agents/agents wb-update normalize-time --all-wb
```

## Exit Codes

- `doctor`: `0` pass, `1` errors
- `verify-tasks`: `0` complete, `1` pending/invalid

## Validation Checklist

- [ ] `just doctor` passes
- [ ] `just lint` passes
- [ ] `just verify` passes
- [ ] Frontmatter valid
- [ ] Task markers valid
- [ ] Timestamps include timezone

## Rule

- Do not commit with failed required gates.
- Do not mark task done without evidence-backed validation.
