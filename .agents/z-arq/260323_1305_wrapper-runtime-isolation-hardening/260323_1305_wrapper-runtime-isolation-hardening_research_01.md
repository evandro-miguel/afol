---
doc_type: research
id: 260323_1305_wrapper-runtime-isolation-hardening_research_01
theme: wrapper-runtime-isolation-hardening
status: active
created_at: '2026-03-23T13:05:37-03:00'
updated_at: '2026-03-23T13:59:10-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1305_wrapper-runtime-isolation-hardening_plan_01
---

# Research: wrapper-runtime-isolation-hardening

## Findings
- The wrapper invoked `uv run` for every command, even when `.agents/scripts/.venv` already existed.
- Integration coverage for `.agents/agents` existed, but the default script test target excluded integration tests and CI did not run script linting.
- In a restricted environment, `uv run` attempted to write into `~/.cache/uv` and failed before the actual command logic started.

## Constraints
- The scaffold must remain usable as the base runtime for agent work under sandboxed execution.
- Global machine state cannot be treated as a prerequisite for normal command execution.
