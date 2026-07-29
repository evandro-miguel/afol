---
doc_type: spec-child
id: 260726_canonical-adm-context-index-migration_spec-child_01
theme: canonical-adm-context-index-migration
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Restore AFOL-only canonical context indexing and fail-closed health.
created_at: '2026-07-26T15:58:54.000Z'
updated_at: '2026-07-26T15:58:54.000Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260726_canonical-adm-context-index-migration_spec-test_01.md
risk_level: high
---

# SPEC CHILD: Canonical Administration Context Index Migration

## Intent

- Outcome: AFOL context indexing and health use the configured canonical
  administration tree and fail closed when an index does not cover it.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

AFOL moved governance authority from archived `docs/arc/**` paths to
`.afol/adm/**`, but the section index and its freshness check still inspect
the retired path. That mismatch can produce an empty index that health reports
as current and can make a later hydrate or context request operate without
governing context.

This child is a bounded repair because it changes the trust boundary shared by
context bundles, section resolution, and health. It does not reopen release
packaging or create another governance store.

## User or Operator Journey

1. The operator keeps specs and decisions under the configured
   `paths.adm_dir`.
2. `afol ctx build` recursively indexes indexable Markdown from canonical
   `specs/**` and `decisions/**` with deterministic, unique section refs.
3. Context health fails when canonical sources exist but the stored index is
   empty, stale, incomplete, or points outside the canonical source roots.
4. Token health evaluates the worst selectable three-section metadata envelope,
   matching the bundle selection limit rather than summing the entire catalog.

## Required Behavior

- Resolve the administration root through
  `resolveProjectPaths(root).abs.admDir`; do not fall back to `docs/arc/**`.
- Recursively collect canonical specs and decisions in stable path order.
- Preserve the raw project-relative POSIX path identity in persisted source
  paths, reject traversal/absolute forms, and use a locale-independent
  NFC-primary/raw-code-point-tiebreak comparator. Distinct Linux NFC/NFD names
  must remain distinct and immediately inspect as current after build.
- When an identifier or heading has no ASCII slug, derive stable path-identity
  and title-hash fallbacks rather than empty or line-number-only refs.
- Ignore administrative index/readme documents and non-spec/non-decision
  `doc_type` values when they are not user-selectable context.
- Parse LF and CRLF frontmatter, distinguish absent metadata from malformed
  YAML, and fail closed when a Markdown file under canonical specs/decisions
  starts malformed frontmatter.
- Generate stable, unique refs even when several specs share one roadmap
  feature or several headings have the same title.
- Generated refs are canonical lowercase, and persisted uniqueness is checked
  with the same lowercase normalization used by resolver lookup. Case-variant
  duplicates are corrupt rather than resolution-order dependent.
- Persist only `sections_index_v2`, with a mandatory SHA-256 source manifest
  containing canonical source count, total section count, a deterministic
  digest of the ordered canonical section rows, and per-source path, content
  hash, and section count. The payload digest binds refs, titles, levels, line
  ranges, source paths, and ordering to the trusted envelope.
- Missing, malformed, or mismatched payload digests are corrupt. Mutating a
  persisted section row while preserving source hashes and counts must not be
  accepted as current.
- Persisted section rows require non-empty refs, titles, and source paths;
  heading levels are limited to 2/3; line bounds are positive finite integers
  with `line_end >= line_start`. Manifest source paths are non-empty.
- Persisted v1, missing indexes, and invalid v2 are unsupported read states and
  require an explicit `afol ctx build`. Bundle and section readers must raise a
  typed trust error with the inspection reason and recovery command; they must
  never build a hidden in-memory snapshot or silently convert the cache.
- Treat zero sections as valid only when there are no indexable canonical
  documents. An indexable document with no `##`/`###` sections blocks the build
  and makes any persisted empty coverage incomplete.
- Health must compare stored coverage and freshness with canonical indexable
  sources and fail closed with distinct missing, stale, incomplete, foreign, or
  corrupt reasons.
- Cache reads must validate the v2 manifest and current content hashes without
  rebuilding or parsing the section catalog. Each canonical source is read at
  most once per cache inspection.
- A trusted inspection retains the exact verified source content. Deep/tokenmax
  snippet expansion must use those bytes and must not reopen a selected source
  after hash validation.
- Token health must measure the highest-cost selectable set of at most three
  complete section-metadata entries, including titles and Unicode byte cost,
  without weakening the existing warning/failure thresholds.
- One full health call shares a single canonical cache inspection across its
  context and token-budget checks.

## Boundaries

In scope:

- `cli/services/context/section-index.ts`
- `cli/services/context/bundler.ts` feature-exact selection
- `cli/services/health/checker.ts`
- Focused context and health tests
- Canonical F-29 governance and one user-correction lesson

Out of scope:

- Hydration, full-suite/release/benchmark execution, template export, global
  installation, deployment, or host remediation
- Recreating or reading `docs/arc/SPECS` or `docs/arc/DECISIONS` as active
  context authority
- Broad refactoring, new context commands, and threshold relaxation

## Risks and Mitigations

- Existing ref consumers may depend on feature-prefixed refs -> preserve
  feature discoverability while adding deterministic document identity.
- Feature prefix overlap may select the wrong spec -> require the canonical
  feature/document delimiter and cover `F-2` versus `F-20`.
- A partial index may appear fresh by timestamp -> validate canonical source
  coverage and the bound section payload, not timestamp alone.
- A source may change after validation but before snippet expansion -> retain
  and consume the exact bytes from the successful inspection.
- A reader fallback may hide a missing or corrupt cache -> expose typed trust
  failure and require the explicit write command.
- A large catalog may falsely fail token health -> compute the worst selectable
  three-section envelope, matching bundle behavior.
- A degraded host may amplify failures -> run only focused tests and fail
  before hydrate or heavy gates.

## Acceptance

- [x] A focused RED proves the old implementation ignores canonical
      `.afol/adm/**` sources and permits false-green empty coverage.
- [x] Canonical specs and decisions are recursively indexed in stable order
      with unique refs and no archive fallback.
- [x] Persisted indexes use v2 with mandatory source/count/content-hash
      manifest plus an ordered section-payload digest; v1, manifest-less v2,
      missing/wrong digests, and forged section rows are rejected.
- [x] Bundle and section readers never auto-build on missing, v1, or invalid
      cache; they return a typed trust reason requiring `afol ctx build`.
- [x] Empty, stale, foreign, and incomplete stored indexes fail context health
      whenever indexable canonical documents exist.
- [x] Missing, stale, incomplete, foreign, and corrupt health reasons remain
      distinct and actionable.
- [x] Empty indexes remain valid for projects with no indexable canonical
      documents.
- [x] A cache-read seam proves no full section rebuild occurs while hashes and
      manifest coverage are validated.
- [x] Adversarial shapes, empty paths, CRLF, malformed YAML, non-ASCII refs,
      Unicode title budgets, and source replacement after validation are
      covered and fail closed where required.
- [x] Distinct NFC/NFD Linux filenames retain exact raw path identity, use
      deterministic ordering, and remain current on immediate inspection;
      traversal paths and case-normalized duplicate refs are rejected.
- [x] A full health call inspects canonical sources once for both context and
      token-budget findings.
- [x] Token health uses the worst selectable three entries.
- [x] Focused context/health tests, typecheck, narrow Biome, and
      `git diff --check` pass without hydrate or heavy gates.
