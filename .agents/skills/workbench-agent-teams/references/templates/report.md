---
description: Standard template for workbench execution reports.
metadata:
  tags: "template, report, results, verification"
---

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

## Plan Audit Results

- Audit verdict: [APPROVED / APPROVED_WITH_FIXES / REJECTED / CANNOT_VERIFY]
- Quality score: [0-10]
- Confidence: [High / Medium / Low]
- Gaps addressed: <list of gaps found and how they were resolved>

## Risks / Follow-ups

- <open item>
```
