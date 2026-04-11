---
doc_type: plan
id: 260306_2002_execution-intelligence-system_plan_01
theme: execution-intelligence-system
status: final
owners:
- orchestrator
created_at: '2026-03-06T20:02:07-03:00'
updated_at: '2026-03-06T20:34:07-03:00'
roadmap_feature: F-07
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260306_2002_execution-intelligence-system_brainstorm_01
  explorer_check: 260306_2002_execution-intelligence-system_explorer-check_01
  research: 260306_2002_execution-intelligence-system_research_01
  task: 260306_2002_execution-intelligence-system_task_01
repo: agentic_start_folder
branch: main
---

# Plan: execution-intelligence-system

## Objective
- Deliver work for roadmap feature `F-07` within the boundaries defined by parent spec `260306_execution-intelligence-and-knowledge-system_spec_01`.

## Scope
- In scope:
  - roadmap/spec expansion for execution intelligence, knowledge reuse, session packs, and postmortem closure
  - template changes and new artifact types
  - recursive tool support for session packs
  - low-token knowledge search/index tooling
- Out of scope:
  - external memory systems or embeddings
  - global machine state outside the repo

## Governance Context
- Roadmap feature: `F-07`
- Parent spec: `260306_execution-intelligence-and-knowledge-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan is not complete until brainstorm and explorer-check artifacts remain linked and valid.

## Planning Inputs
- Brainstorm artifact: `260306_2002_execution-intelligence-system_brainstorm_01`
- Explorer check artifact: `260306_2002_execution-intelligence-system_explorer-check_01`
- Research artifact: `260306_2002_execution-intelligence-system_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge index`
  - reviewed existing governance and runtime-compatibility workstream artifacts

## Success Criteria
- Governed workstreams create brainstorm, research, explorer-check, and postmortem artifacts by default.
- Session-scoped tooling supports nested pack folders without breaking flat sessions.
- Agents can list/search/show prior findings through `.agents/agents knowledge`.
- Final report closure is blocked until a finalized postmortem exists.

## Delivery Strategy
1. Extend roadmap/spec governance and templates.
2. Implement knowledge tooling and recursive session support.
3. Enforce postmortem closure and verify the full scaffold.

## Critical Dependencies
- Tools:
  - `.agents/agents knowledge`
  - `.agents/agents wb-update`
  - `make doctor`
  - `make lint`
  - `make test-scripts`
  - `make all`
- MCPs:
  - none
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - Reuse prior findings before opening large numbers of docs.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: recursive session support breaks old flows -> Mitigation: keep flat sessions supported and cover with tests.
- Risk: new gates create excessive overhead -> Mitigation: scope them to major governed work, not quick mode.
- Risk: knowledge search drifts into noisy output -> Mitigation: keep outputs concise and indexed by doc type/id/path.

## Verification Plan
- Unit: `make test-scripts`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - `make knowledge-index`
  - `make doctor`
  - `make all`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
