---
doc_type: spec
id: 260612_global-project-research-library_spec-child_01
theme: global-project-research-library
status: draft
owners:
- orchestrator
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T13:37:19-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  related: docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
scope:
  repo_areas:
  - .afol/library
  - .afol/wb
  - .afol/data/index
  - cli/commands
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC CHILD: global-project-research-library

## 1) Feature Intent

- Outcome: AFOL can promote validated, sourced research from session drafts into
  a global project library that agents can search without reading raw session
  history.
- Why now: File-first handoffs save research locally, but useful findings still
  remain tied to individual sessions unless promoted into a durable structured
  store.
- Roadmap feature: `F-18`
- Role of this spec: child delivery contract for `.afol/library/`.
- ADR-004 note: library is curated external knowledge. It can feed context
  bundles and link to specs/ADRs, but it does not replace `.afol/adm/**`,
  memory, evidence, or workbench state.

## 2) Problem

Research can be useful across future tasks, but session logs and sidecars are
not a good global memory. They contain transient context, can be noisy, and may
lack source/claim separation.

## 3) Users and User Journey

Primary users:

- researchers gathering sources,
- orchestrators promoting reusable knowledge,
- implementers querying current claims,
- reviewers invalidating stale claims.

User journey:

1. A session creates `.afol/wb/<session>/json/research-draft.json`.
2. `afol library propose -S <session>` validates schema, purpose, sources,
   duplicates, and conflicts.
3. `afol library promote -S <session> --topic <topic>` appends validated
   records to `.afol/library/topics/<topic>/`.
4. `afol library search "<query>" --json` returns current claims and sources.
5. `afol library invalidate --claim <id> --reason "<reason>" --source <id>`
   marks stale or contradicted claims.
6. `afol ctx bundle --include-library` can include relevant current claims.

Failure or friction points:

- Claim without source -> proposal fails.
- Source without `accessed_at` -> proposal fails.
- Duplicate or conflicting claim -> proposal reports conflict for review.
- Raw copied page content -> validation rejects or flags as out of scope.

## 4) Experience and Behavior

Expected behavior:

- Global library root: `.afol/library/`.
- Topic root: `.afol/library/topics/<topic-slug>/`.
- Topic files:
  - `topic.json`
  - `claims.jsonl`
  - `sources.jsonl`
  - `research-runs.jsonl`
  - `invalidations.jsonl`
  - `useful-sources.jsonl`
- Session draft path:
  - `.afol/wb/<session>/json/research-draft.json`.

Boundaries:

- The library stores claims, sources, invalidations, runs, and useful source
  candidates. It does not store full pages or chat transcripts.
- Session drafts may be messy; promoted library entries must be structured and
  sourced.
- Library search is local and structured in MVP.

## 5) Scope

In scope:

- `afol library search "<query>" --json`.
- `afol library topic <topic-slug> --json`.
- `afol library draft -S <session> --topic <topic>`.
- `afol library propose -S <session>`.
- `afol library promote -S <session> --topic <topic>`.
- `afol library add-source --topic <topic> --url <url>`.
- `afol library add-claim --topic <topic> --source <source-id>`.
- `afol library invalidate --claim <claim-id> --reason "<reason>" --source
  <source-id>`.
- `afol library suggest-source --topic <topic> --url <url> --why "<why>"`.
- `afol library rebuild-index`.

Out of scope:

- Hidden prompt memory.
- Storing secrets.
- Full webpage copies.
- Automatic crawler behavior.
- Replacing specs, ADRs, workbench reports, or docs.

## 6) Child Spec Strategy

- Child specs required: no.
- This child is already a bounded delivery slice under F-18.

## 7) Constraints and Assumptions

Assumptions:

- Library claims must remain useful without reading the original session.
- Freshness matters and must be represented explicitly.

Constraints:

- Compatibility: library commands must not alter workbench task state unless
  called through explicit lifecycle commands.
- Operational: topic files use JSON/JSONL and are append-friendly where
  appropriate.
- Security/privacy: no private prompts, secrets, credentials, or full copied
  external pages.

## 8) Acceptance

- A session can generate `research-draft.json`.
- `afol library propose` validates schema, source requirements, duplicate
  candidates, and conflicts.
- `afol library promote` writes validated research to
  `.afol/library/topics/<topic>/`.
- Every claim has at least one source.
- Every source has `accessed_at`.
- Claims can be invalidated without deletion.
- `afol library search` returns current claims and useful sources without
  reading all raw files into agent context.
- `afol ctx bundle --include-library` can include relevant current claims.

## 9) Risks and Tradeoffs

- Risk: library becomes noisy storage -> Mitigation: purpose, source, and
  promotion gates.
- Risk: stale claims mislead agents -> Mitigation: freshness policy and
  invalidation records.
- Tradeoff: structured promotion takes more work than dropping notes in a log
  -> Why accepted: the library is global reusable knowledge, not session
  scratch space.

## 10) Rollout and Lifecycle

- Start with local JSON/JSONL topic storage.
- Add search over topic titles, tags, claim text, source titles, and status.
- Add bundle integration after routing bundles support library refs.
- Backout by leaving session drafts intact and disabling promotion/search.

## 11) Verification Philosophy

- Add schema tests for all library file types.
- Add propose/promote/search/invalidate command tests.
- Add tests that unsourced claims and missing `accessed_at` fail.
- Run `bun run typecheck`, `bun test`, and `afol validate project --json`.
