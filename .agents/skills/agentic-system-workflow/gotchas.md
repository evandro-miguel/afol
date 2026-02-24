---
description: Known traps for agentic operations and strict system preferences
metadata:
  tags: "agentic-system, gotchas, operational-traps"
---

# Agentic System Operational Gotchas

## 1. Do Not Modify `updated_at` Manually

A massive gotcha across all agentic documents in the system is manually editing timestamps instead of relying on the workflow.

**Always update metadata via scripts**:
- `make wb-touch`
- `./.agents/agents wb-update touch`

## 2. Refusing Portuguese When Unrequested

Always generate workstream and codebase comments and reports in English by default, under `.agents/` as well.
Only use Portuguese when explicitly prompted for it within conversation outputs.

## 3. Empty Responses & Superfluous Commentary

**Do Not Rationalize** the user's intent:
- Do NOT provide conversational fluff (e.g. "I understand what you mean", "Certainly!").
- Do NOT hypothesize; if any constraints are unknown, make explicitly clear what you do not know.
- Deliver value practically, state steps taken and output the result.

## 4. No Implicit Assumptions Before Marking as Done

Another pitfall is writing code, generating a plan, and then failing to execute properly because evidence wasn't generated. Agents MUST verify behavior works in their given environment before proceeding with completions across task files (`- [x]`).

## 5. Exceeded Plan Length

If your plans (`<theme>_plan_{NN}.md`) grow too long, the context becomes unstable. The standard is to split the plan file by specific phases explicitly.

## 6. Blind Execution without Skill Checking
Always check for available and useful skills using `.agents/agents tools list` or manually checking the folder `.agents/skills` to guarantee no duplicated tool configuration before completing an objective blindly.

## 7. Safety Rules
- Never expose secrets in code, logs, docs, or commits.
- Avoid destructive operations unless explicitly authorized. Do not delete logic, only refactor.
- Archive before delete under `.agents/z-arq/YYYYMMDD_<description>/`.
- Do not add dependencies without clear justification.
