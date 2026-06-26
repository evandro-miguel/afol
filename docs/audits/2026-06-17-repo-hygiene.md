---
doc_type: audit
id: repo_hygiene_2026_06_17
status: active
created_at: '2026-06-17T00:00:00Z'
updated_at: '2026-06-17T00:00:00Z'
---

# Repository Hygiene Audit

## Scope

This audit covers the AFOL factory repository in `dev` after the
documentation-front-door refresh. It is intentionally conservative: measure
first, keep traceability, and avoid deleting material without multiple signals.

## Repo Map

- `afol`: CLI wrapper that enters the TypeScript implementation.
- `cli/**`: current AFOL implementation and command registry.
- `src/project-template/**`: exportable downstream scaffold payload.
- `.afol/adm/**`: doctrine, roadmap, specs, decisions, benchmarks, routing,
  schema, migrations, and other desired-state administration.
- `.afol/pstr/**`: generated current project-structure maps only.
- `.afol/wb/**`: governed execution sessions.
- `.agents/**`: static scaffold metadata and provider skills only:
  `.agents/config.json`, `.agents/lock.json`, `.agents/manifest.json`, and
  `.agents/skills/**`. It is not the mutable runtime surface.
- `docs/**`: operator-facing standards, patterns, templates, lessons,
  telemetry notes, and audits.

## Findings

### F1: Release Runbook Overstated The Script Gate

`RELEASE-RUNBOOK.md` said `bun run validate:release` proved TypeScript
typechecking. The script currently does not call `bun run typecheck`.

Disposition: corrected the runbook so release preflight explicitly includes
`afol local-state rebuild --json`, `afol validate project --json`, and
`bun run typecheck` before `bun run validate:release`.

### F2: No Strong Dead-Material Candidate

Archive-like paths exist under `.afol/adm/archive/**` and
`.afol/data/migrations/legacy-system-retirement-260609/**`, but they are
retained migration and governance evidence. Generated and build outputs are
covered by `.gitignore` and template policy checks.

Disposition: no deletion performed.

### F3: Template Documentation Migration Is Closed

The root docs now describe `.afol/adm/**` and `.afol/pstr/**` as the live
authority surfaces. The downstream template no longer carries `docs/arc/**` or
`docs/map/**` payload paths; those names appear only as historical, retired, or
forbidden-surface references in governance docs and tests.

Disposition: no template payload cleanup remains for this finding. Keep future
checks focused on active scaffold payload paths, not frozen migration history.

### F4: Docs-Only Hygiene Has No Dedicated Gate

Existing AFOL checks catch structural and local-state drift, but there is no
dedicated docs lane for Markdown links, docs index coverage, or stale-reference
scans.

Disposition: use `afol validate drift --json`, `afol validate project --json`,
and `git diff --check` for this docs-only pass. Treat a dedicated docs hygiene
gate as future automation work.

## Change Plan

- Keep existing documentation-front-door edits.
- Add this audit note under `docs/audits/`.
- Add `docs/audits/` to the documentation index.
- Correct the release runbook preflight language.
- Do not remove archives, migrations, or template payload material in this pass.

## Validation Log

- Passed: `afol local-state rebuild --json`
- Initial warning: `afol validate drift --json` reported stale `.afol/pstr/**`
  maps and recommended `afol pstr rebuild`.
- Passed: `afol pstr rebuild --json`
- Passed: `afol local-state rebuild --json`
- Passed: `afol validate drift --json`
- Passed: `afol validate project --json`
- Passed: `git diff --check`

## Commit Message Draft

```text
docs(repo): add AFOL hygiene audit

- document repository map and hygiene findings
- clarify release preflight versus validate:release coverage
- index docs/audits as the audit surface

Validation:
- afol local-state rebuild --json
- afol pstr rebuild --json
- afol validate drift --json
- afol validate project --json
- git diff --check
```
