---
doc_type: rule
id: RULE-002
theme: workstream-creation
version: 1.1
created: 2026-02-23
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
updated_at: '2026-06-20T00:00:00Z'
---

# Workstream Creation

**Purpose:** create governed work only for execution, evidence, or durable
decisions.

## Artifact Economy

- No workbench session for quick answers, read-only checks, planning-only
  replies, or broad context gathering.
- No sidecar artifacts by habit. Add research, brainstorm, explorer-check,
  report, spec, spec-lite, or postmortem only when requested, required, or
  blocking.
- Discover before planning. Plans describe direct execution, not meta-planning.
- Governed implementation flow: session -> start task -> edit -> verify ->
  evidence -> done -> close.
- Use given roadmap feature, parent spec, or child spec directly.

## Artifact Contract

Plan/task/report must link primary artifacts, list optional sidecars, and give
`sidecar_justification`; use `not_required` when skipped.

## Commands

```bash
afol new <theme> --feature-id F-01 --parent-spec <spec-id>
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "<cmd>" --result passed
afol done --session <session-id> --task-id T-01
afol close --session <session-id>
```

Use `afol quick-task "<description>"` only inside an active approved feature.
Names: session `YYMMDD_HHMM_<theme>`, feature `F-NN`, task `T-NN`,
`packs/<pack-slug>/`. Task state uses `State Board` rows and AFOL commands,
not checklist markers.

## Workflow

- Ambiguous/product-shaped/benchmark-heavy work runs the smallest useful
  decision-intake lane before benchmark/planning.
- Feature changes update affected local skills/docs and record needed
  universal-skills propagation follow-up.
- Optional artifacts that exist must be finalized before closure.
- No task closes without task-scoped evidence.

## Validation

Before completion, run the narrowest meaningful check, record evidence, and
verify tasks strictly when closing governed sessions.

## References

- RULE-003 - Documentation Standards
- RULE-004 - Validation and Linting
- RULE-006 - Applicable Rule Resolution
