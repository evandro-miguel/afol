---
doc_type: lesson_entry
id: lesson_20260717_1640_live_benchmarks_must_pin_cheap_models
status: active
created_at: '2026-07-17T16:40:00-03:00'
updated_at: '2026-07-17T16:40:00-03:00'
source: user_correction
related_session: 260717_1232_agent-orchestration-submission-review
tags: [benchmarks, live-agents, external-harness, receipts, cost]
---

# Lesson: Live Benchmarks Must Pin Cheap Models

## Boundary

AFOL does not select, invoke, retry, or supervise the model used by a live
benchmark. The external fixed harness owns provider/model choice, execution,
reasoning effort, and cost controls. Its fixed tool profile is provider-neutral
metadata, not a model selector.

## Lesson

To keep runs cost-comparable, the external harness must explicitly pin the
approved cheap model and reasoning effort for each run; it must not inherit the
principal or another frontier model. Provider, model, reasoning effort, and
budget metadata belong to the external runtime benchmark snapshot and its
`benchmark_profile` metadata; they are not fields in the F-31 receipt. That
receipt binds the supported run-identity, provenance, check/result, and
fixed-profile fields, including `harness_profile_id` and
`harness_profile_digest`. AFOL validates the F-31 receipt and separately
validates/projects the external benchmark snapshot; neither path runs a model.
A local benchmark command or dry-run is not evidence of live model execution.

## Prevention Rule

- Keep provider/model selection, execution, reasoning, and cost controls
  outside AFOL.
- Require external runtime benchmark snapshot/`benchmark_profile` evidence to
  record provider, model, reasoning effort, and relevant budget metadata.
- Require each F-31 receipt to use only supported fields and bind the fixed tool
  profile by ID and digest.
- Fail closed when routing is implicit, metadata is missing, the receipt or
  snapshot is malformed, or profile binding mismatches.

## Operational Practice

Do not add AFOL configuration that routes models or turns a local dry-run into
a live benchmark claim.
