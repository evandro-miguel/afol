---
doc_type: plan
id: YYMMDD_HHMM_<theme>_plan_01
theme: <theme>
status: draft
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-06-17T08:35:36-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
links:
  roadmap: <roadmap_path>
  task: <task_doc_id>
  brainstorm: <brainstorm_doc_id_or_empty>
  explorer_check: <explorer_check_doc_id_or_empty>
  research: <research_doc_id_or_empty>
  postmortem: <postmortem_doc_id_or_empty>
repo: <repo_name>
branch: <branch_or_worktree>
---

# Plan: <theme>

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow this starter's structure and `docs/standards/workflow.md` when writing or revising this file.

## Purpose / Big Picture

- Explain what this change enables for a user or operator.
- State how someone can see the new behavior working after implementation.
- `plan + task` is the required execution core for non-trivial work.
- This template is for direct execution. Do not add steps whose only purpose
  is to create another plan, gather broad context, or run generic research.

## Execution Contract

- Every step must be an action an agent can execute now.
- If discovery is still needed, do it before the plan or reduce it to the
  smallest blocking proof.
- Do not use the plan to restate feature philosophy; keep that in roadmap/spec.
- If a step cannot be executed without more framing, rewrite it until it names
  a concrete deliverable, decision, or verification.

## Progress

- [ ] YYYY-MM-DD HH:MMZ - Replace this line with the first concrete step.

## Surprises & Discoveries

- Observation: <unexpected behavior, tradeoff, or discovery>
  Evidence: <short proof, output, or pointer>

## Decision Log

- Decision: <what changed>
  Rationale: <why this path was chosen>
  Date/Author: <timestamp / author>

## Outcomes & Retrospective

- Outcome: <what was achieved so far>
- Remaining: <what still needs work>
- Lesson: <what should be remembered next time>

## Governance Context

- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `<task_doc_id>` (required)
- Brainstorm artifact: `<brainstorm_doc_id_or_empty>` (optional)
- Explorer check artifact: `<explorer_check_doc_id_or_empty>` (optional)
- Research artifact: `<research_doc_id_or_empty>` (optional)
- Postmortem artifact: `<postmortem_doc_id_or_empty>` (optional)
- Knowledge lookup performed:
  - <command/result or prior docs reviewed>

## Context and Orientation

- Describe the current state as if the reader knows nothing about this repo.
- Name the key files, modules, and commands by full repository-relative path.
- Define any non-obvious terms immediately.

## Scope

- In scope:
  - <item>
- Out of scope:
  - <item>

## Plan of Work

- Describe, in prose, the sequence of edits and additions.
- For each area, name the file and the concrete location to change.
- Keep the path minimal and outcome-focused.
- Do not add a phase whose only purpose is broad research, context gathering, or creating a later plan.
- Do not add a phase whose only purpose is to prepare a later plan.
- If a discovery step is unavoidable, make it the smallest blocking proof and
  state the decision or artifact it must produce.

## Concrete Steps

1. <exact edit or command, with working directory when relevant; must be directly executable>
2. <next step>
3. <validation step>

## Interfaces and Dependencies

- Tools:
  - <critical only>
- MCPs:
  - <critical only>
- Skills:
  - <critical only>
- Files and interfaces that must exist at the end:
  - <path + function/module/interface>

## Risks and Mitigations

- Risk: <risk> -> Mitigation: <mitigation>

## Validation and Acceptance

- Unit: <command or N/A>
- E2E: <command or N/A>
- Typecheck: <command or N/A>
- Lint: <command or N/A>
- Behavioral acceptance:
  - <observable proof with expected result>

## Idempotence and Recovery

- State which steps are safe to re-run.
- If a step can fail halfway, document how to retry or recover cleanly.

## Artifacts and Notes

- Capture the most important snippets, transcripts, or evidence references here.
- Keep examples concise and focused on proving success.

## Completion Gate

- [ ] Task exists and tracks the executable work
- [ ] No step exists only to make another plan or do generic research
- [ ] Relevant prior knowledge was searched or explicitly ruled out
- [ ] Any optional artifact created for this workstream is `final`
- [ ] The ExecPlan remains self-contained enough for a new contributor to resume
- [ ] Progress entries reflect the actual current state
- [ ] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
