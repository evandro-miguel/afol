---
description: Discovering tools and mitigating task failures for agents
metadata:
  tags: "agentic-system, troubleshooting, task-failures"
---

# Agentic System Troubleshooting

When encountering blockers or process constraints, use these tools to recover functionality and investigate failures.

## 1. Using Discovery-First Agent Tools

Agents are expected to prefer discovery over memorization. When you need to interact with the project repository, use:

- `.agents/agents tools list` : Lists project-specific or context tools
- `.agents/agents tools info <tool-id>` : Details a specific tool
- `.agents/agents tools search <query>` : Submits a query against existing tools

For common operations, refer to `make help`.

## 2. Autonomous Bug Fixing

If you cannot immediately resolve an issue or if the fix is invasive:
1. Explain why the reproduction of a bug is blocked.
2. Identify the root cause, not merely the symptom.
3. Validate the root cause with evidence.
4. If feasible, apply the fix and run tests explicitly to show functionality is clear.
5. Create a lesson mapping out the solution under `.agents/a-docs/lessons/entries/`.

## 3. Scope and Security Errors

- Do not expose any secrets in the code, logs, or commits.
- Do not perform destructive operations. If instructed to delete, archive under `.agents/z-arq/YYYYMMDD_<description>/`.
- Do not make external dependencies without robust reasoning.

## 4. Workstream Drifts

If you enter a session and notice the workstream drift away from its core intent, evaluate whether you should finish the `task` template file (so the current scope concludes) or create a new session `wb` folder (if the current changes are massive). Avoid merging orthogonal tasks in an existing `wb` folder unless it's a minor change ("quick mode").
