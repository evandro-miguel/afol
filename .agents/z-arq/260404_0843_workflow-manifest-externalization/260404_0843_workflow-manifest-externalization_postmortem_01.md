---
doc_type: postmortem
id: 260404_0843_workflow-manifest-externalization_postmortem_01
theme: workflow-manifest-externalization
status: final
owners:
- orchestrator
created_at: '2026-04-04T08:43:39-03:00'
updated_at: '2026-04-04T08:51:21-03:00'
roadmap_feature: F-11
parent_spec: 260323_1752_workflow-and-bootstrap-integration_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0843_workflow-manifest-externalization_plan_01
  task: 260404_0843_workflow-manifest-externalization_task_01
  report: 260404_0843_workflow-manifest-externalization_report_01
---

# Postmortem: workflow-manifest-externalization

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## What Worked
- Using a governed workbench session with one spark worker for code and one mini worker for docs kept the write surfaces clean and made the integration pass straightforward.
- The scaffold already had enough config-loading infrastructure in `lib/agents_config.py`; the hardcoded part was concentrated in `agents-new.py`, so the extraction stayed low blast radius.

## What Hurt
- The config shape needed to be expressed both in project config and in loader defaults to preserve fallback behavior, which creates a short-term duplication cost.
- Repo lint is still noisy because `.agents/tmp/OpenSpec` carries many Markdown files outside the scaffold's frontmatter conventions, so lint output is less focused than it should be during comparative research.

## Prevention
- Treat new workflow mechanics as data contracts first: update project config, loader fallback, command implementation, tests, and docs in the same slice.
- Keep comparative research clones under `.agents/tmp/`, but expect them to pollute broad lint runs unless exclusions or targeted commands are used deliberately.

## Follow-ups
- Add manifest-level dependency semantics so artifact readiness can be derived instead of implied by creation order.
- Decide whether the artifact manifest should eventually move into a dedicated schema-validated file or stay embedded in `.agents/agents.config`.

---
*Template: `docs/templates/postmortem.md`*
