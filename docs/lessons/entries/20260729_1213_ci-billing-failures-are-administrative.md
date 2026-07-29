---
doc_type: lesson_entry
id: lesson_20260729_1213_ci_billing_failures_are_administrative
status: active
created_at: '2026-07-29T12:13:12-05:00'
source: user_correction
related_workstream_id: 260727_2142_release-benchmark-reliability
---

# Lesson: CI Billing Failures Are Administrative

## Correction

GitHub Actions jobs can remain unavailable because the account has no runner
credit. A job that never starts for billing reasons is not evidence of a
product failure and must not block a local technical decision when the user
explicitly excludes remote CI from the acceptance criteria.

## Prevention Rule

- Classify a job that has zero executed steps and a billing annotation as
  administratively unavailable, not failed code.
- Run the equivalent repository release gate against the exact committed SHA
  in a clean checkout.
- Keep remote CI outside the acceptance decision only when the user explicitly
  authorizes that boundary.
- Report local validation and remote CI availability as separate facts.

## Guardrail

- Never describe administratively unavailable CI as green.
- Never replace missing CI evidence with partial local checks.
- A local substitute must include the complete project-defined release gate,
  security scanners, clean-source provenance, and the exact candidate SHA.
