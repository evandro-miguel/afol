---
type: standard
status: active
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

# Verification Standards

## Purpose

Define the commands and processes for verifying changes in this repository.

## Standard commands

Agents MUST search the repo to discover the actual commands. Do not guess.

| Command | Purpose | Discovery method |
|---------|---------|------------------|
| Install | Install dependencies | Check `package.json`, `requirements.txt`, `Cargo.toml`, etc. |
| Dev | Start dev server | Check `package.json` scripts or project docs |
| Lint | Run linter | Check `package.json`, `.eslintrc`, `pyproject.toml` |
| Typecheck | Type checking | Check `tsconfig.json`, `pyproject.toml` |
| Test | Run tests | Check test config files |
| Build | Build for production | Check build scripts |

## Evidence requirements

A task is complete only with evidence for the smallest relevant gate that proves
the change. Record:

1. **Command or check** - Exact command, manual check, or explicit `N/A`.
2. **Result** - Pass/fail/blocked plus a short relevant excerpt.
3. **Scope** - Why this gate is enough, or why broader gates are required.

Broaden to typecheck, focused tests, full tests, build, release, manual
verification, security scans, or browser checks when the touched surface or risk
requires it.

## Verification checklist

- [ ] Relevant command/check selected from live repo evidence
- [ ] Result recorded with pass/fail/blocked
- [ ] Broader gate run when behavior, release, security, or UI risk requires it
- [ ] Manual verification done or marked `N/A`

## Blocked verification

If verification is blocked:

1. Document why
2. Propose smaller safe change
3. Add diagnostics to unblock future work

---

*Standard: `docs/standards/verification.md`*
