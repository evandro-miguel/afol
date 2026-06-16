---
doc_type: spec
id: 260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01
theme: afol-brain-shape-retrieval-doctor-trust
status: final
owners:
- orchestrator
created_at: '2026-06-12T17:47:40-03:00'
updated_at: '2026-06-12T17:47:40-03:00'
roadmap_feature: F-18
roadmap_slice: F-18.S9
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related:
  - docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
  - docs/arc/SPECS/260612_context-routing-bundles-and-section-index_spec-child_01.md
  - docs/arc/SPECS/260612_temporal-health-freshness-token-budget_spec-child_01.md
scope:
  repo_areas:
  - .afol/adm/schema
  - .afol/adm/routing
  - .afol/pstr
  - .afol/memory
  - .afol/library
  - .afol/state
  - .afol/data/sweeps
  - cli/commands
  - cli/services
  packages:
  - agentic-cli
risk_level: high
---

# SPEC CHILD: afol-brain-shape-retrieval-doctor-trust

## 1) Feature Intent

- Outcome: AFOL gains a small internal brain layer: shape packs, source axes,
  hybrid retrieval, think-lite context bundles, sweep/doctor maintenance, skill
  resolver routing, and trust-boundary-aware operations.
- Why now: AFOL already separates adm, pstr, wb, memory, library, state, events,
  and indexes. The next step is making those sources typed, searchable,
  explainable, maintainable, and safe under different caller contexts.
- Roadmap feature: `F-18`
- Roadmap slice: `F-18.S9`
- Role of this spec: child contract for brain-layer patterns adapted to AFOL's
  execution OS scope.

## 2) Pattern Adoption

Adopt:

- Markdown/YAML as source of record.
- SQLite as materialized execution/index state.
- Shape/schema pack for source classes and page types.
- Graph-aware retrieval through wikilinks, backlinks, structured refs, pstr
  relations, and section indexes.
- Think-lite context bundles with citations, why, gaps, stale warnings, and
  do-not-load.
- Sweep/doctor cycles for health, dedupe, stale checks, and remediation plans.
- Resolver-based routing for rules, skills, tools, adm, pstr, memory, and
  library.
- Trust boundary between local, agent, and remote callers.

Do not adopt in MVP:

- always-on daemon,
- multi-user company-brain scope,
- mandatory OAuth,
- mandatory Postgres/pgvector,
- aggressive auto-ingest,
- remote schema mutation/admin,
- embeddings as a core dependency.

## 3) Shape Pack

Target path:

```text
.afol/adm/schema/afol-shape.yaml
```

Minimum shape fields:

```yaml
api_version: afol-shape-v1
name: afol-default
version: 0.1.0

page_types:
  - name: adm-spec
    prefix: .afol/adm/specs/
    authority: canonical
    inclusion: task-matched

  - name: pstr-map
    prefix: .afol/pstr/
    authority: observed
    inclusion: surface-matched
    stale_policy: source_hash

  - name: wb-session
    prefix: .afol/wb/
    authority: execution
    inclusion: session-matched

  - name: project-memory
    prefix: .afol/memory/memory.md
    authority: continuity
    inclusion: compact

  - name: library-research
    prefix: .afol/library/
    authority: external-knowledge
    inclusion: cited-only
```

Cache keys must include `shape_name`, `shape_version`, `source_path`,
`source_hash`, and git branch/commit when relevant.

Shape evolution commands:

```bash
afol schema detect --json
afol schema suggest --json
afol schema review --json
afol schema apply --candidate <id>
afol pstr detect --json
afol pstr suggest --json
afol pstr review-candidates --json
afol pstr review-candidates --apply <id>
```

Detection and suggestion may be automated. Applying shape changes requires
explicit reviewed command intent.

## 4) Retrieval and Think-Lite

Retrieval order:

1. Exact/path/id match.
2. SQLite FTS.
3. Section index.
4. Wikilink/backlink graph.
5. PSTR structural refs.
6. Freshness/status filter.
7. Lightweight rerank by authority, recency, task match, graph neighbor score,
   and stale penalty.

Modes:

```text
compact  = refs only
balanced = refs + summaries + health/gaps
deep     = selected section expansion
tokenmax = explicit full expansion only
```

`afol ctx bundle --explain --json` returns:

- selected context refs,
- why each ref was selected,
- gaps and stale/contradiction warnings,
- evidence tags,
- freshness status,
- create-safety hints,
- do-not-load.

## 5) Sweep and Doctor

Commands:

```bash
afol sweep daily --json
afol sweep weekly --json
afol sweep monthly --json
afol doctor --json
afol doctor --remediation-plan --json
```

Sweep is command-run maintenance, not an always-on daemon in MVP.

Doctor output includes domain scores for adm, pstr, wb, memory, library, state,
ctx, and tokens, plus an ordered remediation plan.

## 6) Resolver

Target path:

```text
.afol/adm/routing/resolver.md
```

The resolver maps task signals to the minimal rules, skills, tools, adm refs,
pstr refs, memory refs, library refs, and validation commands. It should be
short, path/surface-oriented, and safe to load in context bundles.

## 7) Trust Boundary

Operation context:

```ts
type OperationContext = {
  caller_type: "local" | "agent" | "remote";
  interactive: boolean;
  trust_level: "trusted" | "restricted";
};
```

Policy:

- local interactive callers use normal AFOL safeguards,
- agent callers require dry-run for sensitive mutation and approval for memory
  promotion, library mutation, and adm changes,
- remote callers are denied by default for sensitive mutation,
- pstr rebuild is allowed because it writes generated maps only,
- adm decision edits require explicit local approval.

## 8) Acceptance

- Shape pack path, schema, cache-key contract, and migration commands are
  documented.
- `afol schema detect/suggest/review/apply` is specified for pstr/library shape
  evolution with human review.
- Context bundle explain output includes why, gaps, evidence tags, freshness,
  create safety, and do-not-load.
- Hybrid retrieval uses exact, FTS, section index, graph refs, pstr refs,
  freshness, authority, and lightweight rerank.
- Sweep commands generate maintenance findings without requiring a daemon.
- Doctor can return scores and an ordered remediation plan.
- OperationContext trust policy gates sensitive mutation.

## 9) Non-goals

- No mandatory daemon.
- No mandatory embeddings.
- No Postgres/pgvector requirement.
- No remote admin mutation in MVP.
- No auto-ingest of arbitrary chat or external content.
- No graph extraction for task state/evidence beyond stable refs.
