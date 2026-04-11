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
updated_at: '2026-04-04T10:08:11-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
links:
  roadmap: <roadmap_path>
  brainstorm: <brainstorm_doc_id>
  explorer_check: <explorer_check_doc_id>
  research: <research_doc_id>
  task: <task_doc_id>
repo: <repo_name>
branch: <branch_or_worktree>
---

# Plan: <theme>

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture

- Explain what this change enables for a user or operator.
- State how someone can see the new behavior working after implementation.

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
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs

- Brainstorm artifact: `<brainstorm_doc_id>`
- Explorer check artifact: `<explorer_check_doc_id>`
- Research artifact: `<research_doc_id>`
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

## Concrete Steps

1. <exact edit or command, with working directory when relevant>
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

- [ ] Brainstorm exists and reflects real option analysis
- [ ] Explorer check proves current-project inspection happened
- [ ] Relevant prior knowledge was searched or explicitly ruled out
- [ ] The ExecPlan remains self-contained enough for a new contributor to resume
- [ ] Progress entries reflect the actual current state
- [ ] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
