---
doc_type: spec
id: 260612_agent-operational-state-context-library_spec_01
theme: agent-operational-state-context-library
status: final
owners:
- orchestrator
created_at: '2026-06-12T12:12:33-03:00'
updated_at: '2026-06-12T17:47:40-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260612_afol-administration-project-structure-onion-architecture_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
  adr: .afol/adm/decisions/ADR-004-afol-administration-and-project-structure.md
scope:
  repo_areas:
  - .afol/wb
  - .afol/adm
  - .afol/pstr
  - .afol/state
  - .afol/data/index
  - .afol/library
  - cli
  - .afol/adm
  packages:
  - agentic-cli
risk_level: high
---

# SPEC: agent-operational-state-context-library

## 1) Feature Intent

- Outcome: AFOL gains a structured operational layer for agent execution:
  canonical Markdown/YAML administration, SQLite materialized state, controlled
  Markdown projections, compact context bundles, section-level retrieval, a
  sourced project research library, spec closure checks, and decision history.
- Why now: The AFOL branch has retired legacy command surfaces and already
  defines structured workbench state, routing, file-first handoffs, and local
  indexes as final feature contracts. The next gap is making those contracts
  concrete enough that agents no longer need to read or edit long Markdown files
  directly for routine state.
- Roadmap feature: `F-18`
- Role of this spec: operational child contract under the F-18 onion and source
  authority architecture.

## 2) Problem

Agents can still waste context or create drift when they:

- infer task state from Markdown tables without AFOL hydration/index support,
- edit managed Markdown by hand,
- load whole specs/plans/tasks to answer a narrow question,
- receive broad rules and skills instead of a task/role bundle,
- leave useful research trapped inside one session, or
- mark work done without an explicit compatibility check against active specs.

Agents and maintainers also lose useful debugging context when AFOL command
failures are printed transiently but not recorded as structured local error
events. Failures such as command parsing mistakes, `done -x` execution errors,
strict close rejections, stale index validation failures, and rejected spec gates
should remain inspectable after the terminal output is gone.

## 3) Users and User Journey

Primary users:

- orchestrators assigning AFOL tasks to agents,
- worker agents implementing bounded slices,
- reviewers validating closure evidence and spec compatibility,
- maintainers reviewing durable project research and decisions.

User journey:

1. An orchestrator creates or targets an AFOL session.
2. AFOL hydrates session Markdown and evidence into `.afol/state/afol.db`.
3. AFOL renders human Markdown managed blocks from materialized state and
   preserves allowed human notes outside managed blocks.
4. A worker requests `afol ctx bundle` for one task, role, and surface.
5. The bundle returns only the relevant task, spec sections, rules, skills,
   tools, validations, and optional current library claims.
6. The worker records evidence and runs a spec compatibility check before
   closure.
7. Useful research is promoted from session draft state into `.afol/library/`
   only when it has sources, purpose, provenance, and validation.

Failure or friction points:

- Markdown and materialized-state drift -> `afol state validate` detects it and
  `afol state sync` re-renders managed Markdown.
- Missing context for a task -> `afol ctx explain` shows why a bundle includes
  or omits rules, skills, tools, specs, and library claims.
- Research without sources -> library proposal fails.
- Spec conflict before done -> task stays open until the spec is updated,
  conflict is resolved, or an explicit waiver references a reason and decision.
- AFOL command failure -> AFOL writes a structured command-error record with the
  failed command, exit code, session/task when known, summarized stderr/stdout,
  cause classification, and suggested recovery path.
- Stale pstr, library, memory, or SQLite state -> AFOL excludes it from trusted
  context bundles or fails with a rebuild/review hint.
- Ambiguous retrieval -> AFOL reports why sources were selected, what is stale,
  what is missing, and what should not be loaded.

## 4) Experience and Behavior

Expected behavior:

- Markdown/YAML under the configured administration and workbench surfaces is
  canonical for human and agent review.
- SQLite under `.afol/state/` is the materialized execution/query layer.
- JSON and JSONL remain appropriate for events, evidence, debug snapshots,
  command errors, session interchange, and generated indexes.
- Managed Markdown is a human projection and audit surface.
- Evidence remains the proof of execution.
- Events remain the audit trail.
- Command-error logs remain the diagnostic trail for failed AFOL operations.
- Indexes remain rebuildable caches.
- Library topics preserve sourced project research outside individual sessions.
- Freshness and token-budget checks decide whether adm, pstr, memory, library,
  and SQLite-derived content can enter trusted context.
- Shape-pack and resolver rules decide which source classes, maps, rules,
  skills, tools, memory, and library refs can enter the bundle.

Boundaries:

- F-18 extends F-04, F-05, F-06, and F-07; it does not reopen their final
  feature status.
- New command logic belongs in `cli/**`.
- Exportable downstream template state belongs in `src/project-template/**`
  only when the payload is meant for downstream projects.
- Target project administration belongs under `.afol/adm/**`.
- Target current project-structure maps belong under `.afol/pstr/**`.
- Mutable runtime/session state belongs under `.afol/**`.
- `.agents/**` remains static scaffold metadata, rules, skills, lock, manifest,
  config, and source seed content only.

## 5) Scope

In scope:

- `.afol/adm/**` administration references and migration compatibility.
- `.afol/pstr/**` project-structure map references and map/index
  compatibility.
- `.afol/state/afol.db` materialized execution state references.
- `.afol/wb/<session>/json/` optional session interchange/debug snapshots where
  useful, not active source state.
- `.afol/data/events/command-errors.jsonl` or an equivalent AFOL-owned error
  event stream for failed lifecycle and validation commands.
- Controlled rendering and drift detection for managed Markdown blocks.
- Task/role/surface context bundles.
- Tool/rule/skill/spec routing materialized in SQLite and exportable as
  structured JSON when requested.
- `.afol/data/index/sections.json` section and reference index.
- `.afol/library/` topic, source, claim, invalidation, and useful-source
  records.
- Spec compatibility checks before `done` and `close`.
- ADR, changelog, and archive command contracts for strategic changes.

Out of scope:

- Restoring `.agents/agents`, `.agents/scripts`, `.agents/runtime`,
  `.agents/wb`, `.agents/z-arq`, `agents.config`, or legacy delegate routing.
- Treating SQLite as the only source of truth or an unreviewable replacement for
  Markdown/YAML.
- A vector database in the MVP.
- Requiring a Markdown mirror for every JSON file.
- Automatic web crawling.
- Private prompt capture or hidden global memory.
- Making AI prove semantic compatibility without human-reviewable evidence.

## 6) Child Spec Strategy

- Child specs required: yes.
- Decomposition rule:
  - Use child specs because this feature crosses workbench lifecycle, Markdown
    rendering, context routing, indexes, research storage, closure gates, and
    decision history.
  - Each child must be independently implementable, testable, and backout-safe.
- Planned child specs:
  - `260612_afol-administration-project-structure-onion-architecture_spec_01`
    -> parent authority, onion, `.afol/adm`, `.afol/pstr`, and migration
    direction.
  - `260612_workbench-hydration-and-markdown-projection_spec-child_01` ->
    session state, render/sync, and Markdown drift handling; this must align
    with SQLite hydration and must not make JSON the sole source of truth.
  - `260612_context-routing-bundles-and-section-index_spec-child_01` ->
    routed tools/rules/skills/spec references and section retrieval.
  - `260612_global-project-research-library_spec-child_01` -> sourced global
    project research library and session drafts.
  - `260612_spec-compatibility-and-decision-history_spec-child_01` -> spec
    compatibility gates, waiver behavior, ADR/changelog/archive contracts.
  - `260612_temporal-health-freshness-token-budget_spec-child_01` -> time,
    freshness, health, cleanup, archive, branch/commit, and token-budget
    policies.
  - `260612_afol-brain-shape-retrieval-doctor-trust_spec-child_01` -> AFOL
    shape pack, source axes, hybrid retrieval, think-lite, sweep/doctor,
    resolver, and trust boundary.

## 7) Constraints and Assumptions

Assumptions:

- `afol` is the only public front door.
- Bun/TypeScript under `cli/**` is the canonical implementation path.
- Existing Markdown workbench and administration files must continue to be
  usable for humans while SQLite/index state becomes the fast materialized layer
  for scripts and agents.

Constraints:

- Compatibility: existing `afol new`, `start`, `evidence`, `done`, `close`,
  `verify-tasks`, `local-state`, `rule`, and `skill` workflows must not regress.
- Operational: indexes are rebuildable and must be validated for freshness
  before being trusted.
- Security/privacy: no secret-bearing content, private prompts, or full copied
  pages are stored by default.

## 8) Acceptance

Success looks like:

- AFOL defines the migration path from `docs/arc/**` to `.afol/adm/**` and from
  legacy map docs to `.afol/pstr/**`.
- AFOL hydrates canonical Markdown/YAML and evidence into materialized state and
  detects source drift.
- AFOL renders managed Markdown blocks from materialized state and detects
  projection drift.
- AFOL routes tools, rules, skills, specs, and validations into compact bundles.
- AFOL retrieves specs, tasks, ADRs, plans, and library entries by section
  reference without opening whole documents by default.
- AFOL promotes sourced research from session drafts into `.afol/library/`.
- AFOL can search current library claims and sources without loading raw
  research.
- AFOL prevents task/session closure when unresolved required spec conflicts
  remain.
- AFOL records structured command-error logs when AFOL commands fail, including
  failures from `done -x`, `close`, `state validate`, `ctx bundle`, `library
  propose`, and `spec check`.
- AFOL prevents stale pstr maps, stale library claims, stale memory focus, and
  stale SQLite materialization from entering trusted context bundles by default.
- AFOL enforces context bundle token budgets and provides section-level expansion
  commands when compact refs are insufficient.
- AFOL can return think-lite bundle explanations with context refs, why, gaps,
  freshness, evidence tags, create-safety hints, and do-not-load.
- Strategic decisions and abandoned or superseded directions remain traceable
  through ADR/changelog/archive surfaces.

Review questions:

- Does this reduce token cost without hiding required evidence?
- Does it keep the operational source of truth structured and auditable?
- Does it preserve `.afol/**` as mutable state and `.agents/**` as static
  scaffold metadata?
- Can each child slice be verified without implementing the whole feature?

## 9) Risks and Tradeoffs

- Risk: SQLite or generated JSON can drift from canonical Markdown/YAML ->
  Mitigation: source hashes, hydration checks, managed blocks, and rebuild-only
  derived indexes.
- Risk: bundles can omit context agents actually need -> Mitigation:
  `ctx explain`, explicit bundle schema, role/surface tests, and override files.
- Risk: global library becomes noisy transcript storage -> Mitigation: claims
  require sources, purpose, provenance, and promotion from draft state.
- Risk: spec compatibility check becomes fake certainty -> Mitigation: record
  compatibility status, conflicts, and waivers as reviewable state instead of
  claiming full semantic proof.
- Tradeoff: more structured files increase implementation surface -> Why
  accepted: the feature targets repeated token waste and state drift across all
  governed AFOL work.

## 10) Rollout and Lifecycle

Rollout approach:

1. Define `.afol/adm` and `.afol/pstr` authority boundaries.
2. Add SQLite foundation and hydration from current governed docs.
3. Add Markdown projection and drift validation.
4. Add memory, library, context bundles, spec gates, and decision-history
   commands as separate slices.

Workstream linkage:

- Execution must reference `roadmap_feature: F-18` and
  `parent_spec: 260612_agent-operational-state-context-library_spec_01`.

Backout or deferral:

- Each child slice must preserve current Markdown workbench behavior until its
  structured path is validated.
- If a later slice is deferred, earlier JSON/projection work must remain usable
  without requiring library or spec-gate commands.

## 11) Verification Philosophy

Evidence expected from delivery:

- command tests for every new command family,
- failure-path tests proving command-error records are written for parse,
  execution, validation, and closure failures,
- schema validation for each JSON/JSONL file type,
- lifecycle tests proving existing workbench commands still work,
- local-state freshness/rebuild evidence for new indexes,
- release validation before any public distribution claim.

Open questions:

- Q-01 Which command names should receive short aliases after their long forms
  are stable?
- Q-02 Which library fields are required for MVP search ranking versus future
  richer retrieval?
- Q-03 Should `afol done` require spec compatibility by default only for tasks
  linked to an active spec, or only when `--require-spec-check` is passed?
