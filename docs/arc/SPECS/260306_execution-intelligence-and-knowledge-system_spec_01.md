---
doc_type: spec
id: 260306_execution-intelligence-and-knowledge-system_spec_01
theme: execution-intelligence-and-knowledge-system
status: active
owners:
  - orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-03-06T23:05:00+00:00'
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
    - docs/arc
    - docs
    - .agents/scripts
    - .agents/wb
  packages:
    - planning rigor
    - knowledge reuse
    - session closure
risk_level: medium
---

# SPEC: Execution Intelligence and Knowledge System

## 1) Objective
- Make the scaffold materially better at low-token, high-confidence agentic work by enforcing structured exploration, reusable knowledge retrieval, and disciplined session closure.

## 2) Problem
- Agents can currently move from feature intent to execution without proving they explored the current repo deeply enough.
- Prior research is stored in workstreams but is not easy to discover or reuse.
- A single session cannot cleanly separate multiple major planning tracks.
- Session closure can happen without a formal post-mortem, which loses institutional learning.

## 3) Non-goals
- This spec does not introduce heavy external databases or embeddings.
- This spec does not force every tiny quick task to create full planning artifacts.
- This spec does not replace roadmap/spec governance; it strengthens execution quality beneath it.

## 4) Scope
In scope:
- Mandatory exploration artifacts for major planning.
- Knowledge indexing and search over prior workstream artifacts.
- Optional pack folders for multiple major plan tracks within one session.
- Mandatory post-mortem requirements for final session closure.

Out of scope:
- Global memory systems outside the repository.
- Runtime-specific vendor memory features.
- Rich semantic search infrastructure requiring external services.

## 5) Users and Use Cases
Primary users:
- Agents planning and executing work in this scaffold.
- Project owners reviewing whether planning quality is real.

Use cases:
- UC-01 An agent needs to plan a major change and must prove the current repo was explored before the plan is treated as complete.
- UC-02 An agent wants to reuse prior research instead of rereading the whole repo or repeating earlier investigations.
- UC-03 A long-lived session needs more than one major plan track without mixing unrelated docs in one flat folder.
- UC-04 A session is being closed and must capture what happened, what worked, and what still needs follow-up.

## 6) Assumptions
- Markdown and lightweight scripted indexing are sufficient for useful knowledge reuse.
- Small, explicit artifacts are better than large hidden memory systems for reviewability.
- Planning quality improves when brainstorm, explorer-check, research, and post-mortem artifacts are enforced.

## 7) Constraints
- Must remain repo-local and portable.
- Must preserve backward compatibility with existing flat session folders.
- Must not meaningfully increase token use just to discover where information lives.

## 8) Proposed Solution
Summary:
- Add a governed execution-intelligence layer with four pillars:
  - mandatory brainstorm before plan completion
  - mandatory explorer-check proving repo-context review
  - low-token knowledge search/index across prior artifacts
  - mandatory post-mortem before final report closure

Key design choices:
- Backward compatible session model: flat sessions still work, but pack folders become a supported structure for multiple major plan tracks.
- Lightweight knowledge layer: filesystem-backed indexing and search over research, brainstorm, explorer-check, report, and post-mortem docs.
- Closure discipline: final report status requires a post-mortem.

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
3. Brainstorm and explorer-check artifacts are completed before the plan can be treated as complete.
4. Research and prior knowledge are searched through low-token discovery tools before broad repo rereads.
5. Execution proceeds with plan/task/log/report artifacts.
6. Final report closure is blocked until a post-mortem exists.

## 11) Verification Philosophy
- The system should validate artifact presence and link coherence.
- Search/index tools should produce concise, actionable outputs.
- Session closure should emit evidence-backed post-mortem completion.

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
*Spec: `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md`*
