---
doc_type: research
id: 260306_1937_primary-runtime-compatibility_research_01
theme: primary-runtime-compatibility
status: active
owners:
- researcher
created_at: '2026-03-06T19:37:14-03:00'
updated_at: '2026-03-06T19:49:56-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_1937_primary-runtime-compatibility_plan_01
  task: 260306_1937_primary-runtime-compatibility_task_01
---

# Research: primary-runtime-compatibility

## Goal
- Confirm the committed compatibility contract against official runtime documentation for OpenCode, Codex, and Qwen.

## Questions
- What project-local config surfaces are officially supported by each primary runtime?
- Which committed files are safe to keep in the repo?
- Which parts should remain local-only or secret-free?

## Findings

### OpenCode
- Official docs describe a project-level `opencode.json` config entrypoint and project-scoped `.opencode/` material.
- OpenCode docs also describe agent and permission surfaces, which supports keeping a thin committed adapter and separate project-local runtime notes.
- Repo implication:
  - Commit a secret-free `opencode.json`.
  - Treat `.opencode/` as a runtime adapter folder, not as a place for credentials or user-local auth state.

### Codex
- Official OpenAI Codex docs emphasize repository instructions, approvals, and sandboxed execution patterns.
- Repo implication:
  - Keep `AGENTS.md` canonical for Codex.
  - Do not commit user-local machine config or credentials as part of Codex support.
  - Keep runtime support centered on repo-readable governance rather than local personal state.

### Qwen
- Official Qwen Code docs describe project-scoped configuration, approval/sandbox modes, MCP integration, and markdown agent/subagent material under the repo.
- Repo implication:
  - Keep `QWEN.md` as the runtime-facing mirror of canonical repo instructions.
  - Treat `.qwen/` as a thin project adapter folder.
  - Keep committed files portable and secret-free.

## Design Conclusions
- `AGENTS.md` remains the canonical instruction source across primary runtimes.
- Runtime adapters are allowed, but they must stay thin and traceable to canonical governance.
- The repo should clearly distinguish:
  - primary runtimes: OpenCode, Codex, Qwen
  - compatibility runtimes: Claude, Gemini
- OpenCode needs first-class committed support because it has a meaningful project-level adapter surface.
- Validation should assert runtime presence and basic adapter integrity so support does not silently regress.

## Sources
- OpenCode docs:
  - `https://opencode.ai/docs`
  - `https://opencode.ai/docs/config`
  - `https://opencode.ai/docs/agents`
- OpenAI Codex docs:
  - `https://developers.openai.com/codex`
- Qwen Code docs:
  - `https://qwenlm.github.io/qwen-code-docs`
  - `https://qwenlm.github.io/qwen-code-docs/guide/subagents.html`
  - `https://qwenlm.github.io/qwen-code-docs/guide/approval-mode.html`
  - `https://qwenlm.github.io/qwen-code-docs/guide/sandbox-mode.html`

## Decision Impact
- Support quality is no longer defined only by mirrors existing on disk.
- Primary runtime support now requires:
  - documented canonical contract
  - committed adapter boundaries
  - runtime presence checks
  - secret-free validation expectations

---
*Template: `.agents/a-docs/templates/research.md`*
