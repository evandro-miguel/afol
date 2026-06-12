---
doc_type: spec
id: 260612_context-routing-bundles-and-section-index_spec-child_01
theme: context-routing-bundles-and-section-index
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
  - .afol/wb
  - .afol/data/index
  - cli/services/catalog
  - cli/services/local-state
  - cli/commands
  packages:
  - agentic-cli
risk_level: high
---

# SPEC CHILD: context-routing-bundles-and-section-index

## 1) Feature Intent

- Outcome: AFOL can produce compact, task-scoped context bundles and retrieve
  exact document sections by stable references.
- Why now: Rule/skill routing and local-state indexes already exist, but agents
  still need a single package that combines task, role, surface, tools, rules,
  skills, validation, and relevant spec sections.
- Roadmap feature: `F-18`
- Role of this spec: child delivery contract for `ctx` routing and section
  index behavior.
- ADR-004 note: context bundles should read from hydrated/materialized state and
  section indexes, while canonical project administration lives under
  `.afol/adm/**` after migration.

## 2) Problem

Agents waste tokens when they load full plans, specs, ADRs, tasks, or library
records just to execute one task. Routing decisions are also harder to audit
when they are only printed transiently instead of materialized as structured
session state.

## 3) Users and User Journey

Primary users:

- orchestrators assigning tasks,
- workers receiving task/role context,
- reviewers explaining why context was included or omitted.

User journey:

1. AFOL builds or refreshes routing state for a session.
2. `afol ctx tools -S <session>` materializes toolsets into
   `.afol/wb/<session>/json/tools.json`.
3. Optional `.afol/wb/<session>/json/tools.override.json` changes the derived
   toolset without editing generated state.
4. `afol ctx bundle -S <session> -T T-01 --role coder --surface typescript
   --json` returns one compact bundle.
5. `afol ctx section --ref <ref> --json` returns an exact indexed section.
6. `afol ctx explain` reports why the bundle includes or omits inputs.

Failure or friction points:

- Stale section index -> command reports stale index and points to rebuild.
- Missing override target -> validation fails with the bad toolset id.
- Bundle too broad -> explain output identifies the rule/source that expanded
  scope.

## 4) Experience and Behavior

Expected behavior:

- Generated routing state lives at
  `.afol/wb/<session>/json/tools.json`.
- Operator overrides live at
  `.afol/wb/<session>/json/tools.override.json`.
- Bundle files live under
  `.afol/wb/<session>/json/bundles/`.
- Section index lives at `.afol/data/index/sections.json`.
- Section refs can target specs, tasks, plans, ADRs, and library entries.

Boundaries:

- `tools.json` is generated; humans should use `tools.override.json` for manual
  adds/removals.
- Bundles include references and compact extracts, not whole documents by
  default.
- No vector database or embeddings are required for MVP.

## 5) Scope

In scope:

- `afol ctx build -S <session>`.
- `afol ctx tools -S <session>`.
- `afol ctx bundle -S <session> -T <task> --role <role> --surface <surface>
  --json`.
- `afol ctx explain -S <session> -T <task> --role <role>`.
- `afol index sections rebuild`.
- `afol ctx section --ref <ref> --json`.
- Updating `plan.md ## Tools` as a short projection from `tools.json`.

Out of scope:

- A marketplace of tools.
- Loading every skill or rule by default.
- Depending on manual orchestration judgment for all routing.
- Legacy `.agents/tools.json` as active operational state.

## 6) Child Spec Strategy

- Child specs required: no.
- This child is already a bounded delivery slice under F-18.

## 7) Constraints and Assumptions

Assumptions:

- Existing `rule` and `skill` commands provide routing primitives that can be
  reused or extended.
- Section refs should be stable enough for bundles but rebuildable from source
  files.

Constraints:

- Compatibility: existing `rule`, `skill`, and `local-state` commands must not
  regress.
- Operational: generated indexes are cache state and must not be the source of
  truth.
- Security/privacy: bundles must not include secrets or hidden prompt memory.

## 8) Acceptance

- `afol ctx bundle` returns a compact JSON package for one task/role/surface.
- The bundle includes task, relevant rules, skills, tools, validation commands,
  and spec section references.
- The bundle does not include whole unrelated documents by default.
- `tools.override.json` can add or remove tools without editing `tools.json`.
- `plan.md ## Tools` mirrors a concise view of `tools.json`.
- `afol ctx section --ref ...` returns an exact section or JSON pointer.
- `afol ctx bundle` uses `sections.json` when possible.

## 9) Risks and Tradeoffs

- Risk: generated bundles hide necessary context -> Mitigation: explain output,
  override files, and bundle tests for common roles/surfaces.
- Risk: section refs drift after edits -> Mitigation: rebuildable index,
  freshness checks, and line-range validation.

## 10) Rollout and Lifecycle

- Start with specs, plans, tasks, and ADRs as indexed document sources.
- Add library claims after the library child slice lands.
- Backout by disabling bundle generation while leaving existing rule/skill
  commands unchanged.

## 11) Verification Philosophy

- Add routing tests for role/surface/toolset derivation.
- Add override merge tests.
- Add section index tests for Markdown headings and JSON pointers.
- Run `bun run typecheck`, `bun test`, and `afol validate project --json`.
