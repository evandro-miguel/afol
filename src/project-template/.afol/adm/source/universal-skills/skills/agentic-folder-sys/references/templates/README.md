---
description: Index of AFOL workflow artifact templates and when agents should use them.
metadata:
  tags: "agentic-folder-sys, afol, templates, workflow, planning, governance"
---

# AFOL Template Index

Use this as the quick map from workflow decision to template. Do not materialize
optional artifacts unless the current work produced real content for them.

## Canonical Workflow Artifacts

| Workflow need | Template |
| --- | --- |
| Root/provider instructions for an exported scaffold | `docs/templates/AGENTS_TEMPLATE.md` |
| Roadmap feature or milestone inventory | `docs/templates/roadmap.md` |
| Parent feature spec | `docs/templates/spec.md` |
| Child/local feature spec | `docs/templates/spec-child.md` |
| Historical lightweight spec compatibility | `docs/templates/spec-lite.md` |
| Test strategy or test-governance artifact | `docs/templates/spec-test.md` |
| Direct execution plan | `docs/templates/plan.md` |
| Executable task board | `docs/templates/task.md` |
| Execution log | `docs/templates/log.md` |
| Delivery or finding report | `docs/templates/report.md` |
| Retrospective/post-delivery review | `docs/templates/retrospective.md` |
| Incident or closure analysis | `docs/templates/postmortem.md` |

## Optional Sidecars

| Need | Template |
| --- | --- |
| Brainstorm with alternatives | `docs/templates/brainstorm.md` |
| Research notes with sources/evidence | `docs/templates/research.md` |
| Explorer validation before execution | `docs/templates/explorer-check.md` |
| Reusable workflow or implementation pattern | `docs/templates/pattern.md` |
| Architecture decision record | `docs/templates/adr.md` |
| Architecture description | `docs/templates/architecture.md` |
| Current or target structure description | `docs/templates/structure.md` |
| Reusable content blocks | `docs/templates/blocks.md` |

Decision intake is a standard, not a template: use
`docs/standards/decision-intake.md`.

Current-state structure evidence belongs in `.afol/pstr/**`. Desired-state
governance belongs in `.afol/adm/**` unless the target project explicitly
documents a different migration state.
