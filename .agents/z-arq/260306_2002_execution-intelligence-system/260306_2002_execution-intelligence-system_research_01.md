---
doc_type: research
id: 260306_2002_execution-intelligence-system_research_01
theme: execution-intelligence-system
status: active
roadmap_feature: F-07
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2002_execution-intelligence-system_plan_01
created_at: '2026-03-06T20:02:07-03:00'
updated_at: '2026-03-06T20:34:07-03:00'
---

# Research: execution-intelligence-system

## Questions
- Which existing scripts must become recursive to support pack folders?
- Which artifact types should be searchable as reusable knowledge?
- Where should final postmortem gating happen?

## Findings
- `verify-tasks.py`, `agents-wb-update.py`, and `agents-doctor.py` were the main flat-folder assumptions.
- Reusable knowledge should include research, brainstorm, explorer-check, report, and postmortem docs.
- `wb-update status --file report --value final` is the right place to block closure when postmortem is missing.
- Official runtime docs reinforce staged discovery and compact context loading:
  - OpenCode supports dedicated planning/build agents and local skill discovery.
  - Qwen exposes explicit approval and sandbox modes that reward smaller, pre-validated work units.
  - Codex guidance remains instruction-file driven, so concise retrieval layers reduce repeated full-doc loading.

## Sources
- `.agents/scripts/agents-new.py` | credibility: high | notes: creation flow
- `.agents/scripts/verify-tasks.py` | credibility: high | notes: strict validation flow
- `.agents/scripts/agents-wb-update.py` | credibility: high | notes: final report closure boundary
- `.agents/tools.json` | credibility: high | notes: discovery layer requirements
- `https://opencode.ai/docs/agents/` | credibility: high | notes: plan/build split and agent roles
- `https://opencode.ai/docs/skills` | credibility: high | notes: local skill discovery and loading
- `https://qwenlm.github.io/qwen-code-docs/en/users/features/approval-mode/` | credibility: high | notes: approval modes drive planning rigor
- `https://qwenlm.github.io/qwen-code-docs/en/users/features/sandbox/` | credibility: high | notes: repo-local sandbox controls favor small verified steps
- `https://developers.openai.com/codex` | credibility: high | notes: project instruction-file model and agentic coding workflow

## Decision Impact
- The system needs both workflow rules and concrete tooling.
- Low-token discovery is best served by a simple repo-local knowledge command plus generated index.
- A compact `knowledge pull` command is justified because the primary runtimes all benefit from loading a summary first and a full document only when needed.

## Open Unknowns
- none

---
*Template: `.agents/a-docs/templates/research.md`*
