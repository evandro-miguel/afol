---
doc_type: spec
id: 260521_0060_file-first-low-token-execution_spec_01
theme: file-first-low-token-execution
status: final
owners:
- orchestrator
created_at: '2026-05-21T01:00:00+08:00'
updated_at: '2026-07-12T21:20:00Z'
roadmap_feature: F-06
spec_role: parent
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  manifesto: .afol/adm/doctrine/PROJECT-MANIFESTO.md
scope:
  repo_areas:
  - .afol/wb cli/workbench cli/output
  packages:
  - agentic-cli
risk_level: medium
---

# SPEC: file-first-low-token-execution

## 1) Feature Intent

Reduce token usage by moving durable work into files and keeping chat handoffs
compact.

This spec covers **handoff and artifact bulk** (what agents put in chat vs
files). It does **not** replace F-03 for **CLI write-token economy** (how long
the `afol …` command strings are) or default CLI stdout budgets. Those live in:

- `.afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md`
- `.afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md`

Together with F-03: agents should write **short commands**, receive **short
results**, and store **long detail** in workbench files.

## 2) Problem

Agents waste context by sending long research, logs, and raw findings to the
orchestrator.

## 3) Expected Behavior

Subagents save detailed output into workbench files and return status, short
summary, artifact paths, blockers, and next action.

## 4) Product Boundary

The universal CLI owns reusable behavior. The project-local template owns local
state, rules, skills, workbench artifacts, specs, evidence, logs, config, and
update metadata. Current Python/uv/Bash behavior remains compatibility contract
until Bun/TypeScript parity is proven by focused tests.

## 5) Scope

In scope: Compact handoff model, research save command, log append command,
sidecar path output, summary-first reporting.

Out of scope: Hiding blockers, requiring sidecars for trivial tasks, sending
full raw content by default.

## 6) Acceptance

Subagents can save details to files; orchestrators can continue without context
flooding; routine logs avoid manual edits; handoffs are standardized.

## 7) Review Questions

- Does this reduce agent friction or repeated token cost?
- Does this preserve project-local ownership of state?
- Does this avoid copying universal implementation logic into every downstream
  project?
- Is the validation path concrete enough to prove parity and safety?

## 8) Closure

- Accepted implementation evidence: `E-20260528103543755917`.
- Closeout session: `.afol/wb/260528_1029_f06-review-fix/`.
- Strict verification: `./.agents/agents verify-tasks --strict .afol/wb/260528_1029_f06-review-fix/` passed.
