---
description: Standard template for workbench research documents.
metadata:
  tags: "template, research, findings, references"
---

# Research Template

## Output Artifact Contract

- Sidecars: optional for this workflow.
- If produced, include explicit `sidecar_justification` as `required`.
- If not produced, set `sidecar_justification` to `not_required`.
- Produced sidecars must include a `Sidecar Justification` section with blocking
  question, decision produced, execution task affected, and stop condition.

```markdown
---
doc_type: research
id: "YYMMDD_HHMM_<theme>_research_01"
theme: "<theme_of_PRD>"
status: draft
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Research: <theme_of_PRD>

## Questions

- <question 1>
- <question 2>

## Findings

- <finding 1>
- <finding 2>

## Sources

- <path/url/reference>

## Decision Impact

- <how findings affect implementation>
```
