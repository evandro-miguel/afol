---
doc_type: lesson_entry
id: lesson_20260806_paid_ci_unavailable_requires_local_sha_evidence
status: active
created_at: '2026-08-06T18:44:31Z'
source: user_correction
related_workstream_id: 260806_1338_release-promotion-followup
---

# Lesson: Paid CI Unavailable Means Local SHA-Bound Evidence Gates Readiness

## Correction

Paid CI is unavailable, so production readiness must not claim CI as a
required gate. Readiness evidence comes from strong local AFOL validation bound
to the exact candidate SHA; documentation must not state that CI is required or
that missing CI blocks readiness.

## Prevention Rule

- Bind every readiness claim to the candidate SHA and the complete local
  release gate run against that SHA.
- Report CI availability and local validation as separate facts; never describe
  unavailable CI as green or as a substitute for local evidence.
- Do not weaken local release gates to compensate for the absence of paid CI.

## Guardrail

- Readiness documentation must use SHA-bound AFOL evidence and provenance
  without asserting CI is required.
- If CI cannot run, state that administrative fact separately and keep it out
  of the readiness acceptance criteria.
