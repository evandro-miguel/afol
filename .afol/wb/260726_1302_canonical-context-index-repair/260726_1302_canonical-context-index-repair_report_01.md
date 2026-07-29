---
doc_type: report
id: 260726_1302_canonical-context-index-repair_report_01
theme: canonical-context-index-repair
status: final
owners:
- worker
workstream_intent: remediation
artifact_purpose: Record current implementation and review evidence for the F-29 context repair.
created_at: '2026-07-26T16:31:58.000Z'
updated_at: '2026-07-26T16:31:58.000Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260726_canonical-adm-context-index-migration_spec-child_01
related_tasks:
- T-01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260726_1302_canonical-context-index-repair_plan_01
  task: 260726_1302_canonical-context-index-repair_task_01
---

# Report: Canonical Context Index Repair

## Governance Context

- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`
- Child spec: `260726_canonical-adm-context-index-migration_spec-child_01`

## Summary

- Current implementation migrates active section indexing to configured
  canonical administration sources and persists a bound v2 source/payload
  manifest.
- Bundle and section readers fail closed with a typed reason and require an
  explicit `afol ctx build`; no hidden in-memory rebuild remains.
- Health now fails closed with distinct cache reasons and token health measures
  the worst selectable three-section metadata window.
- Independent spec and quality reviews approved the final implementation.

## Delivered Changes

- Recursive canonical specs/decisions discovery with stable unique refs.
- Mandatory v2 manifest with source/section counts, SHA-256 content hashes, and
  a deterministic digest binding every ordered section row.
- Cache inspection that validates each source once without rebuilding sections.
- Strict persisted row/source validation plus LF/CRLF metadata parsing that
  distinguishes absent from malformed canonical frontmatter.
- Deep expansion consumes the exact source bytes retained by the successful
  hash-validation pass, eliminating the selected-source reopen window.
- Corrupt-cache detection for missing/wrong digests and forged refs, titles,
  levels, line ranges, source paths, or section ordering.
- Locale-independent POSIX ordering and deterministic hash fallbacks for
  non-ASCII document and heading identities.
- Raw POSIX path persistence with NFC-primary/raw-code-point ordering preserves
  distinct Linux NFC/NFD filenames and rejects traversal paths.
- Section-ref uniqueness uses the resolver's lowercase lookup identity, so
  case-variant duplicates fail before resolution.
- Token health includes complete selectable metadata and Unicode byte cost;
  full health shares one inspection across context and token checks.
- Explicit missing, stale, incomplete, foreign, and corrupt health reasons.
- Configured `paths.adm_dir` health and adversarial focused coverage.

## Verification

- Focused tests: 146 passed, 0 failed, 680 assertions.
  Evidence: `E-20260726142556443-b25ccb`.
- Typecheck: passed. Evidence: `E-20260726142604112-fb00c0`.
- Narrow Biome: passed. Evidence: `E-20260726142611016-f12b86`.
- Explicit repository index build: 924 sections.
  Evidence: `E-20260726141959116-348515`.
- Real repository index: v2, 94 sources, 924 sections, valid payload digest.
  Evidence: `E-20260726134920117-34ddb6`.
- Context health: passed. Evidence: `E-20260726142008538-185c0e`.
- Token-budget health: passed. Evidence: `E-20260726142016355-20fd14`.
- Diff check: passed. Evidence: `E-20260726142634311-dbc966`.
- Local-state rebuild: passed. Evidence: `E-20260726142618218-4a03c7`.
- Project drift validation: passed. Evidence:
  `E-20260726142624828-1bfbd7`.
- Security tools: `gitleaks` and `osv-scanner` were not installed locally;
  no download or substitute scan was attempted.
- `E-20260726133341633-0958ad` is superseded because its recorded command was
  abbreviated; the exact-command replacement is listed above.

## Risks and Follow-ups

- Persisted v1 is intentionally rejected and requires explicit `afol ctx build`.
- Full suite, hydrate, benchmark, release, deploy, and host remediation were not
  run under the degraded-host constraint.
- GitNexus was unavailable, so source-confirmed manual impact analysis was used.

## Lessons

- See
  `docs/lessons/entries/20260726_1258_diagnose_fail_closed_before_heavy_repair.md`.
