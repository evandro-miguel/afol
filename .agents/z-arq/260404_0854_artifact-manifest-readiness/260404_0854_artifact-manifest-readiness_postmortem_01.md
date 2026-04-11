---
doc_type: postmortem
id: 260404_0854_artifact-manifest-readiness_postmortem_01
theme: artifact-manifest-readiness
status: final
owners:
- orchestrator
created_at: '2026-04-04T08:54:11-03:00'
updated_at: '2026-04-04T09:07:39-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: 260306_artifact-resolution-layer_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0854_artifact-manifest-readiness_plan_01
  task: 260404_0854_artifact-manifest-readiness_task_01
  report: 260404_0854_artifact-manifest-readiness_report_01
---

# Postmortem: artifact-manifest-readiness

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## What Worked
- Pulling manifest logic into a shared helper kept the change reviewable and let `agents-new` and `agents-status` converge on one contract instead of evolving separately.
- Fixing lint at the path-normalization layer was the right move; the project config already expressed the desired policy, so the real bug was in comparison semantics.

## What Hurt
- The first `make all` run surfaced a packaging gap in the integration fixture because the new helper file had to be copied into isolated temp repos explicitly.
- `resolve_artifact("spec")` is intentionally ergonomic for operators, but that same convenience caused duplicate optional artifact reporting until the manifest state path switched to exact file resolution.

## Prevention
- When extracting shared helpers from command files, immediately scan isolated-repo and bootstrap-style tests for manual copy lists that need the new file.
- Keep resolver ergonomics separate from manifest accounting; alias fallbacks are good for CLI resolution, but readiness/reporting should inspect the exact artifact variant.

## Follow-ups
- If readiness needs to be stricter later, add per-dependency satisfaction rules to `workflow_manifest.py` instead of hardcoding them in `agents-status`.
- If raw map artifacts under `.agents/arc/map/extra/` still matter operationally, consider documenting them explicitly as non-canonical generated evidence so future lint scope debates stay settled.

---
*Template: `docs/templates/postmortem.md`*
