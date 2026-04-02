---
doc_type: roadmap
id: 260223_0000_arc_roadmap_01
status: active
owners:
- orchestrator
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-03-23T18:05:33-03:00'
---

# GENERAL ROADMAP

## 1) North Star
- Turn this scaffold into a roadmap-first delivery system for all downstream projects.
- Make product intent explicit before execution: every relevant feature must exist in the roadmap, have a governing spec, and define what success means before code starts.
- Treat roadmap and specs as the canonical product philosophy layer, while workstreams remain the execution layer.

## 2) Mandatory Operating Model
- No feature implementation starts without a roadmap entry.
- No roadmap feature is executable without a linked parent spec.
- Large features should be decomposed into child specs when that improves clarity, coordination, or reviewability.
- Roadmap items track feature status and completion tasks.
- Specs describe intent, expected behavior, user journey, constraints, risks, and acceptance; they do not contain implementation code.
- Workstream plans, tasks, logs, and reports must link back to the roadmap feature and its governing spec.

## 3) Current Phase
- Phase: Roadmap-First Governance Foundation
- Goal: Replace the current optional roadmap/spec flow with a mandatory feature-definition system that every bootstrapped project must follow.
- Definition of done:
  - The scaffold ships with a mandatory roadmap structure centered on features.
  - The scaffold ships with a mandatory spec model centered on feature intent and user journey.
  - Large features have a documented child-spec decomposition rule.
  - Project tooling refuses to treat implementation as valid when roadmap/spec prerequisites are missing.

## 4) Feature Portfolio

### F-01 Roadmap-First Governance
- Status: done
- Why: The scaffold currently supports roadmap/spec usage, but does not make them the required source of truth for product direction.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Exit criteria:
  - Every repository created from this scaffold contains a usable roadmap at bootstrap time.
  - The roadmap represents the complete feature backlog, not an optional summary.
  - Feature progress can be read directly from roadmap state.
- Delivery tasks:
  - [x] Define the governance philosophy for roadmap-first delivery.
  - [x] Rewrite the roadmap template around features, status, and linked specs.
  - [x] Update project rules so roadmap maintenance is mandatory.

### F-02 Feature Specification System
- Status: done
- Why: Features need a durable product definition that explains intent, user expectations, and boundaries before execution details appear in workstreams.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Exit criteria:
  - Every roadmap feature references a parent spec.
  - Parent specs define expected behavior, user journey, scope, constraints, and acceptance.
  - Spec documentation becomes the required pre-implementation artifact for meaningful work.
- Delivery tasks:
  - [x] Define the parent-spec philosophy for feature work.
  - [x] Rewrite spec templates to favor behavior, experience, and intent over implementation detail.
  - [x] Keep `spec-lite` available as a discretionary workstream-level option when a lighter local refinement is the better fit.

### F-03 Child Spec Decomposition
- Status: planned
- Why: Large features need sub-specifications so teams can execute in bounded objectives without losing the parent feature narrative.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Exit criteria:
  - Large features can declare child specs before implementation starts.
  - Child specs inherit the parent feature goal while narrowing one objective.
  - Teams can trace execution from roadmap feature -> parent spec -> child spec -> workstream.
- Delivery tasks:
  - [x] Define the parent/child spec relationship.
  - [ ] Add naming and linking rules for child specs.
  - [ ] Define the threshold that requires decomposition.

### F-04 Workflow Enforcement
- Status: done
- Why: Governance only works if the scaffold enforces it in work creation, verification, and bootstrap flows.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Required child specs before execution:
  - Workflow gate enforcement
  - Bootstrap baseline enforcement
  - Verification guardrails
- Exit criteria:
  - New workstreams cannot bypass roadmap/spec linkage for non-trivial work.
  - Doctor/verify checks detect missing roadmap/spec prerequisites.
  - Bootstrap creates all mandatory strategic documents.
- Delivery tasks:
  - [x] Update `agents-new` and workbench rules for roadmap/spec references.
  - [x] Add doctor/verify checks for roadmap and spec presence.
  - [x] Ensure bootstrap initializes the new governance baseline.

### F-05 Reliability and System Parity
- Status: done
- Why: The scaffold still has tooling gaps in telemetry, verification scope, test execution, and CI. Those should be fixed under the new governance model rather than as unrelated patches.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Required child specs before execution:
  - Telemetry parity
  - Test and CI hardening
  - Validation semantics
- Exit criteria:
  - Telemetry reflects real command outcomes.
  - Validation commands match documented guarantees.
  - Test automation is trustworthy for adopters of the scaffold.
- Delivery tasks:
  - [x] Fix telemetry parity gaps (`tool_exec`, `session_end`, failure capture).
  - [x] Make `make all` a truthful full-validation command.
  - [x] Align the test strategy, actual test runner, and CI baseline.

### F-06 Primary Runtime Compatibility
- Status: done
- Why: This scaffold is intended to serve OpenCode, Codex, and Qwen first, but only Codex/Qwen-style mirrors are modeled directly today. Runtime-specific instructions, config entrypoints, approval modes, and agent/subagent conventions are not yet standardized across the primary target runtimes.
- Governing spec: `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`
- Exit criteria:
  - OpenCode is treated as a first-class runtime in bootstrap, docs, and project structure.
  - The scaffold documents a shared compatibility contract for OpenCode, Codex, and Qwen.
  - Runtime-specific committed files stay secret-free and derive from the same canonical governance source.
  - Project owners can understand which runtime-specific files are committed, generated, or local-only.
- Delivery tasks:
  - [x] Research official runtime capabilities for OpenCode, Codex, and Qwen.
  - [x] Define the committed compatibility contract for the three primary runtimes.
  - [x] Add first-class OpenCode support to sync/bootstrap/runtime docs.
  - [x] Document runtime-specific config boundaries, especially what must never be committed.
  - [x] Add runtime health checks and tool-catalog parity for the primary runtime contract.

### F-07 Execution Intelligence and Knowledge System
- Status: done
- Why: The scaffold still depends too much on agent memory and manual discipline. Planning can finish without structured exploration, sessions cannot reuse prior research efficiently, and final closure does not require a proper post-mortem. That increases token waste, weakens traceability, and makes multi-agent work less reliable.
- Governing spec: `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md`
- Child spec policy:
  - Required: yes
  - Child specs:
    - `260306_planning-rigor-and-explorer-gates_spec_01`
    - `260306_knowledge-reuse-and-token-efficiency_spec_01`
    - `260306_session-pack-structure-and-postmortem_spec_01`
- Exit criteria:
  - Plans cannot be considered complete without structured pre-plan exploration artifacts.
  - Agents can quickly find prior research, brainstorms, explorer checks, and post-mortems with low-token discovery paths.
  - Sessions can group multiple major plan tracks in dedicated pack folders without losing verification coverage.
  - Final session closure requires a completed post-mortem.
- Delivery tasks:
  - [x] Define the parent feature philosophy and child spec boundaries.
  - [x] Make brainstorm and explorer-check artifacts part of the governed planning flow.
  - [x] Add reusable knowledge indexing/search for prior research artifacts.
  - [x] Add optional session pack folders for multiple major plans inside one session.
  - [x] Require post-mortem completion before final session closure.

### F-08 Context-Driven Execution Commands
- Status: done
- Why: The scaffold now has strong governance, reusable knowledge, and runtime compatibility, but it still exposes too much of that power through low-level repo commands. Operators do not yet get a unified, context-driven execution layer for setup/resume, next-step status, guided implementation, review, and logical revert. That slows adoption and makes runtime UX less consistent than it should be.
- Governing spec: `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md`
- Child spec policy:
  - Required: yes
  - Child specs:
    - `260306_artifact-resolution-layer_spec_01`
    - `260306_project-context-canon-and-setup_spec_01`
    - `260306_guided-status-and-implementation_spec_01`
    - `260306_review-and-logical-revert_spec_01`
    - `260306_runtime-command-parity_spec_01`
- Exit criteria:
  - Canonical project context artifacts exist for product, guidelines, tech stack, workflow, and artifact indexing without creating a second governance tree.
  - Scripts can resolve logical artifacts such as active plan, workflow, roadmap, and parent spec without hardcoded command-specific path rules.
  - Operators can ask for the next governed action, execute the next task, review against specs and guidelines, and revert logical work units rather than raw files only.
  - The command model is portable across OpenCode, Codex, Qwen, and Gemini-facing adapters while keeping `AGENTS.md` and `.agents/*` canonical.
- Delivery tasks:
  - [x] Define the parent feature philosophy, user journey, and non-goals for context-driven execution commands.
  - [x] Design the artifact resolution layer and canonical project-context document set.
  - [x] Plan the `status`, `implement`, `review`, and `revert` command families in phased delivery order.
  - [x] Define runtime adapter rules so command semantics stay aligned across primary runtimes.
  - [x] Prove the feature can reuse existing workbench, telemetry, and knowledge systems instead of duplicating Conductor's track structure.

### F-09 Persistent Planning Memory and Session Catchup
- Status: planned
- Why: The scaffold now has governed workbench artifacts, but it still relies on operators to manually keep plan, findings, and progress synchronized while exploring. Resume ergonomics are also weaker than they should be: there is no first-class catchup command that reconciles workbench state with git drift, and there is no lightweight cadence guard to force durable note capture after exploration bursts.
- Governing spec: `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md`
- Exit criteria:
  - Operators get a native catchup/resume flow that compares workbench artifacts with current repo changes before execution continues.
  - The system documents and enforces a canonical mapping between lightweight working-memory concepts and the richer workbench artifacts.
  - Major sessions can prove that exploration findings were persisted to durable artifacts before planning or implementation decisions continue.
  - Untrusted external content is explicitly routed to research/findings artifacts rather than plan files that may be re-read frequently by runtimes.
- Delivery tasks:
  - [ ] Define the product model for native persistent working memory without duplicating governance trees in project root.
  - [ ] Add a session catchup command or equivalent workflow that highlights unsynced plan/task/log/report state against `git status` and recent diffs.
  - [ ] Define freshness and cadence rules for updating research/log artifacts during exploration-heavy work.
  - [ ] Add status/review/verify signals for stale or missing working-memory artifacts in major sessions.
  - [ ] Update operator docs so the three-file mental model maps cleanly onto workbench `plan`/`research`/`log` artifacts.

### F-10 Universal Skills Runtime Integration
- Status: planned
- Why: The scaffold already ships a basic `skills-sync`, but the upstream universal-skills system is more mature about lockfiles, profiles, host-specific installs, and reproducible project adoption. The scaffold should absorb that model so interactive runtimes such as Codex, OpenCode, Gemini CLI, and Claude Code can bootstrap the right skill surface deterministically.
- Governing spec: `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md`
- Exit criteria:
  - Project skill selection can be pinned to a source repo/ref contract instead of only a mutable branch/skill list.
  - The scaffold can describe and install skill sets by profile or explicit skill list for the supported interactive runtimes.
  - Bootstrap can prepare downstream repos with a reproducible skills lock/config baseline.
  - Skills validation can distinguish source contract issues, install drift, and runtime-target compatibility problems.
- Delivery tasks:
  - [ ] Define the product contract for lockfile/profile-based universal-skills integration in this scaffold.
  - [ ] Upgrade `skills-sync` to support pinned source metadata, profiles, and on-demand skill install semantics.
  - [ ] Integrate the new skills model into bootstrap for fresh and partial installs.
  - [ ] Add validation and test coverage for the supported runtime targets and lockfile semantics.
  - [ ] Update operator docs so project maintainers understand local vs upstream skill ownership and upgrade flow.

### F-11 Current-State Maps and Goal-State Governance
- Status: planned
- Why: The scaffold already distinguishes roadmap/spec/workbench governance from execution, but it still lacks an explicit contract for separating descriptive current-state project maps from goal-state product and architecture intent. As downstream repos adopt heavier codemap and analysis surfaces under `docs/map/`, the scaffold needs to prevent those artifacts from being mistaken for roadmap/spec governance sources.
- Governing spec: `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
- Exit criteria:
  - `docs/map/` is explicitly defined as the current-state, descriptive, non-governance surface for repository maps, codemaps, and analysis evidence.
  - Desired-state docs remain outside `docs/map/` and stay canonical for architecture intent, roadmap, project brief, tech stack, ADRs, and feature specs.
  - Workstreams and operator docs explain when to consume `docs/map/` as evidence and when to use roadmap/specs as the governing source of truth.
  - Bootstrap and project documentation can explain the split without introducing a second planning or verification system.
- Delivery tasks:
  - [ ] Define the document taxonomy for current-state vs goal-state artifacts.
  - [ ] Define `docs/map/` boundaries, ownership, and refresh semantics.
  - [ ] Define how roadmap/spec/workbench flows may reference maps without promoting them to governance sources.
  - [ ] Plan the documentation, bootstrap, and command changes needed to adopt the split safely.

### F-12 ExecPlan-Native Planning System
- Status: planned
- Why: The scaffold already requires plans for major work, but the current `plan.md` is still too static and governance-oriented compared with the stronger ExecPlan pattern described for Codex. Plans should be living, self-contained, novice-guiding documents that remain executable from the plan file alone while still fitting this repo's roadmap/spec/workbench model.
- Governing spec: `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md`
- Exit criteria:
  - The scaffold has a canonical `PLANS.md` contract adapted to workbench-based planning.
  - `AGENTS.md` and operator docs explain when to use ExecPlans and where they live in this repo.
  - The plan template is upgraded with required living-document sections such as progress, discoveries, decisions, and outcomes.
  - Strict verification can detect final plans that lack required ExecPlan sections or a maintained progress checklist.
- Delivery tasks:
  - [ ] Define the adapted ExecPlan contract for this scaffold and how it maps into roadmap/spec/workbench artifacts.
  - [ ] Update `AGENTS.md`, README, workflow docs, and the plan template to reflect the ExecPlan model.
  - [ ] Add strict verification for required ExecPlan sections and living-plan progress tracking.
  - [ ] Add tests proving the new plan requirements are enforced and the template remains usable.

## 5) Prioritization
Score inputs:
- Governance leverage across all downstream repos
- Reduction of ambiguous or undocumented work
- Ability to enforce behavior automatically
- Risk reduction for future scaffold adopters

Tie-breaker:
- Prefer work that turns a currently optional behavior into an enforceable rule.

## 6) Risks
- Governance becomes too heavy for small tasks -> preserve a clearly defined quick path, but require roadmap/spec linkage for non-trivial work.
- Specs drift into implementation detail -> define product-philosophy boundaries explicitly and keep code out of specs.
- Teams create roadmap items without maintaining them -> add validation gates and review cadence.
- Enforcement arrives before templates are usable -> ship template/documentation changes before hard gates.
- Runtime-specific files diverge from canonical governance -> keep one source of truth and derive mirrors/adapters from it where possible.

## 7) Operating Cadence
- Weekly review:
  - Roadmap status changes
  - New features added or removed
  - Parent specs created or updated
  - Child specs required for upcoming work
  - Reliability gaps still blocking trust in the scaffold

---
*Roadmap: `docs/arc/GENERAL-ROADMAP.md`*
