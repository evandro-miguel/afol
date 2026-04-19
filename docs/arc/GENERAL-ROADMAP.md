---
doc_type: roadmap
id: 260223_0000_arc_roadmap_01
status: active
owners:
- orchestrator
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-18T22:35:01-03:00'
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

- Status: done
- Why: Large features need sub-specifications so teams can execute in bounded objectives without losing the parent feature narrative.
- Governing spec: `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
- Exit criteria:
  - Large features can declare child specs before implementation starts.
  - Child specs inherit the parent feature goal while narrowing one objective.
  - Teams can trace execution from roadmap feature -> parent spec -> child spec -> workstream.
- Delivery tasks:
  - [x] Define the parent/child spec relationship.
  - [x] Add naming and linking rules for child specs.
  - [x] Define the threshold that requires decomposition.

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
  - [x] Make `just all` a truthful full-validation command.
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

- Status: done
- Why: The scaffold now has governed workbench artifacts, but it still relies on operators to manually keep plan, findings, and progress synchronized while exploring. Resume ergonomics are also weaker than they should be: there is no first-class catchup command that reconciles workbench state with git drift, and there is no lightweight cadence guard to force durable note capture after exploration bursts.
- Governing spec: `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md`
- Exit criteria:
  - Operators get a native catchup/resume flow that compares workbench artifacts with current repo changes before execution continues.
  - The system documents and enforces a canonical mapping between lightweight working-memory concepts and the richer workbench artifacts.
  - Major sessions can prove that exploration findings were persisted to durable artifacts before planning or implementation decisions continue.
  - Untrusted external content is explicitly routed to research/findings artifacts rather than plan files that may be re-read frequently by runtimes.
- Delivery tasks:
  - [x] Define the product model for native persistent working memory without duplicating governance trees in project root.
  - [x] Add a session catchup command or equivalent workflow that highlights unsynced plan/task/log/report state against `git status` and recent diffs.
  - [x] Define freshness and cadence rules for updating research/log artifacts during exploration-heavy work.
  - [x] Add status/review/verify signals for stale or missing working-memory artifacts in major sessions.
  - [x] Update operator docs so the three-file mental model maps cleanly onto workbench `plan`/`research`/`log` artifacts.

### F-10 Universal Skills Runtime Integration

- Status: done
- Why: The scaffold already ships a basic `skills-sync`, but the upstream universal-skills system is more mature about lockfiles, profiles, host-specific installs, and reproducible project adoption. The scaffold should absorb that model so interactive runtimes such as Codex, OpenCode, Gemini CLI, and Claude Code can bootstrap the right skill surface deterministically.
- Governing spec: `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md`
- Exit criteria:
  - Project skill selection can be pinned to a source repo/ref contract instead of only a mutable branch/skill list.
  - The scaffold can describe and install skill sets by profile or explicit skill list for the supported interactive runtimes.
  - Bootstrap can prepare downstream repos with a reproducible skills lock/config baseline.
  - Skills validation can distinguish source contract issues, install drift, and runtime-target compatibility problems.
- Delivery tasks:
  - [x] Define the product contract for lockfile/profile-based universal-skills integration in this scaffold.
  - [x] Upgrade `skills-sync` to support pinned source metadata, profiles, and on-demand skill install semantics.
  - [x] Integrate the new skills model into bootstrap for fresh and partial installs.
  - [x] Add validation and test coverage for the supported runtime targets and lockfile semantics.
  - [x] Update operator docs so project maintainers understand local vs upstream skill ownership and upgrade flow.

### F-11 Current-State Maps and Goal-State Governance

- Status: done
- Why: The scaffold already distinguishes roadmap/spec/workbench governance from execution, but it still lacks an explicit contract for separating descriptive current-state project maps from goal-state product and architecture intent. As downstream repos adopt heavier codemap and analysis surfaces under `docs/map/`, the scaffold needs to prevent those artifacts from being mistaken for roadmap/spec governance sources.
- Governing spec: `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
- Exit criteria:
  - `docs/map/` is explicitly defined as the current-state, descriptive, non-governance surface for repository maps, codemaps, and analysis evidence.
  - Desired-state docs remain outside `docs/map/` and stay canonical for architecture intent, roadmap, project brief, tech stack, ADRs, and feature specs.
  - Workstreams and operator docs explain when to consume `docs/map/` as evidence and when to use roadmap/specs as the governing source of truth.
  - Bootstrap and project documentation can explain the split without introducing a second planning or verification system.
- Delivery tasks:
  - [x] Define the document taxonomy for current-state vs goal-state artifacts.
  - [x] Define `docs/map/` boundaries, ownership, and refresh semantics.
  - [x] Define how roadmap/spec/workbench flows may reference maps without promoting them to governance sources.
  - [x] Plan the documentation, bootstrap, and command changes needed to adopt the split safely.

### F-12 ExecPlan-Native Planning System

- Status: done
- Why: The scaffold already requires plans for major work, but the current `plan.md` is still too static and governance-oriented compared with the stronger ExecPlan pattern described for Codex. Plans should be living, self-contained, novice-guiding documents that remain executable from the plan file alone while still fitting this repo's roadmap/spec/workbench model.
- Governing spec: `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md`
- Exit criteria:
  - The scaffold has a canonical `PLANS.md` contract adapted to workbench-based planning.
  - `AGENTS.md` and operator docs explain when to use ExecPlans and where they live in this repo.
  - The plan template is upgraded with required living-document sections such as progress, discoveries, decisions, and outcomes.
  - Strict verification can detect final plans that lack required ExecPlan sections or a maintained progress checklist.
- Delivery tasks:
  - [x] Define the adapted ExecPlan contract for this scaffold and how it maps into roadmap/spec/workbench artifacts.
  - [x] Update `AGENTS.md`, README, workflow docs, and the plan template to reflect the ExecPlan model.
  - [x] Add strict verification for required ExecPlan sections and living-plan progress tracking.
  - [x] Add tests proving the new plan requirements are enforced and the template remains usable.

### F-13 Agentic Runtime Restructure

- Status: done
- Why: The scaffold has outgrown a collection of standalone Python scripts, manually mirrored tool metadata, and documentation-only discovery. Operators need one coherent agentic runtime with a shared service layer, stable CLI compatibility, MCP-native tool access, reversible mutation primitives, and generated/validated documentation surfaces.
- Governing spec: `docs/arc/SPECS/260411_agentic-runtime-restructure_spec_01.md`
- Exit criteria:
  - The operational implementation lives in a single UV-managed runtime package under `.agents/runtime/`.
  - `.agents/agents <command>` remains the stable public CLI while delegating to the new runtime.
  - MCP tools/resources/prompts are exposed from the same runtime service layer as the CLI.
  - Tool catalog, docs, skills, current-state maps, Make targets, and CI all describe and validate the new runtime.
  - Legacy standalone scripts are either compatibility shims or archived after parity is proven.
- Delivery tasks:
  - [x] Define the parent feature philosophy and migration boundaries for the total runtime restructure.
  - [x] Build the shared runtime package and compatibility CLI adapter.
  - [x] Integrate MCP-native tools, resources, prompts, journaling, and undo support.
  - [x] Migrate or wrap every existing `.agents/agents` command through the shared registry.
    - [x] Start with `status`, `knowledge pull`, and `session catchup`, matching the source-kit phase-2 recommendation.
    - [x] Add parity tests before redirecting each legacy alias through the runtime registry.
    - [x] Promote the proven wrapper pattern to all public command aliases, including `implement`, `review`, `revert`, and `skills-sync`.
  - [x] Update docs, skills, current-state maps, Make targets, and CI gates.
  - [x] Archive superseded standalone script surfaces only after command parity and strict verification pass.
    - [x] No standalone script was archived in this batch because public commands remain compatibility delegates; archive only per script after a future native port fully supersedes it.

### F-14 Spec Child And Spec Test Strategy Artifacts

- Status: done
- Why: `spec-lite` no longer communicates the intended rigor of local feature
  decomposition, and test work needs a written strategy artifact before agents
  start creating or running tests. The scaffold should make child feature
  refinement explicit through `spec-child` and require `spec-test` to record
  what a test must prove before implementation.
- Governing spec: `docs/arc/SPECS/260412_1110_spec-child-and-spec-test-governance_spec_01.md`
- Exit criteria:
  - `spec-child` is the canonical future name for child/local feature
    specification artifacts that refine a parent spec.
  - `spec-test` is defined as a mutable test strategy artifact, not test code,
    that captures user journeys, click paths, performance expectations, target
    tooling, construction notes, expected results, and evidence criteria before
    testing starts.
  - Feature-level planning has a durable folder convention for one or more
    `spec-test` artifacts per feature, while workbench sessions can link to the
    relevant strategy.
  - Historical `spec-lite` artifacts remain readable during migration, with a
    planned compatibility alias instead of an immediate breaking rename.
- Delivery tasks:
  - [x] Define the naming, frontmatter, link, and folder convention for
    `spec-child` and `spec-test`.
  - [x] Update future templates and governance docs to replace `spec-lite`
    with `spec-child` as the canonical child-spec artifact.
  - [x] Add a `spec-test` template that records the expected journey,
    clicks/actions, performance expectations, target technology, test
    construction strategy, expected output, and evidence format.
  - [x] Plan validation so test-focused workstreams link to a `spec-test`
    before test implementation begins.
  - [x] Keep `spec-lite` as a backwards-compatible historical alias until
    migration and documentation parity are proven.

### F-15 Repo-Wide Simplification and Runtime Parity Cleanup

- Status: complete
- Why: The scaffold now has a central runtime, an 80% scripts coverage gate, and
  clear current-state vs goal-state documentation rules, but the repo still has
  stale current-state maps, a legacy generated structure surface that belongs in
  `docs/map/structure/`, compatibility command metadata that can drift, and
  several Python command modules that still need complexity reduction under
  proven parity.
- Governing spec: `docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md`
- Child spec policy:
  - Required: yes
  - Child specs should isolate map boundary cleanup, runtime registry parity,
    and Python command simplification when each slice begins execution.
- Exit criteria:
  - `docs/map/` is the only durable current-state repository map surface.
  - `docs/map/structure/` is the canonical current-state structure index and
    `docs/arc/structure/` is no longer maintained as a competing current-state
    surface.
  - `.agents/agents` and `.agents/agents-mcp` remain stable thin launchers while
    command metadata and compatibility behavior are validated from a single
    runtime registry path where practical.
  - Complexity reductions land in small batches with focused parity tests and no
    reduction below the 80% scripts coverage gate.
  - Legacy script paths are archived only after replacement behavior has
    executable parity evidence.
- Delivery tasks:
  - [x] Create the F-15 governed parent spec and workbench execution session.
  - [x] Sync root runtime mirrors from `AGENTS.md` after the F-15 governance
    update.
  - [x] Reconcile current-state documentation so `docs/map/` owns map evidence.
  - [x] Consolidate runtime command metadata and wrapper parity without changing
    public command semantics.
  - [x] Reduce Python command complexity in bounded, tested slices.
  - [x] Refresh docs, indexes, and maps after code behavior is proven.
  - [x] Close with strict workbench verification, `just lint`, and the relevant
    Python/runtime gates.

### F-16 Project Template Source Separation

- Status: complete
- Why: The scaffold needs one visible, sanitized source tree for the default
  project folder installed into downstream repos, separate from this repository's
  development workbench, tests, maps, caches, and historical governance.
- Governing spec: `docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md`
- Exit criteria:
  - `src/project-template/` is the canonical downstream project baseline.
  - Bootstrap copies from the template source instead of directly from the live
    development repo root.
  - Export tests prove local history, caches, telemetry events, and generated
    repo-specific artifacts are not shipped to downstream projects.
  - The final script refactor pass removes duplicate responsibilities and keeps
    every public script purpose-defined.
- Delivery tasks:
  - [ ] Create the sanitized project-template source tree.
  - [ ] Rewire bootstrap and tests around the template source.
  - [ ] Update only the minimal operator docs for the new boundary.
  - [ ] Run the final `refactor-workflows` script simplification pass.
  - [ ] Verify with lint, focused tests, and a dry-run bootstrap.

### F-17 Just Command Runner Migration

- Status: planned
- Why: The scaffold currently exposes operator workflows through Make targets,
  but `just` is already available locally and better matches the repo's
  command-runner use case. The migration must preserve bootstrap, CI, template,
  documentation, and 80% script coverage behavior while removing Make as a
  required command surface.
- Governing spec: `docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md`
- Child spec policy:
  - Required: yes
  - Child specs should isolate command parity, bootstrap/template wiring, and
    documentation/catalog cleanup when each slice begins execution.
- Exit criteria:
  - `just` is the canonical command runner for scaffold operations.
  - Every former Make target has a tested `just` equivalent or an explicitly
    documented replacement.
  - Bootstrap and `src/project-template/` generate and validate the Just-based
    command surface without relying on Make.
  - CI and operator docs use `just all` as the full-validation command.
  - Script tests keep the 80% coverage gate and the migrated commands run with
    behavior equivalent to the previous Make targets.
- Delivery tasks:
  - [x] Create a governed workbench session and execution plan for the Just
        migration.
  - [x] Add Justfile command parity for the existing scaffold targets.
  - [x] Update bootstrap, template, tests, and CI to prefer Just.
  - [x] Clean Make references from canonical docs, catalog metadata, and runtime
        mirrors after command parity is proven.
  - [x] Verify with `just all`, focused bootstrap/template tests, and the 80%
        scripts coverage gate.

### F-18 Agent Governance Preflight and Recurrence Guardrails

- Status: planned
- Why: Agents still rely on manual discipline to check whether a requested plan
  already has a governing spec, whether a user-reported problem has happened
  before, whether similar implementation already exists, and whether delegated
  agents actually received and followed all applicable `.agents/rules/`.
- Governing spec: `docs/arc/SPECS/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md`
- Child spec policy:
  - Required: yes
  - Child specs should isolate plan/spec preflight, recurring-problem
    escalation, similar-system detection, and orchestrator rule enforcement.
- Exit criteria:
  - Every non-trivial plan begins by checking whether a governing roadmap
    feature and parent spec already exist.
  - User-reported repeated problems trigger prior-lesson lookup, heavier
    verification, and a new or updated general/specific rule when prevention is
    feasible.
  - New function work includes similar-system discovery; when a similar system
    exists, the agent points to it in code and spec evidence, avoids modifying
    it by default, and records future refactor debt for both the old and new
    code paths.
  - The orchestrator loads all applicable `.agents/rules/` before routing work
    and passes enforceable rule context to every agent it coordinates.
- Delivery tasks:
  - [ ] Define the preflight contract and acceptance checks in the parent spec.
  - [ ] Add implementation support for roadmap/spec lookup before planning.
  - [ ] Add recurring-problem lookup and heavy verification escalation.
  - [ ] Add similar-system discovery and future-refactor debt capture.
  - [ ] Add applicable-rule resolution by touched element type, including
        feature/spec/workbench/skill/runtime/code surfaces.
  - [ ] Add orchestrator rule-loading and delegated-agent enforcement.
  - [ ] Update affected project-local skills/docs and leave a pending
        universal-skills propagation item for the new agent behavior.
  - [ ] Verify with focused tests, strict workbench validation, and `just lint`.

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
