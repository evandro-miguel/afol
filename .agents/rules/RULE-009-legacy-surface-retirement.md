---
doc_type: rule
id: RULE-009
theme: legacy-surface-retirement
version: 1.0
created: 2026-06-09
updated_at: '2026-06-09T07:30:00-03:00'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Legacy Surface Retirement

**Purpose:** Govern the safe retirement of legacy compatibility surfaces
(Python/UV wrappers, just command runners, old aliases) while downstream
paths still exist.

---

## When This Rule Applies

Apply this rule when removing or deprecating legacy wrappers, scripts,
justfile targets, Python runtime surfaces, or compatibility aliases.

---

## Safe Retirement Conditions

A legacy surface may only be removed when ALL of:

1. A proven TS-native replacement exists with passing tests.
2. Parity tests confirm no downstream visibility gap.
3. The removal targets scaffold-owned paths only — not user-owned files.
4. A dry-run or explicit flag (`--dry-run`, `--apply`) is available for the
   cleanup operation.
5. Documentation no longer references the retired surface as a public entrypoint.

Until all conditions are met, the legacy surface stays as compatibility debt
documented in AGENTS.md or the relevant spec.

---

## Cleanup Scope

- Removal must be limited to files the scaffold owns.
- Do not remove user-created files, configs, or customizations.
- Generated map/index/docs deltas from cleanup must be reviewed before commit.

---

## Declaration Discipline

- Do not declare a runtime "retired" while compatibility paths still need proof.
- Toolchain/version claims must stay informational until installation evidence
  exists.
- Future-version or tooling notes must remain informative unless the upgrade is
  actually shipped and verified.

---

## Validation

Before completing legacy retirement:

- `bun run typecheck` passes.
- `bun test` passes with no regressions.
- Template policy tests pass (no retired surface leaked to downstream).
- `bun run validate:bootstrap` confirms downstream parity.

---

## Best Practices

**DO:**

- ✅ Keep removal conservative and scaffold-scoped.
- ✅ Provide dry-run before destructive cleanup.
- ✅ Document remaining compatibility debt explicitly.

**DON'T:**

- ❌ Remove surfaces without a proven replacement.
- ❌ Declare retirement while tests prove otherwise.
- ❌ Touch user-owned files during scaffold cleanup.

---

## References

- RULE-005 - Folder Structure
- RULE-006 - Applicable Rule Resolution
- AGENTS.md - Factory And Template Boundary section

---

*Version: 1.0 | Lines: ~85 | Max: 250*
