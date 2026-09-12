---
doc_type: rule
id: RULE-004
theme: validation-linting
version: 2.0
created: 2026-02-23
updated_at: '2026-09-12T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Validation And Linting

**Purpose:** validate touched code, scaffold state, and docs before completion.

---

## Completion Validation

Run the smallest checks that prove the touched surface. For cross-cutting
scaffold changes, run:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```

For a governed session, also run:

`afol verify-tasks --strict`.

An approved legacy-evidence baseline may leave strict output nonzero;
`afol validate project --json` remains the release gate, admitting only exact
waived historical debt. New, changed, open, invalid, or unlisted evidence
blocks. For static JSON, run `python -m json.tool .afol/adm/tools.json`.

---

## Checklist Discipline

- Closed tasks must not retain open generic checklist items.
- Evidence must name the command that actually ran.
- Failed or skipped checks must stay visible in the final report.
- Do not hard-wrap prose only to satisfy line-length lint.

---

## Best Practices

**DO:**

- Start with focused tests for touched code.
- Broaden to project/release checks when shared behavior changed.
- Complete governed tasks with observed exit-zero evidence (`afol d T-01 -x "<cmd>"`). `e` is diagnostic only.
- Treat excess command output as a bug in AFOL command design.

**DON'T:**

- Run `afol d` without relevant validation or explicit `N/A` evidence.
- Claim a check passed unless it ran.
- Hide unresolved task state behind lifecycle closure.
- Reintroduce retired command surfaces in docs or examples.

---

## References

- `AGENTS.md`
- RULE-002 - Workstream Creation
- RULE-005 - Folder Structure
