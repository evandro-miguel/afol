---
doc_type: lesson_entry
id: 20260729_a00_submission_is_f31_not_evolution_child
status: superseded
superseded_by: ADR-007
created_at: '2026-07-29T00:00:00-03:00'
updated_at: '2026-07-31T00:00:00-03:00'
tags: [governance, roadmap, f-30, f-31, receipts, profiles, adr-007]
---

# F-31 Is Not an Evolution Child

## Historical context

Agent Submission was recorded as an F-30 Evolution child while Evolution
already owned F-30 and ADR-008. The prior allocation rationale correctly kept
Evolution on F-30 and avoided a destructive renumber, but the submission/
assignment implementation framing is now superseded.

## Current decision

- **F-30** remains AFOL Evolution System (ADR-008).
- **F-31** is External Receipts and Fixed Harness Tool Profiles (ADR-007).
- F-31 consumes bounded receipts from external harnesses; it does not add
  dispatch, submit, review, assignment, or model-orchestration states.
- AFOL never selects, calls, schedules, retries, or supervises models.

## Prevention

- Allocate roadmap feature ids on `dev` before parallel agents implement.
- Keep F-30/ADR-008 and F-31/ADR-007 separate in all governance indexes and
  workbench bindings.
- Treat this entry's former submission wording as historical; apply the
  external receipt/profile boundary from ADR-007 for new work.
