---
doc_type: spec
id: 260306_knowledge-reuse-and-token-efficiency_spec_01
theme: knowledge-reuse-and-token-efficiency
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set."
owners:
- orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-06-14T00:00:00+00:00'
roadmap_feature: F-07
spec_role: child
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
  - docs/knowledge
  - .agents/scripts/agents-knowledge.py
  - .afol/adm/tools.json
  - docs/standards
  packages:
  - knowledge reuse
risk_level: medium
---

# SPEC: Knowledge Reuse and Token Efficiency

## Intent

- Let agents find prior useful research quickly instead of rereading large parts of the repo or repeating investigations.

## Expected Behavior

- The scaffold provides a lightweight knowledge index over prior research-bearing artifacts.
- Agents can list, search, and show prior findings with concise output.
- Full validation/document refresh can regenerate the knowledge index.

## User Journey

1. An agent starts a task.
2. The agent searches prior research and post-mortems.
3. The agent reuses relevant findings before doing new deep exploration.
4. New research becomes searchable for future sessions.

## Acceptance

- [x] A repo-local knowledge tool exists for list/search/show/index.
- [x] Knowledge index includes research, brainstorm, explorer-check, reports, and post-mortems.
- [x] README and standards recommend low-token discovery before large reads.

---

*Child Spec: `docs/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md`*
