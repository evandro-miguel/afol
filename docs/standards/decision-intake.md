---
doc_type: standard
id: 260419_1554_decision-intake-standard_01
status: active
created_at: 2026-04-19 15:54:42-03:00
updated_at: '2026-04-19T18:34:46-03:00'
title: Decision Intake Standard
roadmap_feature: F-18
parent_spec: 260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01
---

# Decision Intake Standard

Use this standard when a request is ambiguous, product-shaped,
benchmark-heavy, prioritization-heavy, or likely to become a governed
workstream.

The goal is not more paperwork. The goal is to force clarity before the agent
benchmarks, plans, delegates, or builds. Keep it conversational when the user
wants speed.

This is a decision ladder, not a mandatory pipeline. Use the smallest subset
that answers the current uncertainty. Preserve the order when a step is needed,
but do not manufacture artifacts just to complete the ladder.

## Decision Lanes

- Fast lane: use a compact problem frame, one challenge question, and
  qualitative prioritization based on repeated user emphasis, blockers, risk,
  reversibility, and validation speed.
- Discovery lane: add a signal pack, opportunity map, assumption map, and
  controlled benchmark when the problem or opportunity is still unclear.
- Governed lane: capture the intake inside the active workbench/spec/report
  when the work needs durable coordination, delegation, or closure evidence.

## Recommended Order

1. Diagnose the problem in one short frame.
2. Build or request a signal pack when the decision depends on fragmented
   evidence.
3. Map the opportunity before comparing solutions.
4. Synthesize assumptions, constraints, non-goals, and first solution shape.
5. Run challenge.
6. Shape the smallest useful spec or plan.
7. Benchmark comparable systems only after the opportunity is framed.
8. Weigh trade-offs qualitatively by default; use formal scoring only when the
   user requests it or when trade-offs remain unclear.
9. Cut fixed-appetite vertical slices.

## Problem Frame

Record the shortest useful answers:

- User: who is the real user for this round?
- Behavior evidence: what happened before, what the user tried, or what signal
  proves the pain exists?
- Observable outcome: what should change and how would we notice?
- Constraints: time, tools, repo boundaries, safety, dependencies, and
  irreversible decisions.
- Non-goals: what will not be solved in this round.
- Reversibility: which decisions are cheap to reverse and which are one-way
  doors.
- Appetite: the time box for the first proof slice.

For early discovery, ask only enough questions to move the decision forward.
Five to seven focused questions are usually enough for one round. Avoid asking
the user to design the feature before the problem, context, and cost of not
solving it are clear.

## Signal Pack

Use a signal pack when the problem is still fuzzy or evidence is scattered.
Keep it small and traceable:

- Interviews or user notes.
- Analytics or usage signals.
- Support, sales, or operator reports.
- Prior lessons, issues, workbench notes, and similar incidents.
- External benchmarks or market signals, clearly labeled as secondary evidence.

Do not let the signal pack become research theater. It exists to decide the
next question, opportunity, or slice.

## Opportunity Before Solution

Separate the opportunity from the solution:

- Opportunity: frequency, pain severity, customer relevance, strategic fit, and
  evidence strength.
- Solution: expected outcome impact, validation speed, confidence,
  reversibility, dependencies, maintenance, and debt.

Do not reject an opportunity early because a first imagined solution looks too
expensive. Look for simpler or manual ways to test it first.

## Assumption Map

Before building, name the assumptions that could break the work:

- Desirability: the user cares enough to change behavior.
- Usability: the user can complete the flow.
- Feasibility: the project can build or simulate it within the appetite.
- Viability: the result is worth maintaining for this repo or product.

Test the riskiest assumption first when possible.

## Role Mapping

Map the logical discovery roles to existing agents or local work. Do not create
new agents only because the role name exists.

- Interviewer: main agent or orchestrator asks a short round of problem,
  context, constraint, and outcome questions.
- Signal synthesizer: researcher, repo-organizer, or the main agent compacts
  user notes, workbench history, lessons, analytics, support, and external
  signals into traceable evidence.
- Opportunity mapper: planner or main agent separates opportunity from solution
  and links each meaningful claim to evidence.
- Assumption mapper: planner, architect, or main agent identifies
  desirability, usability, feasibility, and viability assumptions.
- Contrarian: plan-analyst, plan-review, sarcasmotron, or the main agent runs
  pre-mortem, rival hypothesis, and second-order checks.
- Scout: researcher gathers products, repositories, or KPI benchmarks only
  after the problem frame and opportunity target exist.
- Scorer: planner or main agent uses formal scoring only when it helps the
  decision or the user asks for it.
- Slicer/builder: planner, build, or main agent turns the selected solution into
  one-day and three-day vertical slices.

## Challenge Gate

Before committing to a plan, answer:

- What must be true for this to work?
- Which rival hypothesis explains the same problem?
- What would make this fail within seven days?
- What simpler manual or narrower alternative captures most of the value?
- What are we treating as irreversible even though it may be reversible?
- Which scope item should be cut first if the appetite is fixed?

If these answers are missing for substantial work, do not proceed to execution.

Use red-team or pre-mortem language when the plan sounds too smooth.

## Benchmark Boundary

Benchmark after the problem frame, opportunity target, and first solution
hypothesis exist.

Use benchmark to find patterns to adapt, ignore, or avoid. Do not let benchmark
replace user/outcome framing, opportunity choice, or create feature envy.

## Prioritization

Default to qualitative prioritization. The agent should weigh what the user
keeps repeating, what blocks the outcome, what is reversible, what is risky,
and what can prove value fastest.

Ask before introducing a formal score when the user appears to want speed.

Use formal 1 to 5 scoring only when it helps the decision:

- Opportunity score: frequency, pain severity, strategic fit, customer
  relevance, evidence strength.
- Solution score: expected impact, validation speed, confidence, reversibility,
  dependencies, maintenance, and debt.
- Fragility/risk: dependency count, uncertainty, maintenance burden, and
  technical debt.

The score is optional and is a conversation aid, not proof. A score without
evidence notes is not valid for governed planning.

Never use one score to hide the difference between a valuable opportunity and a
bad first solution.

## Slice Cutting

Prefer fixed time and variable scope:

- One-day slice: one user, one vertical path, one useful proof.
- Three-day slice: one adjacent path, minimal instrumentation, or one
  iteration that reduces operational friction.
- Post-MVP: platform work, broad automation, reusable engines, auth complexity,
  or integrations that do not prove the current outcome.

Slices should cross the relevant boundaries end to end. Avoid frontend-first,
backend-first, or tests-later slices when a vertical proof is possible.

## Output Contract

For lightweight work, include the frame and challenge in the conversation.

For governed work, capture the decision intake in the plan, brainstorm,
explorer-check, spec-child, or report, whichever already exists for the
workstream. Do not create a new artifact only to duplicate the same content.

For discovery-heavy work, prefer a short signal pack plus opportunity map over
a long PRD.
