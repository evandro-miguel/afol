---
doc_type: rule
id: RULE-009
theme: legacy-surface-retirement
version: 1.1
created: 2026-06-09
updated_at: '2026-06-20T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Legacy Surface Retirement

**Purpose:** retire legacy wrappers only after replacement, parity, and docs are
proved.

## Applies When

Use this rule when removing or deprecating old wrappers, scripts, Just targets,
Python runtime surfaces, compatibility aliases, or legacy command routing.

## Conditions

Remove a legacy surface only when all are true:

- TS-native replacement exists and tests pass.
- Parity tests show no downstream visibility gap.
- Cleanup targets scaffold-owned paths only.
- Cleanup has a dry-run or explicit apply flag.
- Public docs no longer present the retired path as active.

Until then, keep it as documented compatibility debt.

## Boundaries

- Never remove user-owned files, configs, customizations, secrets, or caches.
- Review generated map/index/docs deltas before commit.
- Do not declare retirement while compatibility tests still fail.

## Validation

```bash
bun run typecheck
bun test
bun run validate:template
```

Use bootstrap parity checks when downstream scaffold behavior changes.

## References

- RULE-005 - Folder Structure
- RULE-006 - Applicable Rule Resolution
- `AGENTS.md`
