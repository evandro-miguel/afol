---
doc_type: index
id: "knowledge_index"
status: active
created_at: "2026-04-12T21:36:05+00:00"
updated_at: "2026-04-12T21:36:05+00:00"
---

# Knowledge Index

Low-token discovery index for reusable workbench knowledge artifacts.

- Total indexed docs: 20

## Brainstorm

- `260404_1558_repo-quality-and-governance_brainstorm_01` | `.agents/wb/260404_1558_repo-quality-and-governance/260404_1558_repo-quality-and-governance_brainstorm_01.md` | - The repo audit found quality gaps that could undermine scaffold reliability:
- `260411_1559_uv-fastapi-script-refactor_brainstorm_01` | `.agents/wb/260411_1559_uv-fastapi-script-refactor/260411_1559_uv-fastapi-script-refactor_brainstorm_01.md` | - The operator asked for a plan to refactor and adapt this project's scripts to follow uv and FastAPI, using https://github.com/fastapi/fastapi as the source reference.
- `260411_2214_agentic-runtime-restructure_brainstorm_01` | `.agents/wb/260411_2214_agentic-runtime-restructure/260411_2214_agentic-runtime-restructure_brainstorm_01.md` | - The scaffold needs a total runtime restructure, not a narrow MCP overlay.
- `260412_1130_spec-child-and-spec-test-governance_brainstorm_01` | `.agents/wb/260412_1130_spec-child-and-spec-test-governance/260412_1130_spec-child-and-spec-test-governance_brainstorm_01.md` | - The roadmap now requires spec-child as the canonical child/local feature
- `260412_1245_roadmap-backlog-closure_brainstorm_01` | `.agents/wb/260412_1245_roadmap-backlog-closure/260412_1245_roadmap-backlog-closure_brainstorm_01.md` | - The roadmap still had open planned/active items after the F-14 slice was

## Explorer-Check

- `260404_1558_repo-quality-and-governance_explorer-check_01` | `.agents/wb/260404_1558_repo-quality-and-governance/260404_1558_repo-quality-and-governance_explorer-check_01.md` | - Confirm the workstream plan reflected the current scaffold instead of stale
- `260411_1559_uv-fastapi-script-refactor_explorer-check_01` | `.agents/wb/260411_1559_uv-fastapi-script-refactor/260411_1559_uv-fastapi-script-refactor_explorer-check_01.md` | - Prove the plan was checked against the current project instead of being written from assumptions.
- `260411_2214_agentic-runtime-restructure_explorer-check_01` | `.agents/wb/260411_2214_agentic-runtime-restructure/260411_2214_agentic-runtime-restructure_explorer-check_01.md` | - Prove the plan was checked against the current project instead of being written from assumptions.
- `260412_1130_spec-child-and-spec-test-governance_explorer-check_01` | `.agents/wb/260412_1130_spec-child-and-spec-test-governance/260412_1130_spec-child-and-spec-test-governance_explorer-check_01.md` | - rg -n "spec-lite|spec_child|spec-child|spec-test|doc_type.*spec|VALID.*doc|artifact"
- `260412_1245_roadmap-backlog-closure_explorer-check_01` | `.agents/wb/260412_1245_roadmap-backlog-closure/260412_1245_roadmap-backlog-closure_explorer-check_01.md` | - Prove the plan was checked against the current project instead of being written from assumptions.

## Postmortem

- `260411_2214_agentic-runtime-restructure_postmortem_01` | `.agents/wb/260411_2214_agentic-runtime-restructure/260411_2214_agentic-runtime-restructure_postmortem_01.md` | - Restructure the scaffold around a central .agents/runtime/ package while preserving the existing .agents/agents command surface.

## Report

- `260404_1558_repo-quality-and-governance_report_01` | `.agents/wb/260404_1558_repo-quality-and-governance/260404_1558_repo-quality-and-governance_report_01.md` | - Roadmap feature: F-11
- `260411_2214_agentic-runtime-restructure_report_01` | `.agents/wb/260411_2214_agentic-runtime-restructure/260411_2214_agentic-runtime-restructure_report_01.md` | - Roadmap feature: F-13
- `260412_1130_spec-child-and-spec-test-governance_report_01` | `.agents/wb/260412_1130_spec-child-and-spec-test-governance/260412_1130_spec-child-and-spec-test-governance_report_01.md` | - Implemented F-14 governance support for spec-child and spec-test.
- `260412_1245_roadmap-backlog-closure_report_01` | `.agents/wb/260412_1245_roadmap-backlog-closure/260412_1245_roadmap-backlog-closure_report_01.md` | - Roadmap feature: F-13

## Research

- `260404_1558_repo-quality-and-governance_research_01` | `.agents/wb/260404_1558_repo-quality-and-governance/260404_1558_repo-quality-and-governance_research_01.md` | - Which audit findings were small enough to close in a focused pass?
- `260411_1559_uv-fastapi-script-refactor_research_01` | `.agents/wb/260411_1559_uv-fastapi-script-refactor/260411_1559_uv-fastapi-script-refactor_research_01.md` | - What parts of the FastAPI repository are relevant to this scaffold's scripts?
- `260411_2214_agentic-runtime-restructure_research_01` | `.agents/wb/260411_2214_agentic-runtime-restructure/260411_2214_agentic-runtime-restructure_research_01.md` | - What does the kit recommend and what must change for a total restructure?
- `260412_1130_spec-child-and-spec-test-governance_research_01` | `.agents/wb/260412_1130_spec-child-and-spec-test-governance/260412_1130_spec-child-and-spec-test-governance_research_01.md` | - Which live scaffold surfaces still referenced spec-lite before F-14
- `260412_1245_roadmap-backlog-closure_research_01` | `.agents/wb/260412_1245_roadmap-backlog-closure/260412_1245_roadmap-backlog-closure_research_01.md` | - Which roadmap tasks remain open after F-14?
