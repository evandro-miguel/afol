---
doc_type: lesson_entry
id: lesson_20260224_1555_plan-success-criteria-crosscheck
status: active
created_at: '2026-02-24T15:52:00-03:00'
updated_at: '2026-02-24T15:52:09-03:00'
source: execution_review
related_session: 260224_1253_execution-integrity-hardening
---

# Lesson: Do Not Close Session Without Success-Criteria Crosscheck

## Correction

The session was reported as complete while one success criterion from the plan remained unimplemented:

- `wb-update evidence` command and `mark-done` evidence-gating in `agents-wb-update.py`

Task checkboxes and report summary were green, but plan-level delivery was incomplete.

## Prevention Rule

Before declaring completion, validate all three layers:

1. Plan success criteria -> implemented in code
2. Task checklist state -> consistent with code and tests
3. Verification evidence -> command output linked to task closure

## Guardrail

### Mandatory closure gate

Run all items before final completion:

```bash
./.agents/agents verify-tasks .agents/wb/<session> --strict
python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v
```

And explicitly confirm in report:

- each success criterion mapped to file-level implementation
- remaining gaps = 0

## Operational Standard

For `wb-update task --mark-done`:

- Evidence ID from task-scoped closure evidence is required.
- Unsafe bypass is not supported.
