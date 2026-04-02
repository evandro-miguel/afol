---
doc_type: spec
id: 260306_context-driven-execution-commands_spec_01
status: active
owners:
- orchestrator
created_at: '2026-03-07T00:28:26Z'
updated_at: '2026-03-06T22:04:27-03:00'
roadmap_feature: F-08
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - .agents/scripts
  - docs/arc
  - .agents/wb
  - runtime mirrors
  packages:
  - agents CLI
  - runtime adapters
risk_level: medium
---

# SPEC: context-driven-execution-commands

## 1) Feature Intent
- Outcome: Add a context-driven execution layer that turns existing governance artifacts into operator-friendly commands for setup, status, implementation, review, and logical revert.
- Why now: The scaffold already has roadmap-first governance, runtime compatibility, and reusable knowledge. The next gap is making those capabilities easier to consume consistently during real delivery work.
- Roadmap feature: `F-08`
- Role of this spec: parent

## 2) Problem
- The current scaffold exposes strong primitives, but operators still need to know too much about individual files, paths, and command sequencing.
- Runtime-facing UX is weaker than the governance model beneath it, which makes the system feel harder to adopt than it actually is.
- Directly importing Conductor's `tracks/` structure would duplicate state that the scaffold already manages through roadmap, specs, and workbench sessions.

## 3) Users and User Journey
Primary users:
- Project maintainers defining execution flows for downstream repos.
- Human operators using the scaffold through OpenCode, Codex, Qwen, or Gemini-facing adapters.
- Agents that need deterministic access to the right context without token-heavy rediscovery.

User journey:
1. A project defines canonical context for product, guidelines, tech stack, workflow, and roadmap within the `.agents` governance model.
2. An operator starts or resumes work and asks for the next governed action instead of manually locating the right workbench artifacts.
3. The system resolves the relevant context, routes the operator into the next task or review action, and records execution evidence in existing workbench/report structures.
4. If the work must be reversed, the system reverts the logical work unit while keeping workbench state synchronized.

Failure or friction points:
- Operator cannot tell which artifact is canonical -> the command layer must resolve named artifacts consistently.
- Runtime adapters drift in behavior -> command semantics must stay canonical above adapter-specific syntax.
- The system duplicates workbench state in a second tree -> this feature must explicitly forbid that.

## 4) Experience and Behavior
- Expected behavior:
  - A shared artifact-resolution layer maps logical names such as `workflow`, `product`, `active_plan`, and `active_task` to canonical files.
  - A canonical project-context set defines reusable high-level context without replacing roadmap/spec/workbench governance.
  - `status` reports the next governed action, current session context, pending tasks, and blockers in a compact format.
  - `implement` executes from approved plan/task artifacts and follows workflow rules rather than ad hoc command sequences.
  - `review` evaluates work against plan, spec, workflow, and guidelines, not just raw diffs.
  - `revert` operates on logical work units such as task, phase, pack, or session, using git as supporting evidence rather than the only source of truth.
- Boundaries:
  - This feature does not create a separate `conductor/` or `tracks/` tree.
  - This feature does not replace roadmap-first governance, workbench artifacts, or telemetry.
  - Runtime adapters stay thin and secret-free.

## 5) Scope
In scope:
- Define the feature philosophy and operator journey for context-driven execution commands.
- Define the canonical project-context artifacts and artifact-resolution layer.
- Define phased command behavior for `status`, `implement`, `review`, and `revert`.
- Define runtime-parity expectations for OpenCode, Codex, Qwen, and Gemini-facing adapters.

Out of scope:
- Rebuilding the repository around Conductor's directory model.
- Mandatory commit-per-task or git-notes workflows.
- Runtime-specific credential, auth-state, or user-local configuration flows.

## 6) Child Spec Strategy
- Child specs required: yes
- Decomposition rule:
  - Split this feature whenever one capability introduces its own operator contract, data model, or runtime integration boundary.
- Planned child specs:
  - `260306_artifact-resolution-layer_spec_01` -> define logical artifact names, precedence, and lookup rules.
  - `260306_project-context-canon-and-setup_spec_01` -> define canonical context documents and setup/resume behavior.
  - `260306_guided-status-and-implementation_spec_01` -> define task/status execution flows.
  - `260306_review-and-logical-revert_spec_01` -> define governed review and revert semantics.
  - `260306_runtime-command-parity_spec_01` -> define adapter-facing parity guarantees.

## 7) Constraints and Assumptions
- Assumptions:
  - Existing workbench documents remain the durable execution layer.
  - Existing telemetry, patterns, and knowledge systems should be reused rather than bypassed.
- Constraints:
  - Compatibility: must preserve current OpenCode, Codex, and Qwen primary-runtime contract while remaining adaptable to Gemini-facing integrations.
  - Operational: commands must work with active sessions, optional packs, and governed roadmap/spec requirements.
  - Security/privacy: committed runtime files must remain secret-free and traceable to canonical governance docs.

## 8) Acceptance
- Success looks like:
  - The scaffold has a clear, non-duplicative command architecture for context-driven execution.
  - Operators can follow setup/status/implement/review/revert flows without rediscovering repo structure manually.
  - Child specs divide the implementation into reviewable, low-blast-radius tracks.
- Review questions:
  - Does this spec define operator behavior without falling into implementation code?
  - Does it make clear why the scaffold should adopt Conductor ideas selectively rather than wholesale?

## 9) Risks and Tradeoffs
- Risk: a second governance system emerges by accident -> Mitigation: keep `docs/arc`, `.agents/wb`, and runtime mirrors canonical; forbid parallel track trees.
- Risk: command UX becomes runtime-specific -> Mitigation: define semantics in canonical specs first and adapters second.
- Tradeoff: introducing a canonical project-context layer adds more docs -> Why accepted: it reduces repeated prompt context and gives commands a stable contract.

## 10) Rollout and Lifecycle
- Rollout approach:
  - Deliver the feature in child-spec phases, starting with artifact resolution and canonical project context, then moving to operator commands.
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`.
- Backout or deferral:
  - The feature can stop after artifact resolution and `status` if deeper command workflows prove too large for one cycle.

## 11) Verification Philosophy
- Evidence expected from delivery:
  - Command-level documentation and script behavior align.
  - Workbench plans/tasks/reports prove the new command flows can run without duplicating state.
  - Runtime mirrors and adapters remain consistent with canonical guidance.
- Open questions:
  - Q-01 Which parts of project context should live in `docs/arc/` versus runtime-facing mirrors only?
  - Q-02 How much git dependence is acceptable for logical revert before it weakens workbench authority?

## 12) Acceptance Checklist
- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
