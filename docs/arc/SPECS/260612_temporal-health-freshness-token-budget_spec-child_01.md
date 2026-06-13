---
doc_type: spec
id: 260612_temporal-health-freshness-token-budget_spec-child_01
theme: temporal-health-freshness-token-budget
status: draft
owners:
- orchestrator
created_at: '2026-06-12T16:47:37-03:00'
updated_at: '2026-06-12T17:47:40-03:00'
roadmap_feature: F-18
roadmap_slice: F-18.S8
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related: docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
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
  branch: main_dev
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
- `afol health --area <area> --json`
- `afol health --release --json`
- `afol adm health --json`
- `afol pstr health --json`
- `afol pstr stale --json`
- `afol wb health --json`
- `afol memory health --json`
- `afol library health --json`
- `afol db health --json`
- `afol token health --json`
- `afol maintenance weekly --dry-run --json`
- `afol maintenance monthly --dry-run --json`
- `afol doctor --json`
- `afol doctor --remediation-plan --json`

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

## 5) Acceptance

- Health checks report `fail`, `warn`, and `info`.
- Stale pstr maps do not enter trusted context bundles.
- Stale SQLite/materialized state is rebuilt or blocks trusted bundle
  generation.
- Stale library docs and invalidated claims are excluded from normal search and
  bundle output.
- Memory with old `updated_at` is treated as suspect for current focus.
- Multi-agent lifecycle commands require explicit session id.
- Archive is metadata-first before physical moves, preserving stable refs.
- Maintenance commands report cleanup actions before applying them.

## 6) Non-goals

- No automatic destructive cleanup in MVP.
- No moving archived session paths until stable refs and redirects exist.
- No full repo scan in default health.
- No using health warnings as universal blockers.
