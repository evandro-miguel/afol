---
doc_type: standard
id: decision-intake-standard
status: active
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-19T18:34:46-03:00'
title: Decision Intake Standard
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

- User: who is the real user for this round?
- Behavior evidence: what happened before, what was tried, or what signal proves
  the pain exists?
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

- Interviews or user notes.
- Analytics or usage signals.
- Support, sales, or operator reports.
- Prior lessons, issues, workbench notes, and similar incidents.
- External benchmarks or market signals, clearly labeled as secondary evidence.

## Opportunity Before Solution

- Opportunity: frequency, pain severity, customer relevance, strategic fit, and
  evidence strength.
- Solution: expected outcome impact, validation speed, confidence,
  reversibility, dependencies, maintenance, and debt.

Do not reject an opportunity early because a first imagined solution looks too
expensive. Look for simpler or manual ways to test it first.

## Assumption Map

- Desirability: the user cares enough to change behavior.
- Usability: the user can complete the flow.
- Feasibility: the project can build or simulate it within the appetite.
- Viability: the result is worth maintaining for this repo or product.

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

- What must be true for this to work?
- Which rival hypothesis explains the same problem?
- What would make this fail within seven days?
- What simpler manual or narrower alternative captures most of the value?
- What are we treating as irreversible even though it may be reversible?
- Which scope item should be cut first if the appetite is fixed?

Use red-team or pre-mortem language when the plan sounds too smooth.

## Prioritization And Slices

- Prioritize qualitatively by default based on repeated user emphasis, blockers,
  risk, reversibility, and validation speed.
- Ask before introducing a formal score when the user appears to want speed.
- If formal scoring is used, separate importance, sequence, and friction with
  evidence notes.
- Keep opportunity and solution scores separate when formal scoring is useful.
- Prefer one-day or three-day fixed-appetite vertical slices before broader
  platform work.
- Do not let benchmark replace user/outcome framing.
