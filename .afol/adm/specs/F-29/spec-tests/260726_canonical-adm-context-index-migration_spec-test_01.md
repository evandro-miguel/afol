---
doc_type: spec-test
id: 260726_canonical-adm-context-index-migration_spec-test_01
theme: canonical-adm-context-index-migration
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define focused regression proof for canonical context indexing.
created_at: '2026-07-26T15:58:54.000Z'
updated_at: '2026-07-26T15:58:54.000Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260726_canonical-adm-context-index-migration_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260726_canonical-adm-context-index-migration_spec-child_01.md
risk_level: high
---

# SPEC TEST: Canonical Administration Context Index Migration

## Intent

- Journey or behavior under test: canonical administration context discovery,
  coverage/freshness health, and selectable-section token health
- Why this test strategy is needed now: the current implementation can return
  an empty index and a false-green health result because it reads a retired path
- Related feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Journey

- Primary user or operator: AFOL operator or agent requesting governed context
- Entry point: section-index builder and scoped health checks
- Exit condition: canonical context is indexed deterministically or health
  fails before hydrate/heavy validation

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. Run the focused tests:

     ```bash
     bun test cli/tests/canonical-context-index.test.ts \
       cli/tests/context-system.test.ts cli/tests/health-system.test.ts
     ```

  2. `bun run typecheck`
- Inputs and fixtures:
  - Canonical `.afol/config.json` with configured `.afol/adm`
  - Nested specs/decisions, duplicate features/headings, administrative docs
  - Missing, empty, foreign, partial, and stale stored indexes
  - Persisted v1, manifest-less v2, and malformed v2 indexes
  - V2 source manifests with source/section counts and SHA-256 content hashes
  - V2 ordered-section payload digests that are missing, wrong, or invalidated
    by a forged ref/title/level/line/source row with counts left unchanged
  - Missing, v1, and invalid cache reads through bundle and section entry points
  - Indexable canonical document with no `##`/`###` headings
  - Configured non-default `paths.adm_dir`
  - Large catalog whose highest-cost selectable three entries stay bounded
  - Empty/invalid section and manifest source fields and invalid line/level
    bounds
  - LF, CRLF, absent, and malformed YAML frontmatter
  - Non-ASCII document identifiers, paths, and punctuation/Unicode headings
  - Two distinct Linux filenames that are NFC/NFD equivalents, traversal paths,
    and persisted case-variant duplicate refs
  - Deterministic replacement of a canonical source after cache inspection
  - A huge Unicode/punctuation title that crosses the unchanged failure limit

## Recommended Technology

- Primary test layer: integration
- Recommended tools: `bun:test`
- Notes on why this technology is preferred:
  - Existing context and health fixtures exercise real filesystem contracts
    without hydrating state or invoking heavyweight release gates.

## Test Construction Strategy

- Test structure:
  - Setup: create isolated canonical project roots under the test temp folder
  - Exercise: build/rebuild the index and call scoped health checkers
  - Assert: canonical paths, unique refs, coverage/freshness failures, and
    three-entry token budget
  - Teardown: remove only the isolated fixture
- Coverage focus:
  - Happy path: recursive canonical specs and decisions build a stable index
  - Main failure path: canonical docs plus empty/partial/foreign index fail
  - Boundary conditions: no indexable docs permits zero sections; an indexable
    no-heading document does not
  - Cache path: valid v2 read validates hashes and the section-payload digest
    without calling the full builder
  - Trust boundary: missing/v1/invalid cache readers raise typed reasons naming
    `afol ctx build`, with the full-builder seam remaining at zero invocations
  - Tamper boundary: changing a persisted section title and line range while
    preserving source manifest hashes/counts yields a corrupt digest mismatch
  - Shape boundary: blank identifiers/paths, invalid levels, fractional or
    non-positive lines, and inverted line ranges are corrupt
  - Metadata boundary: CRLF parses, absent metadata remains non-indexable, and
    malformed canonical YAML blocks build and cache trust
  - TOCTOU boundary: deep expansion returns the verified snippet even when a
    test seam replaces the file immediately after inspection
  - Determinism boundary: normalized POSIX ordering and hash fallbacks keep
    non-ASCII refs stable across builds
  - Filesystem identity boundary: raw NFC/NFD source paths remain distinct,
    deterministically ordered, traversal-safe, and current immediately after
    build
  - Resolver boundary: persisted refs that collide after lowercase lookup
    normalization are corrupt
  - Health orchestration: context and token checks share one inspection

## Expected Result

- Functional result: no active read from `docs/arc/**`; canonical index coverage
  is complete, v1 and forged payloads are rejected, and health is fail-closed
  with distinct reasons
- Token result: complete selectable metadata, including Unicode titles, is
  measured against the existing 2000/4000 thresholds
- Non-functional expectation: focused tests only; no hydrate, benchmark,
  release, deploy, or host cleanup
- Failure messaging expectation: name the missing/stale/incomplete canonical
  index and suggest rebuilding it

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: yes, through AFOL command evidence ids
- Pass/fail rule:
  - RED must fail for the retired-path/empty-index, hidden reader fallback, and
    unbound section-payload reasons before their production edits; GREEN plus
    typecheck, narrow Biome, and diff check must pass
- Report link target:
  - Governed F-29 workbench report created by the AFOL lifecycle

## Risks and Follow-ups

- Open risk: ref compatibility across callers -> Follow-up: preserve
  feature-prefixed lookup and assert uniqueness in focused tests
- Deferred case: hydrate and full release proof -> Owner: release lane after
  the degraded host is stable

## Acceptance

- [x] Journey is explicit
- [x] Click and command path is explicit
- [x] Recommended technology is justified
- [x] Construction strategy is explicit
- [x] Expected result is explicit
- [x] Evidence plan is explicit
