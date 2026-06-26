---
doc_type: spec
id: 260612_temporal-health-freshness-token-budget_spec-child_01
theme: temporal-health-freshness-token-budget
status: final
owners:
- orchestrator
created_at: '2026-06-12T16:47:37-03:00'
updated_at: '2026-06-16T00:00:00-03:00'
roadmap_feature: F-18
roadmap_slice: F-18.S8
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related: .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
scope:
  repo_areas:
  - .afol/adm
  - .afol/pstr
  - .afol/wb
  - .afol/memory
  - .afol/library
  - .afol/state
  - .afol/data
  - cli/commands
  - cli/services
  packages:
  - agentic-cli
risk_level: high
---

# SPEC CHILD: temporal-health-freshness-token-budget

## 1) Feature Intent

- Outcome: AFOL treats artifact age, freshness, health, cleanup, archive, branch
  context, and context-token budgets as first-class execution constraints.
- Why now: `.afol/adm`, `.afol/pstr`, workbench, memory, library, SQLite, and
  indexes define where state lives, but long-running projects also need rules
  for when state becomes stale or too large to trust.
- Roadmap feature: `F-18`
- Roadmap slice: `F-18.S8`
- Role of this spec: child contract for time-aware execution and maintenance.

## 2) Policy

Every durable artifact that can guide an agent should carry:

```yaml
created_at: 2026-06-12T00:00:00Z
updated_at: 2026-06-12T00:00:00Z
reviewed_at: 2026-06-12T00:00:00Z
stale_after: 2026-07-12T00:00:00Z
status: current
authority: observed
source_hash: "<hash>"
git:
  branch: dev
  commit: abc123
```

Required semantics:

- `adm` is canonical project direction.
- `pstr` is observed current structure and depends on source hashes.
- `wb` is execution state and must record last touch and closure.
- `memory` is compact continuity and must not override adm.
- `library` is curated external knowledge with source freshness.
- `state` and indexes are derived and stale when source hashes change.
- `events` are append-only and rotate by policy, not by deletion.

## 3) Commands

In scope:

- `afol health --json`
- `afol health --deep --json`
- `afol health --area adm|pstr|wb|memory|library|state|ctx|token_budget --json`
- `afol health --release --json`
- `afol pstr stale --json`
- `afol maintenance weekly --dry-run --json`
- `afol maintenance monthly --dry-run --json`
- `afol doctor --json`
- `afol doctor --remediation-plan --json`

Direct domain commands such as `afol library health` or `afol db health` may be
added as aliases later, but the canonical health surface is `afol health
--area <area>` so health output stays consistent and compact.

Health severity:

```text
fail = blocks done, close, release, or trusted bundle use when relevant
warn = visible health issue, not blocking by default
info = diagnostic
```

Doctor extends health with domain scores and an ordered remediation plan. It
does not apply changes unless a later implementation adds an explicit safe fix
mode with dry-run and approval.

## 4) Context Budget

Default retrieval levels:

```text
L0: compact status
L1: refs and summaries
L2: exact section
L3: full document
L4: repo scan
```

Default bundle budgets:

- bundle total: about 2k tokens unless caller requests a larger budget,
- memory: about 500 tokens,
- pstr refs: up to 5,
- library claims: up to 3,
- spec/adm sections: up to 3,
- tools: up to 10.

If budget is exceeded, AFOL returns compact mode or fails with a next-step hint.

## 5) Temporal Reliability v1

This is the first executable slice under the temporal and brain-layer strategy.
It should make existing state safer to trust before deeper graph retrieval,
embeddings, daemon behavior, or physical archive moves are considered.

Targets:

- Make path ownership explicit in config/template defaults:
  `.afol/adm`, `.afol/pstr`, `.afol/library`,
  `.afol/memory/memory.md`, and `.afol/state/afol.db`.
- Extend `afol pstr stale --json` so it returns `stale_maps` with path,
  reason, source paths, source hash status, stale timestamp status, and
  branch/commit mismatch when available.
- Ensure trusted context bundle generation excludes stale pstr maps, stale
  materialized records, stale library docs, invalidated claims, and suspect
  memory focus unless the caller explicitly requests warning-only behavior.
- Add `afol health --area state --json` for schema version, pending
  migrations when available, source-hash drift, FTS/index freshness, orphan
  records, DB size, and WAL size signals.
- Add `afol health --area library --json` for invalid frontmatter, missing
  source `accessed_at`, unsupported claims, invalidated claims still being
  returned, broken wikilinks, duplicate aliases, stale docs, invalid tags, and
  oversized docs without summaries.
- Add `afol health --area memory --json` for old `updated_at`, oversized
  memory, proposals without origin, duplicate active memories, and invalidated
  memories still being recalled.
- Add weekly and monthly maintenance dry-run reports that describe cleanup,
  consolidation, rotation, snapshot, and recheck candidates without applying
  destructive changes.

Non-goals for v1:

- no mandatory daemon,
- no embeddings in the core path,
- no full graph engine beyond stable refs/wikilinks already available,
- no physical archive moves,
- no automatic cleanup,
- no remote schema mutation or remote admin behavior.

Expected focused validation:

- `bun test cli/tests/pstr-schema-sweep.test.ts cli/tests/context-system.test.ts cli/tests/health-system.test.ts cli/tests/state-sqlite.test.ts`
- `bun run typecheck`
- `afol validate project --json`

## 6) Acceptance

- Health checks report `fail`, `warn`, and `info`.
- `afol health --area <area>` is the canonical domain-health command shape.
- Stale pstr maps do not enter trusted context bundles.
- Stale SQLite/materialized state is rebuilt or blocks trusted bundle
  generation.
- Stale library docs and invalidated claims are excluded from normal search and
  bundle output.
- State health reports schema, migration, source-hash, FTS/index, orphan,
  size, and WAL signals where those facilities exist.
- Library health reports stale docs, invalidated claims, broken wikilinks,
  duplicate aliases, missing `accessed_at`, invalid tags, oversized docs
  without summaries, and unsupported claims.
- Memory with old `updated_at` is treated as suspect for current focus.
- Multi-agent lifecycle commands require explicit session id.
- Archive is metadata-first before physical moves, preserving stable refs.
- Maintenance commands report cleanup actions before applying them.

## 7) Non-goals

- No automatic destructive cleanup in MVP.
- No moving archived session paths until stable refs and redirects exist.
- No full repo scan in default health.
- No using health warnings as universal blockers.
