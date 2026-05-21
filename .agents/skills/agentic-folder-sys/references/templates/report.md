---
description: Standard template for workbench execution reports.
metadata:
  tags: "template, report, results, verification"
---

# Report Template

## Output Artifacts (file-first)

- Primary artifact: `report`
- Sidecars:
  - brainstorm, research, explorer-check, postmortem
- Sidecar justification:
  - required|not_required per optional artifact

```markdown
---
doc_type: report
id: "YYMMDD_HHMM_<theme>_report_01"
theme: "<theme_of_PRD>"
status: final
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Report: <theme_of_PRD>

## Summary

- <high-level outcome>

## Delivered Changes

- <change 1>
- <change 2>

## Verification

- Unit tests: `<command>` -> <pass/fail + evidence>
- E2E tests: `<command>` -> <pass/fail + evidence>
- Additional checks: <check + result>

## Session Review Results

- `verify-tasks`: `<command or N/A>` -> <pass/fail + evidence>
- Session review: `<command or N/A>` -> <pass/fail + evidence>
- Confidence: [High / Medium / Low]
- Gaps addressed: <list of gaps found and how they were resolved>

## Memory Promotion

- Decision: <none / docs / /nota / governed-memory>
- Source artifacts: <report/postmortem ids or paths>
- Reason: <why this should or should not become durable memory>

## Risks / Follow-ups

- <open item>
```
