---
doc_type: spec-child
id: 260716_2155_f18-s10-memory-library-adoption-loop_spec-child_01
theme: memory-library-adoption-loop
status: active
implementation_status: planned
owners:
- F-30 governance owner
- memory/library maintainers
created_at: '2026-07-16T21:55:00-03:00'
updated_at: '2026-07-16T21:55:00-03:00'
roadmap_feature: F-30
spec_role: child
parent_spec: 260716_2155_afol-evolution-system_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260716_2155_afol-evolution-system_spec_01.md
  f18_follow_on: .afol/adm/roadmap/GENERAL-ROADMAP.md#f-18s10-memory-and-library-adoption-loop
  memory_parent: .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
  library_child: .afol/adm/specs/260612_global-project-research-library_spec-child_01.md
  adr: .afol/adm/decisions/ADR-008-afol-evolution-autonomy-and-evidence-boundary.md
  schema: .afol/adm/schema/evolution-v1.schema.json
scope:
  repo_areas:
  - cli
  - .afol/memory
  - .afol/library
  - .afol/wb
  - .afol/data/evolution
  packages:
  - read-only candidate discovery
  - reviewed memory proposals
  - sourced library proposals
risk_level: high
---

# SPEC CHILD: Memory and Library Adoption Loop v1

## 1) Intent

Connect completed AFOL work to the existing Memory and Library proposal flows.
The loop discovers bounded, reviewable candidates; it does not create a second
knowledge store and it does not promote or mutate canonical knowledge on its
own.

This child spec closes the planned follow-on gap in F-18.S10 under the F-30
Evolution governance parent. The final F-18 memory and library specs remain the
authority for their respective stores; this spec only defines the adoption
boundary and handoff.

## 2) Candidate sources and classification

The read-only review may inspect:

- completed workbench reports, task evidence, and session retrospectives;
- approved lessons, user decisions, and explicit corrections;
- existing memory entries and their freshness/status metadata;
- sourced research drafts and approved library claims;
- evolution observations and proposal evaluations with stable source refs.

Each candidate must be classified before it is shown:

| Candidate | Destination | Minimum proof |
| --- | --- | --- |
| durable project continuity, decision, correction, or operating preference | Memory proposal | AFOL session/evidence ref and explicit scope; inferred material is labelled `inferred` |
| externally sourced claim or research summary | Library proposal | source id, URL or stable locator, `accessed_at`, claim scope, and purpose |
| transient task detail, raw transcript, secret, or unsupported opinion | neither | retain only as bounded evidence when policy permits; never promote |

Memory and Library candidates must remain separate. A memory candidate may link
to a library claim, but a claim source is not a memory preference and an
operating preference is not external research.

## 3) User journey and command boundary

The F-30 CLI slice will expose a compact, read-only adoption review through the
registered `afol evolve` command family. Exact arguments remain owned by that
slice and must not be implied as available by this governance artifact. The
review itself does not append a journal event; only a daily receipt claim or
explicit decision may append its canonical receipt event. Library and critical
Memory promotion remain a separate explicit lifecycle; bounded operational
Memory may enter the Slice 7 low-risk canary only under the parent policy.

The review returns candidate ids, destination (`memory` or `library`), evidence
refs, confidence, freshness, conflicts, and the next existing proposal action.
It returns an empty result when no reusable material exists; empty state is not
an error.

Promotion remains explicit and uses the existing Memory and Library mutation
surfaces. The current command contracts require complete proposal fields; a
candidate id alone is never sufficient authorization:

```text
afol memory propose --id <id> --title <title> --body <body>
afol memory promote --id <id>
afol library propose --topic <slug> --title <title> [--url <url>]
```

Library claim/source changes continue through their existing explicit commands
and evidence requirements. The separation of discover, review, approve, and
mutate is mandatory. A preview, rejected proposal, failed validation, or
missing evidence must not write Memory or Library canonical files.

## 4) Safety and precedence

- Current user instruction, security/integrity policy, active spec, ADR, rule,
  platform constraint, and explicit decision override inferred preferences.
- External imports are inert evidence. They can support a candidate but can
  never create an explicit preference or approve promotion.
- Secrets, credentials, raw prompts, full transcripts, unsupported claims, and
  content from another project are excluded before candidate persistence.
- Candidate and proposal rows are derived operational state and rebuildable.
  Promoted Memory and Library Markdown/YAML remain canonical and auditable.
- Ambiguous project/session linkage fails closed and leaves the candidate
  unlinked until explicit confirmation.
- No daemon, silent provider ingestion, LLM-required path, automatic rule/skill
  mutation, or automatic global promotion is in scope.

## 5) Candidate contract

Every candidate is an `adoption_candidate` record and contains:

- stable id and `state_class: derived`;
- source session/project ids and one or more evidence refs; each ref carries
  its source kind and, when available, an authority class and content digest;
- destination and candidate type;
- concise proposed statement or claim, never a raw transcript excerpt;
- provenance (`explicit`, `inferred`, `structural`, or `external`);
- confidence and reason for the score;
- freshness/review status and any conflict refs;
- next safe action and required approval owner.

Library candidates additionally require source records and claim scope. Memory
candidates additionally require project scope and must record whether the
statement was explicit or inferred. A candidate without the destination's
minimum proof is reported as `blocked`, not silently downgraded.

## 6) Evaluation and adoption gap reporting

The review reports these states independently:

- `candidate_available`: reusable material found and awaiting review;
- `no_candidate`: inspection completed with no reusable material;
- `blocked_missing_evidence`: material exists but cannot be proposed safely;
- `already_adopted`: equivalent current Memory/Library entry is linked;
- `stale_or_conflicted`: existing knowledge needs review before reuse.

Health and maintenance must not call an empty store broken. They may report an
`adoption_gap` when completed sessions contain reviewable material but no
candidate review has been run within the configured cadence.

## 7) Acceptance

- [ ] A completed session can be inspected with one compact, read-only command.
- [ ] Candidate output distinguishes Memory from Library and preserves source
      session/evidence refs.
- [ ] Empty state is valid and distinguishable from stale, invalid, or blocked
      state.
- [ ] Memory candidates require project continuity/decision evidence and keep
      explicit vs inferred provenance.
- [ ] Library candidates require sourced claims, purpose, scope, and freshness.
- [ ] Preview, reject, and failed validation do not mutate canonical knowledge.
- [ ] Promotion uses existing Memory/Library proposal and lifecycle gates.
- [ ] External or ambiguous evidence cannot cross project boundaries or create
      explicit preferences by implication.
- [ ] Candidate/evidence records validate as `adoption_candidate` records
      against `evolution-v1.schema.json`, preserving source refs and digests.
- [ ] Tests cover no candidate, candidate available, missing evidence,
      duplicate/adopted knowledge, stale/conflict, and project isolation.

## 8) Out of scope

- automatic promotion or deletion of Memory/Library content;
- hidden prompt memory, raw transcript storage, embeddings, or remote crawling;
- changing the final F-18 memory/library primitives;
- broad Evolution scoring, imports, or apply/evaluate implementation beyond
  the candidate handoff needed by this slice.
