---
doc_type: rule
id: RULE-004
theme: validation-linting
version: 2.0
created: 2026-02-23
updated_at: '2026-06-16T00:00:00Z'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Validation And Linting

**Purpose:** validate code, scaffold state, and documentation before completion.

---

## Completion Validation

Run the smallest checks that prove the touched surface. For cross-cutting
scaffold changes, use:

```bash
afol local-state rebuild --json
afol validate project --json
bun run typecheck
bun test
bun run validate:release
```

When a governed session is active, also run:

```bash
afol verify-tasks --strict
```

---

## Validation Commands

| Scope | Command |
| ------- | --------- |
| Project structure | `afol validate project --json` |
| Workbench tasks | `afol verify-tasks --strict` |
| Local state indexes | `afol local-state rebuild --json` |
| TypeScript | `bun run typecheck` |
| Tests | `bun test` |
| Release gate | `bun run validate:release` |
| Static JSON | `python -m json.tool .afol/adm/tools.json` |

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
- Record AFOL evidence before running `afol done` for governed tasks.
- Treat excess command output as a bug in AFOL command design.

**DON'T:**

- Run `afol done` without relevant validation or explicit `N/A` evidence.
- Claim a check passed unless it ran.
- Hide unresolved task state behind lifecycle closure.
- Reintroduce retired command surfaces in docs or examples.

---

## References

- `AGENTS.md`
- RULE-002 - Workstream Creation
- RULE-005 - Folder Structure
