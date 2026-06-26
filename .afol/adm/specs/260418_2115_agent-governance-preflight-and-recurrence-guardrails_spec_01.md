---
doc_type: spec
id: 260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01
theme: agent-governance-preflight-and-recurrence-guardrails
status: active
implementation_note: "Partially delivered (2026-06-14): afol preflight command (cli/commands/preflight.ts) performs read-only governance search — spec lookup (.afol/adm/specs), lesson lookup (docs/lessons), similar-system discovery (rg over cli/ + specs), and rule resolution (.afol/adm/rules) with a gaps report. Satisfies §8.2, §8.6, §8.8 (detection), §8.9, §8.11 (resolution). Child plan-task-execution-integrity (260509) already final. Remaining as documented workflow / future children: decision-intake+challenge (§8.4/8.7, in docs/standards/decision-intake.md), recurring-problem heavy-verification + rule creation (§8.8 action side), orchestrator rule injection into delegated agents (§8.11 enforcement side)."
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define the plan/spec preflight, recurring-problem escalation, similar-system
  discovery, direct-execution plan/task integrity, and rule-enforcement contract for
  agents.
created_at: '2026-04-18T21:15:13-03:00'
updated_at: '2026-06-14T00:00:00-03:00'
roadmap_feature: F-18
spec_role: parent
parent_spec: ''
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
scope:
  repo_areas:
  - AGENTS.md
  - .afol/adm/rules
  - .agents/scripts
  - .agents/runtime
  - .agents/skills
  - .afol/adm
  - docs/lessons
  - docs/templates
  packages:
  - orchestration
  - planning rigor
  - recurring problem prevention
  - similar system discovery
  - plan/task execution integrity
  - task lifecycle state model
  - decision intake
  - adversarial challenge
  - optional priority scoring
risk_level: medium
---

# SPEC: Agent Governance Preflight and Recurrence Guardrails

## 1) Feature Intent

- Outcome: agents must prove they checked existing governance, prior problems,
  similar implementation, and applicable rules before creating plans,
  escalating recurring bugs, adding new functions, or delegating work.
- Outcome: generated plans and tasks must route agents into direct execution of
  the requested work, not into tasks whose deliverable is creating, drafting, or
  researching another plan.
- Outcome: task states must distinguish blocked work, moved work, implemented
  but untested work, tested work still awaiting spec/user-experience validation,
  and fully complete work.
- Why now: the scaffold already has roadmap/spec governance, lessons, rules,
  workbench verification, and knowledge reuse, but those surfaces are still easy
  for an agent to skip unless the operator reminds it.
- Roadmap feature: `F-18`
- Role of this spec: parent feature spec for enforcement behavior.

## 2) Problem

- Planning can start without checking whether the requested work already has a
  governing spec or belongs under an existing roadmap feature.
- A user can report a problem that happened before, but the agent may treat it
  like a one-off bug instead of searching lessons, applying heavier
  verification, and adding a prevention rule.
- Agents can implement a new function without checking whether a similar system
  already exists, increasing duplication and future refactor cost.
- The orchestrator can route work to agents without explicitly loading and
  enforcing every applicable `.afol/adm/rules/` file.
- Plans and task boards can still encode meta-work such as creating the plan,
  researching so a later real plan can be made, or assigning subagents to write
  plan artifacts instead of executing the approved slice.
- A single done marker can hide materially different states: code written but
  untested, tests written but spec/user-experience validation missing, moved
  work, or blocked work.
- Product-shaped or ambiguous work can jump to benchmark, plan, or
  implementation before the agent has framed the user, outcome, non-goals,
  assumptions, and decision appetite.
- Prioritization can become either too fuzzy or too ceremonial: agents may hide
  trade-offs in intuition, or force a score when the user asked for speed.

## 3) Users and User Journey

Primary users:

- Project operators who expect governed agent behavior without repeated manual
  reminders.
- Orchestrator agents coordinating implementation, review, and verification.
- Execution agents receiving delegated work.

User journey:

1. The user asks for a plan, reports a bug, or requests a new function.
2. The orchestrator runs the relevant governance preflight before planning or
   routing execution.
3. The agent cites existing specs, prior lessons, similar systems, and rules in
   the workstream evidence or explains why none were found.
4. Execution proceeds with the required guardrails already attached to the task.

Failure or friction points:

- Missing spec -> the agent must point to the gap and either update/create the
  governing spec or keep the plan in conversation until governance exists.
- Repeated problem -> the agent must run heavier verification, add or update a
  prevention rule when feasible, and capture a lesson.
- Similar system found -> the agent must cite it and record refactor debt, but
  must not modify that existing system unless the user explicitly scopes that
  refactor.
- Delegated agent lacks rules -> the orchestrator must stop routing and resend
  the full applicable rule context.

## 4) Experience and Behavior

Expected behavior:

- Before every non-trivial plan, the agent checks `.afol/adm/roadmap/GENERAL-ROADMAP.md`
  and `.afol/adm/specs/` for an existing roadmap feature and parent spec.
- Workbench plans describe the direct execution path for the requested work.
  They do not include steps whose only deliverable is making the plan, preparing
  a later plan, or doing broad research so a future real plan can exist.
- Workbench task files assign executable work to agents. They do not assign
  tasks to create/write the plan or research the plan unless research is the
  user-requested deliverable or the smallest blocking proof before safe
  execution.
- Canonical task states are `[ ] pending`, `[/] in_progress`, `[!] problem`,
  `[>] moved`, `[%] implemented_untested`,
  `[&] tested_needs_spec_validation`, and `[x] done`.
- `[>]` always records the destination plan/session/task and reason. It means
  moved or deferred, not a silent skip.
- `[x]` is reserved for work that is complete for the task type. Code,
  user-facing, or UI work requires implementation, test proof, and
  spec/user-experience validation when applicable; tasks that do not require a
  test or user-experience check must state the N/A reason.
- Before benchmark or execution for ambiguous or product-shaped work,
  the agent creates a compact decision intake: user, behavior or evidence,
  observable outcome, constraints, non-goals, reversibility, assumptions, and
  appetite for the first slice.
- When evidence is fragmented, the agent builds or requests a short signal pack
  from interviews or user notes, analytics, support/sales/operator reports,
  prior lessons/issues/workbench notes, and external signals.
- The agent separates opportunity from solution: opportunity is judged by pain,
  frequency, customer relevance, strategic fit, and evidence strength; solution
  is judged only after by impact, validation speed, confidence, reversibility,
  dependencies, maintenance, and debt.
- Before choosing a build path, the agent maps assumptions for desirability,
  usability, feasibility, and viability, then targets the riskiest assumption
  first when possible.
- Benchmarking must happen after the problem frame and first solution
  hypothesis exist. If benchmark must happen earlier, the agent labels it as
  exploratory context and does not let it replace user/outcome framing.
- A challenge checkpoint is mandatory before shaping a substantial plan:
  critical assumption, rival hypothesis, pre-mortem failure mode, simpler
  manual alternative, one-way/two-way-door classification, and scope cut.
- Prioritization defaults to qualitative agent judgment based on repeated user
  emphasis, blockers, risk, reversibility, and validation speed. Formal scoring
  is optional and should be used only when the user asks for it or when
  trade-offs remain unclear.
- When formal scoring is used, it separates importance from sequence and
  includes rubrics and evidence notes, not only ordinal preferences.
- Slices must be cut by fixed appetite and vertical proof of value. One-day and
  three-day slices are preferred planning cuts when the user asks for a lean MVP
  or fast validation.
- Before fixing a user-reported recurring problem, the agent searches
  `docs/lessons/`, `.afol/adm/rules/`, active workbench artifacts, and knowledge
  surfaces for prior occurrences.
- If the problem has happened before, the agent uses a heavier verification
  path than a normal one-off fix and adds a general or specific prevention rule
  when feasible.
- Before adding a new function, the agent searches for similar code,
  workflows, command handlers, rules, and specs; the evidence must cite both
  code and spec surfaces when they exist.
- For every feature addition or meaningful feature behavior change, the agent
  updates affected project-local skills and docs, then records a pending item
  to propose the relevant skill change back to universal-skills.
- When similar code exists, the agent records a future-refactor pending item for
  the existing code and the new code. The default implementation must not
  modify the existing similar system.
- Code comments may be added only at the exact lines where future refactor debt
  must be discoverable from the code itself.
- The orchestrator loads all applicable `.afol/adm/rules/` files before routing
  governed work and includes the relevant rule obligations in the delegated
  agent's task instructions.
- Before touching any file or artifact, the agent resolves the applicable rule,
  standard, template, skill, and spec for that element type and work intent.
- Element-specific guidance is cumulative. TypeScript feature work, for
  example, must follow code/language guidance plus roadmap/spec/workstream
  governance.

Boundaries:

- This feature does not require every tiny quick task to create a new spec.
- This feature does not authorize broad refactors of similar systems by default.
- This feature does not replace roadmap/spec/workbench governance; it makes
  existing governance harder to skip.
- This feature does not require external memory when repo-local lessons and
  knowledge are enough.

## 5) Existing Similar Systems

These systems already cover parts of the desired behavior and should be reused
or extended carefully during implementation:

- `AGENTS.md` already requires roadmap-first delivery, lesson capture after user
  correction, prevention rules, and verification before done.
- `.afol/adm/rules/RULE-002-workstream-creation.md` already defines roadmap/spec
  workstream creation and brainstorm/explorer-check gates.
- `.afol/adm/rules/RULE-004-validation-linting.md` already defines validation
  expectations before completion.
- `.afol/adm/specs/260306_execution-intelligence-and-knowledge-system_spec_01.md`
  already governs exploration, reusable knowledge, and session closure.
- `.afol/adm/specs/260306_planning-rigor-and-explorer-gates_spec_01.md`
  already requires brainstorm and explorer-check artifacts for major plans.
- `.afol/adm/specs/260307_persistent-planning-memory_spec_01.md` already covers
  catchup and durable planning memory.
- `docs/standards/workflow.md` already defines the roadmap -> spec -> plan ->
  task -> execution -> report sequence that decision intake should strengthen,
  not replace.
- `docs/standards/decision-intake.md` defines the lightweight operating
  standard for diagnosis, signal pack, opportunity/solution separation,
  assumption mapping, challenge, optional scoring, and fixed-appetite slices.

Future refactor pending items:

- Consolidate overlapping preflight language across `AGENTS.md`,
  `RULE-002`, and the planning-rigor specs after F-18 behavior is proven.
- Consider a single rule-resolution service in `.agents/runtime` so CLI,
  MCP, and orchestrator flows load rules identically.
- Consider a single "similar system evidence" artifact field shared by
  explorer-check, plan, report, and spec-test templates.
- Consider a runtime helper that emits a filled decision-intake checklist from
  roadmap/spec/workbench context before a CLI scoring engine is introduced.

## 6) Scope

In scope:

- Governance preflight before non-trivial plans.
- Recurring-problem lookup and escalation rules.
- Similar-system discovery before new function work.
- Applicable-rule resolution for every touched element type, including
  feature, spec, workbench, skill, runtime, docs, and code surfaces.
- Decision-intake and challenge gates for ambiguous, product-shaped,
  benchmark-heavy, or prioritization-heavy work.
- Signal packs and evidence-led opportunity mapping for discovery-heavy work.
- Assumption mapping across desirability, usability, feasibility, and viability.
- Lightweight prioritization guidance that uses qualitative judgment by default
  and separates importance, sequence, and friction only when formal scoring is
  helpful.
- Future-refactor debt capture in specs, workbench artifacts, and narrowly
  placed code comments when needed.
- Orchestrator rule loading and delegated-agent instruction injection.
- Project-local skill/docs updates plus universal-skills propagation pending
  items for feature behavior changes.
- Validation that catches missing evidence for governed work.
- Direct-execution plan/task validation that catches obvious meta-planning
  tasks.
- Canonical task marker and lifecycle state handling across templates, parser,
  status, and update surfaces.

Out of scope:

- Automatic large-scale deduplication or refactoring of existing systems.
- A new standalone planning tree outside roadmap/spec/workbench.
- Mandatory external memory lookup for every task.
- Replacing human review of whether a similar system should be refactored now.

## 7) Child Spec Strategy

- Child specs required: yes
- Decomposition rule:
  - Use one child spec for plan/spec preflight.
  - Use one child spec for direct-execution plan/task integrity and task state
    lifecycle.
  - Use one child spec for recurring-problem escalation and lessons/rules
    capture.
  - Use one child spec for similar-system detection and refactor-debt handling.
  - Use one child spec for orchestrator rule loading and delegated-agent
    enforcement.
- Planned child specs:
  - `plan-spec-preflight` -> roadmap/spec lookup before planning.
  - `plan-task-execution-integrity-state-model` -> direct-execution plan/task
    semantics, canonical task states, and strict validation against obvious
    meta-planning tasks.
  - `decision-intake-and-challenge` -> problem framing, signal packs,
    opportunity mapping, assumption mapping, challenge gates, benchmark order,
    qualitative prioritization, optional scoring rubric, and fixed-appetite
    slice cuts.
  - `recurring-problem-guardrails` -> prior incident lookup, heavy
    verification, and rule/lesson capture.
  - `similar-system-discovery` -> code/spec similarity evidence and future
    refactor debt capture.
  - `orchestrator-rule-enforcement` -> rule loading, routing, and delegated
    instruction enforcement.

## 8) Delivery Plan

1. Inventory current rule, lesson, roadmap/spec, knowledge, and workbench
   surfaces that already satisfy part of the requested behavior.
2. Define the preflight data contract: searched paths, evidence fields,
   missing-governance outcomes, and when quick mode is exempt.
3. Define the direct-execution plan/task integrity contract and canonical task
   state model.
4. Define the decision-intake contract: problem frame, behavior evidence,
   signal pack, opportunity/solution separation, assumptions, rival hypotheses,
   benchmark boundary, qualitative prioritization, optional score rubrics, and
   slice appetite.
5. Define element-to-rule routing for feature, spec, workbench, skill, runtime,
   docs, Python, TypeScript, and JavaScript surfaces.
6. Implement roadmap/spec lookup before non-trivial planning in the relevant
   CLI/runtime/orchestrator path.
7. Implement strict validation for obvious meta-planning tasks and lifecycle
   state misuse in plan/task artifacts.
8. Implement recurring-problem detection by searching lessons, rules, active
   workbench artifacts, and knowledge outputs before bug-fix planning.
9. Implement similar-system discovery for new function work using exact search
   first, semantic/indexed retrieval where available, and explicit code/spec
   citations in plan or explorer-check evidence.
10. Add future-refactor debt capture to workbench/report/spec outputs, plus
   optional narrow code comments only where the future refactor must stay
   visible to maintainers.
11. Implement orchestrator rule loading so all applicable `.afol/adm/rules/` are
   read before routing and summarized into delegated-agent task instructions.
12. Update affected project-local skills and docs, then record a pending item to
   propagate the skill change back to universal-skills through the branch/PR
   flow.
13. Add validation tests for missing preflight evidence, meta-planning task
   rejection, lifecycle state handling, repeated-problem escalation,
   similar-system evidence, and rule-context propagation.
14. Update operator docs and templates only after behavior and validation pass.

## 9) Constraints and Assumptions

Assumptions:

- Repo-local `rg`, roadmap/spec docs, lessons, rules, and workbench artifacts
  are sufficient for the first implementation.
- Similar-system detection can start with exact and path-aware search before
  adding heavier semantic retrieval.
- Direct-execution validation can start with explicit anti-pattern detection
  for task-like lines instead of broad semantic inference.
- Decision-intake can start as documented workflow and skill behavior before any
  command-native helper exists. A scoring tool is not required for fast paths.
- The orchestrator can pass rule obligations as concise task context without
  pasting entire rule files into every delegated prompt.

Constraints:

- Compatibility: existing quick-mode and workbench flows must keep working.
- Operational: generated or managed timestamps must be updated through existing
  automation where applicable.
- Safety: similar existing systems must not be modified unless the user has
  explicitly scoped that refactor.

## 10) Acceptance

Success looks like:

- A plan for non-trivial work records the governing feature/spec found, or
  records the governance gap and blocks implementation until resolved.
- A plan or task artifact for governed execution does not contain tasks whose
  deliverable is creating, writing, preparing, or researching the plan.
- Task boards and checkbox tasks use the canonical lifecycle states, including
  `[!] problem`, `[>] moved`, `[%] implemented_untested`, and
  `[&] tested_needs_spec_validation`.
- A task marked `[x]` has closure evidence and, when applicable, test plus
  spec/user-experience validation proof.
- A plan for ambiguous or product-shaped work records user, outcome, non-goals,
  critical assumptions, rival hypothesis, reversibility, benchmark boundary,
  and first slice appetite before benchmark-driven planning.
- Prioritization records either qualitative weighting or, when formal scoring is
  used, importance, sequence, and friction with evidence-backed rubrics.
- Discovery-heavy work records the signal pack or the evidence gap before
  solution comparison.
- Product-shaped work does not mix opportunity scoring with solution effort
  until at least one simpler/manual solution path has been considered.
- A recurring problem report records prior occurrences, heavier verification,
  and the prevention rule or lesson update created from the recurrence.
- Feature work records local skill/docs updates and a universal-skills
  propagation pending item when agent-facing behavior changes.
- Work touching a specific element type records which rule/skill/spec applied,
  or records a rule gap and a follow-up when no project-specific guidance
  exists.
- New function work records the similar-system search result and cites the
  closest code/spec matches when they exist.
- Similar systems are not modified by default; any refactor is captured as a
  future pending item unless explicitly approved for the current workstream.
- Delegated agents receive the applicable rule obligations from the
  orchestrator and verification can detect when that did not happen.

Review questions:

- Does the evidence prove the agent looked for an existing spec before planning?
- Does recurrence handling produce a prevention mechanism, not just another
  fix?
- Did challenge happen before the agent committed to the solution?
- Did the agent separate opportunity from solution before bringing effort into
  the decision?
- Did benchmark inform the plan without replacing problem framing?
- Do task items execute the requested work rather than make another plan?
- Do intermediate task states honestly show missing test or spec/user-experience
  validation work?
- Does similar-system evidence prevent accidental duplication without forcing
  a risky refactor?
- Can a reviewer see which rules the orchestrator enforced for each agent?

## 11) Risks and Tradeoffs

- Risk: preflight becomes too heavy for small tasks -> Mitigation: keep quick
  mode exempt when already inside approved context.
- Risk: similar-system search creates noisy false positives -> Mitigation:
  require the agent to label results as direct match, related pattern, or noise.
- Risk: agents overuse code comments for refactor debt -> Mitigation: prefer
  workbench/spec/report debt capture and allow code comments only on exact debt
  lines.
- Risk: rule context becomes too large for delegated agents -> Mitigation:
  summarize obligations and link rule files instead of copying full text when
  not needed.
- Risk: anti-meta-plan validation blocks legitimate governance artifact work ->
  Mitigation: target task-like anti-patterns narrowly and allow explicit
  user-requested artifact maintenance.
- Risk: the richer state model becomes cosmetic -> Mitigation: make strict
  validation fail closure when `[%]`, `[&]`, `[!]`, or `[>]` are unresolved or
  lack required notes.
- Risk: scoring creates false precision or slows fast decisions -> Mitigation:
  make scoring optional, ask before using it when the user wants speed, and
  require rubrics/evidence notes when formal scores are used.
- Risk: challenge becomes performative -> Mitigation: treat missing assumptions,
  rival hypothesis, or slice appetite as a stop condition for substantial
  planning.

## 12) Verification Philosophy

Evidence expected from delivery:

- Unit or integration tests for plan/spec preflight outcomes.
- Tests proving plan/task artifacts with obvious meta-planning tasks fail
  strict validation.
- Tests proving canonical task states parse, update, summarize, and block
  closure correctly.
- Tests or fixtures for recurring-problem lookup against lessons and rules.
- Tests proving similar-system evidence is recorded without modifying the
  existing similar system.
- Tests proving orchestrator/delegation instructions include applicable rules.
- Documentation or skill checks proving decision-intake, challenge, benchmark
  order, qualitative prioritization, optional scoring, and slice-cutting
  guidance is reachable by future agents.
- Strict workbench validation and `just lint`.

Open questions:

- Q-01 Should recurring-problem detection be command-driven, prompt-driven, or
  both?
- Q-02 Which artifact should be canonical for future-refactor debt:
  explorer-check, plan, report, or a dedicated debt section?
- Q-03 Should all delegated agents receive all rules, or only a resolved subset
  plus links to the full rule files?
- Q-04 Should decision-intake become a runtime command, a workbench template, or
  remain a skill/workflow rule until repeated usage proves the right shape?
- Q-05 How far should historical workbench sessions be migrated from legacy
  state names after the canonical state model is proven?

## 13) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail

---

*Spec: `.afol/adm/specs/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md`*
