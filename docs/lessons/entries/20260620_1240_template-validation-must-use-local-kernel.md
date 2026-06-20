---
doc_type: lesson_entry
id: lesson_20260620_1240_template-validation-must-use-local-kernel
status: active
created_at: '2026-06-20T12:40:40-03:00'
updated_at: '2026-06-20T12:40:40-03:00'
source: user_correction
related_session: 260620_1137_review-template-drift
---

# Lesson: Template Validation Must Use The Local Kernel

## Correction

The user supplied review findings showing that a previous validation pass used
the installed `afol` surface while the current local kernel still failed
`template_forbidden`.

## What Went Wrong

- Tests filtered out `docs/arc/**` in the live template, but production
  validation did not have that exception.
- The generated scaffold payload excluded forbidden files, hiding that the
  source template still contained marker files rejected by `validate project`.
- The template tools catalog drifted from the active `.afol/adm/tools.json`,
  so fresh downstream scaffolds would receive stale command metadata.

## Prevention Rule

When changing template policy or scaffold payloads, validate the live source
template with the local kernel command:

```bash
bun run kernel -- validate project --json
```

Do not add test-only exceptions that production validators do not share.
Synchronize scaffold governance payloads such as
`src/project-template/.afol/adm/tools.json` with their active root source, and
add focused regression coverage for that parity.

## Guardrail

After any template regeneration, run `afol local-state rebuild --json` before
the final local-kernel validation so file index snapshots reflect the latest
generated payload and source deletions.
