---
doc_type: rule
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
./afol validate
./afol status
./afol verify-tasks <configured-wb-dir>/<session>/
just doctor
just lint
just verify
```

## Exit Codes

- `validate`: `0` pass, non-zero on errors
- `verify-tasks`: `0` complete, non-zero on pending/invalid tasks

## Validation Checklist

- [ ] `just doctor` passes
- [ ] `just lint` passes
- [ ] `just verify` passes
- [ ] `./afol validate` passes
- [ ] Frontmatter valid
- [ ] Task markers valid
- [ ] Timestamps include timezone

## Rule

- Do not commit with failed required gates.
- Do not mark task done without evidence-backed validation.
