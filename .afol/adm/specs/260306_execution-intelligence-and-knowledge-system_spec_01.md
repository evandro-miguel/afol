---
doc_type: spec
id: 260306_execution-intelligence-and-knowledge-system_spec_01
theme: execution-intelligence-and-knowledge-system
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set."
owners:
  - orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-06-14T00:00:00+00:00'
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
    - .afol/adm
    - docs
    - .agents/scripts
    - .afol/wb
  packages:
    - planning rigor
    - knowledge reuse
    - session closure
risk_level: medium
---

# SPEC: Execution Intelligence and Knowledge System

## 1) Objective

- Make the scaffold materially better at low-token, high-confidence agentic work by keeping `plan` + `task` as the mandatory workbench core and governing optional exploration and closure artifacts so they are only created when useful and finalized if they exist.

## 2) Problem

- Agents can currently move from feature intent to execution without proving they explored the current repo deeply enough.
- Prior research is stored in workstreams but is not easy to discover or reuse.
- A single session cannot cleanly separate multiple major planning tracks.
- Session closure can happen without a clear rule for optional artifact finalization, which makes closure discipline inconsistent.

## 3) Non-goals

- This spec does not introduce heavy external databases or embeddings.
- This spec does not force every tiny quick task to create full planning artifacts.
- This spec does not replace roadmap/spec governance; it strengthens execution quality beneath it.

## 4) Scope

In scope:

- `plan` + `task` as the mandatory workbench core.
- Optional `brainstorm`, `research`, `explorer-check`, and `postmortem` artifacts when they add real value.
- Knowledge indexing and search over prior workstream artifacts.
- Optional pack folders for multiple major plan tracks within one session.
- Final session closure that fails if any present optional artifact is still open.

Out of scope:

- Global memory systems outside the repository.
- Runtime-specific vendor memory features.
- Rich semantic search infrastructure requiring external services.

## 5) Users and Use Cases

Primary users:

- Agents planning and executing work in this scaffold.
- Project owners reviewing whether planning quality is real.

Use cases:

- UC-01 An agent needs to plan a major change and uses the `plan` + `task` core first, then adds optional artifacts only if the work benefits from them.
- UC-02 An agent wants to reuse prior research instead of rereading the whole repo or repeating earlier investigations.
- UC-03 A long-lived session needs more than one major plan track without mixing unrelated docs in one flat folder.
- UC-04 A session is being closed and must confirm that any optional artifacts that exist are final, with postmortem inventory when a postmortem exists.

## 6) Assumptions

- Markdown and lightweight scripted indexing are sufficient for useful knowledge reuse.
- Small, explicit artifacts are better than large hidden memory systems for reviewability.
- Planning quality improves when brainstorm, explorer-check, research, and post-mortem artifacts are created only when useful and are finalized if they exist.

## 7) Constraints

- Must remain repo-local and portable.
- Must preserve backward compatibility with existing flat session folders.
- Must not meaningfully increase token use just to discover where information lives.

## 8) Proposed Solution

Summary:

- Add a governed execution-intelligence layer with four pillars:
  - `plan` + `task` as the mandatory core
  - optional brainstorm, research, explorer-check, and postmortem artifacts when they are useful
  - low-token knowledge search/index across prior artifacts
  - closure discipline that fails if any present optional artifact is still open

Key design choices:

- Backward compatible session model: flat sessions still work, but pack folders remain a supported structure for multiple major plan tracks.
- Lightweight knowledge layer: filesystem-backed indexing and search over research, brainstorm, explorer-check, and postmortem docs when they exist.
- Closure discipline: if an optional artifact exists, it must be final before session closure, and the postmortem, when present, should record which optional artifacts existed and whether they were final.

## 9) Child Spec Strategy

- Child specs required: yes
- Decomposition rule:
  - Split by planning rigor, knowledge reuse, and session structure/closure because each area needs different workflow and validation rules.
- Planned child specs:
  - `260306_planning-rigor-and-explorer-gates_spec_01`
  - `260306_knowledge-reuse-and-token-efficiency_spec_01`
  - `260306_session-pack-structure-and-postmortem_spec_01`

## 10) Flow

1. A roadmap feature and governing spec exist.
2. A major workstream is created.
3. Optional brainstorm, research, explorer-check, and postmortem artifacts are created only when they add real value.
4. Research and prior knowledge are searched through low-token discovery tools before broad repo rereads.
5. Execution proceeds with the `plan` / `task` core, plus any optional artifacts the session actually needs.
6. If optional artifacts exist, they are finalized before closure; the postmortem, when present, records which optional artifacts existed and whether they were final.

## 11) Verification Philosophy

- The system should validate artifact presence and link coherence.
- Search/index tools should produce concise, actionable outputs.
- Session closure should emit evidence-backed optional-artifact completion when those artifacts exist.

## 12) Risks and Tradeoffs

- Risk: planning overhead becomes heavy for small work -> Mitigation: preserve quick mode and allow lightweight paths for narrow tasks.
- Risk: knowledge index becomes stale -> Mitigation: add an index command and include it in full validation/docs refresh.
- Risk: pack folders add complexity -> Mitigation: keep flat sessions supported and recursive tooling behavior consistent.

## 13) Acceptance Checklist

- [x] Problem and scope are explicit
- [x] Child-spec decomposition is explicit
- [x] Backward compatibility is explicit
- [x] Closure discipline is explicit
- [x] Verification philosophy is explicit

---

*Spec: `.afol/adm/specs/260306_execution-intelligence-and-knowledge-system_spec_01.md`*
