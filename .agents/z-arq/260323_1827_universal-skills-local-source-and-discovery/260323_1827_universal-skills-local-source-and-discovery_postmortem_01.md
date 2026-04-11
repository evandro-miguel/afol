---
doc_type: postmortem
id: 260323_1827_universal-skills-local-source-and-discovery_postmortem_01
theme: universal-skills-local-source-and-discovery
status: final
owners:
- orchestrator
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
  task: 260323_1827_universal-skills-local-source-and-discovery_task_01
  report: 260323_1827_universal-skills-local-source-and-discovery_report_01
---

# Postmortem: universal-skills-local-source-and-discovery

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Move the scaffold to a sibling local universal-skills checkout, add operator discovery/on-demand install commands, and remove overlapping global Codex skill payload.

## What Was Achieved
- The scaffold now prefers a sibling `../universal-skills` checkout as the source repo, supports project-local skill discovery and on-demand ensure flows, prepares that sibling checkout automatically during bootstrap for `apps/` targets, and no longer keeps overlapping universal-skills payload in the active global Codex path or an extra cleanup archive.

## What Did Not Land
- No richer relevance ranking or metadata-aware search landed; `search` is currently a substring match over skill names and `SKILL.md` content.

## Problems Encountered
- `make lint-scripts` initially failed on an unrelated pre-existing unused import in `.agents/scripts/agents-repo-map.py`.
- The first cleanup pass was more conservative than the user wanted and kept a temporary archive of removable overlapping assets.

## Root Causes
- The repo was not fully clean before starting this slice, even though the new `skills-sync` work itself was valid.
- I biased toward reversibility instead of following the explicit operational policy the user later clarified.

## Useful Discoveries
- The first `F-10` slice already solved manifest/runtime/profile semantics; this round focuses on source ergonomics and discovery UX.
- A sibling checkout model works cleanly with the existing adapter architecture; the main missing piece was command surface, not lockfile semantics.
- Overlapping global universal-skills copies are disposable because the source of truth is now the sibling checkout.
- Preparing the sibling checkout during bootstrap is better than relying on post-check side effects, especially for `--skip-checks` and adoption flows.

## Follow-ups for Next Rounds
- If agents need better discovery quality later, extend `skills-sync search` to use structured metadata from upstream instead of raw substring scanning.
- Consider a `skills-sync doctor` or `skills-sync selected --runtime <x>` alias if operators ask for more status ergonomics.
- Apply the explicit deletion-vs-archive rule early when cleaning reproducible mirrored assets.
- If a workspace layout other than `apps/` becomes first-class, add a bounded source-checkout heuristic for that layout rather than weakening the current convention.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
