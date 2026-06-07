---
doc_type: spec
id: 260521_0070_local-state-index-and-event-log_spec_01
theme: local-state-index-and-event-log
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:10:00+08:00'
updated_at: '2026-05-29T13:20:21-03:00'
roadmap_feature: F-07
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  manifesto: docs/arc/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .agents/data cli/index cli/events
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC: local-state-index-and-event-log

## 1) Feature Intent

Create compact local indexes and event logs so agents can query state without
repeatedly scanning files.

## 2) Problem

Repeated file scans waste tokens and time.

## 3) Expected Behavior

The CLI maintains local state under .agents/data/events and .agents/data/index
for workbench, rules, skills, specs, and files.

2026-05-31 DR addendum:

- Store query artifacts as append-only JSONL event streams and deterministic JSON
  index snapshots.
- SQLite-based indexing is explicitly out of MVP scope; introduce it only when
  scale/query pressure demonstrates clear need.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Event schema, JSONL event log, workbench index, rules index, skills
index, specs index, compact status queries.

Out of scope: Heavy vector DB in MVP, Heavy relational index in MVP (including SQLite),
always-on daemon requirement, cloud sync,
private prompt collection by default.

## 6) Acceptance

Agents can query compact project state; routine commands append events; indexes
can be rebuilt; stale state is detectable; event data stays local.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528112023377690`.
- Closeout session: `.agents/wb/260528_1111_f07-local-state-review-fix/`.
- Strict verification: `./.agents/agents verify-tasks --strict .agents/wb/260528_1111_f07-local-state-review-fix/` passed.

## 9) Architecture Delta: Lifecycle Event Intake

Follow-up delta captured on 2026-05-31: the local event log should accept
provider-neutral lifecycle events from hooks, wrappers, MCP tools, and manual
commands through the same CLI core path.

The event/index layer stores local event metadata, freshness stamps, provider
ids, session/task references, validation outcomes, and artifact references. It
must not collect raw private prompts by default.

Lifecycle-derived artifacts should stay local and rebuildable:

- durable event records under `.agents/data/events/`
- derived indexes under `.agents/data/index/`
- draft skill candidates under `.agents/tmp/skill-suggestions/`

This keeps memory, knowledge, and skill suggestion features queryable without
turning the scaffold into an always-on daemon, cloud sync service, or hidden
runtime transcript store.

Pending follow-up:

- Add a typed event schema for lifecycle intake.
- Define redaction/default-retention rules for provider payloads.
- Index suggestion artifact provenance so duplicate skill proposals can be
  detected without rescanning every draft.

## 10) Hermes Benchmark Decisions

- Pattern: local indexes expose typed state without becoming a discovery
  marketplace.
- Hermes source concept: tool catalogs and capability metadata are queryable
  through structured registries.
- Local decision: adapt registry-derived command, capability, skill, and event
  indexes; defer progressive tool discovery until core commands justify it.
- Acceptance criteria: local indexes can rebuild from structured state and
  events; registry metadata remains canonical; event records include
  provenance, touched paths, and validation outcome where available.
- Non-goals: no heavy vector database in the MVP, no private prompt capture by
  default, no marketplace-style tool discovery.
