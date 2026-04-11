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

A task is complete only with evidence:

1. **Test output** - Full test run showing pass/fail
2. **Lint output** - Linter showing no errors
3. **Build output** - Successful build log
4. **Manual verification** - Screenshot or log excerpt

## Verification checklist

- [ ] All tests pass
- [ ] Lint passes
- [ ] Typecheck passes (if applicable)
- [ ] Build succeeds (if applicable)
- [ ] Manual verification done (if needed)

## Blocked verification

If verification is blocked:

1. Document why
2. Propose smaller safe change
3. Add diagnostics to unblock future work

---

*Standard: `.agents/a-docs/standards/verification.md`*
