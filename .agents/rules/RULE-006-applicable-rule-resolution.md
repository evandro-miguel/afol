---
doc_type: rule
id: RULE-006
theme: applicable-rule-resolution
version: 1.0
created: 2026-04-18
updated_at: '2026-04-19T18:08:11-03:00'
applies_to: All agents (Codex, OpenCode, Qwen, Gemini, Claude)
---

# Applicable Rule Resolution

**Purpose:** Force agents to identify and follow the rule, standard, skill, and
spec that applies to each element they touch.

---

## Mandatory Pre-Edit Check

Before editing any file or artifact, the agent must identify the element type
and load the applicable guidance.

Minimum check:

```text
1. What element am I touching?
2. Which project rule applies?
3. Which spec, standard, template, or skill applies?
4. Which validation proves I followed it?
```

If no project-specific rule exists for the element, the agent must state the
gap, use the closest language/framework/project standard available, and add a
follow-up if the gap is likely to recur.

For governed feature operations, the command path itself must load the active
feature/spec/rule bundle before implementation starts; this step cannot be left
to chat memory alone.

---

## Element Routing

| Element touched | Required guidance |
|-----------------|-------------------|
| Ambiguous/product-shaped request | `docs/standards/decision-intake.md`, parent spec, RULE-002 |
| Feature | `docs/arc/GENERAL-ROADMAP.md`, parent spec, RULE-002 |
| Spec or roadmap | `docs/templates/spec.md`, `docs/arc/SPECS/`, RULE-003 |
| Workbench artifact | `agentic-folder-sys`, RULE-002, RULE-004 |
| Project-local skill | `writing-skills`, `docs/standards/skills-sync.md`, RULE-002 |
| Python code | Python project config, nearest tests, relevant Python skill |
| TypeScript/JavaScript code | TS/JS project config if present, nearest tests, relevant TS/JS or UI skill |
| Runtime command/tool | README, `docs/standards/`, runtime mirrors, command tests |
| Tool discovery | `docs/agentic/agents-tools.md`, `.agents/tools.json` |
| Markdown docs | RULE-003, doc templates, `just lint` |
| Folder or scaffold structure | RULE-005, `docs/map/`, bootstrap docs |
| Validation or release gate | RULE-004 and affected command docs |

Element-specific guidance is cumulative. For example, a TypeScript feature must
follow both the TypeScript guidance and the feature/spec/workstream guidance.

---

## Similar Existing Systems

When creating a new function, command, workflow, or artifact type:

- Search for similar code, docs, specs, rules, and skills before implementing.
- Cite the closest similar system in the plan, explorer-check, spec, or report.
- Do not modify the similar existing system unless the current scope explicitly
  includes that refactor.
- Record future refactor debt for both the existing and new code paths when
  duplication or convergence is likely.

---

## Decision Intake

When the work is ambiguous, product-shaped, benchmark-heavy, or
prioritization-heavy:

- Resolve `docs/standards/decision-intake.md` before planning, benchmark,
  delegation, or implementation.
- Treat decision intake as a ladder, not a mandatory pipeline. Use the smallest
  subset that resolves the uncertainty, and keep the fast lane conversational
  when the user wants speed.
- Record the user, behavior evidence, observable outcome, constraints,
  non-goals, reversibility, assumptions, and first-slice appetite.
- Run a challenge checkpoint before committing to a solution.
- Keep benchmark after framing unless explicitly labeled as exploratory
  context.
- Prioritize qualitatively by default. Ask before formal scoring when the user
  wants speed; if scoring is used, separate importance, sequence, and friction.

---

## Delegated Work

The orchestrator must pass applicable rule obligations to every delegated agent.
Delegated agents must confirm the applicable element rules before editing.

If an agent receives a task without the relevant rules, it must pause and ask
the orchestrator for the missing rule context instead of proceeding from
assumption.

---

## Validation

Before reporting completion:

- Cite the applicable rules followed.
- Run the validation required by those rules.
- If a rule gap was found, record the follow-up in the workstream, roadmap,
  spec, or report.

---

## Best Practices

**DO:**

- ✅ Resolve rules by file type, artifact type, and work intent.
- ✅ Apply all relevant rules when one change crosses multiple surfaces.
- ✅ Prefer project-local rules and skills before global guidance.
- ✅ Record rule gaps when the project lacks guidance for a repeated surface.

**DON'T:**

- ❌ Treat "feature", "spec", "TypeScript", "Python", or "skill" work as a
  generic edit.
- ❌ Delegate work without passing the applicable rule context.
- ❌ Close work without evidence that the relevant rules were followed.

---

## References

- RULE-002 - Workstream Creation
- RULE-003 - Documentation Standards
- RULE-004 - Validation & Linting
- RULE-005 - Folder Structure
- `docs/agentic/agents-tools.md`
- `docs/standards/skills-sync.md`

---

*Version: 1.0 | Lines: ~130 | Max: 250*
