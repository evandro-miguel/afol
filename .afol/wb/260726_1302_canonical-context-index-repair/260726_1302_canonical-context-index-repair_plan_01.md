---
doc_type: "workbench_plan"
id: "260726_1302_canonical-context-index-repair_plan_01"
session_id: "260726_1302_canonical-context-index-repair"
theme: "canonical-context-index-repair"
status: "active"
created_at: "2026-07-26T16:02:04.713Z"
updated_at: "2026-07-26T16:02:04.713Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
child_spec: "260726_canonical-adm-context-index-migration_spec-child_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: canonical-context-index-repair

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-29
- parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
- task: Migrate section indexing to canonical administration paths and fail closed on coverage drift

## Execution Plan

- T-01: Migrate section indexing to canonical administration paths and fail
  closed on coverage drift.
- Establish focused REDs before each production repair.
- Persist a v2 section index with a mandatory canonical source manifest.
- Keep cache reads effective by validating source hashes without rebuilding
  section entries.
- Keep edits scoped to context index, health, focused tests, and F-29
  governance.

## Progress

- [x] Reopened F-29 through a bounded child and matching spec-test.
- [x] Recorded the original canonical-path/empty-index RED before production.
- [x] Recorded review REDs for v2 manifest, no-heading documents, cache reads,
      configured administration paths, and distinct health reasons.
- [x] Implemented v2 source/count/hash manifest and focused health behavior.
- [x] Passed focused tests, typecheck, and narrow Biome.
- [ ] Complete two-stage review and address any remaining findings.
- [ ] Mark T-01 done and close only after review authorization.

## Surprises and Discoveries

- The canonical corpus is large enough that summing every section creates a
  false token failure; bundles select at most three sections.
- Timestamp freshness alone cannot prove canonical coverage or unchanged
  content.
- An indexable document without `##`/`###` headings is not equivalent to an
  empty project and must block a green cache.

## Decision Log

- Decision: use `sections_index_v2` with SHA-256 content hashes, source and
  section counts, and deterministic per-source coverage.
  Rationale: v1 cannot prove canonical source coverage or support an effective
  cache read without rebuilding the full section catalog.
- Decision: return distinct cache inspection reasons to health.
  Rationale: operators need different remediation for missing, stale,
  incomplete, foreign, and corrupt derived state.

## Remaining Risks

- Review must confirm v2 compatibility and the intentional rejection of
  persisted v1.
- No benchmark or full release suite is authorized on the degraded host.

## Validation

- `bun test cli/tests/canonical-context-index.test.ts
  cli/tests/context-system.test.ts cli/tests/health-system.test.ts`
- `bun run typecheck`
- Narrow Biome over changed TypeScript files.
- `git diff --check`
- `afol ctx build`, then scoped `ctx` and `token_budget` health.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
