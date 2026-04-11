---
doc_type: spec
id: 260323_1305_wrapper-runtime-isolation-hardening_spec-lite_01
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
  task: 260323_1305_wrapper-runtime-isolation-hardening_task_01
risk_level: medium
---

# Spec Lite: wrapper-runtime-isolation-hardening

## Intent
- Keep the runtime wrapper thin, deterministic, and independent from global mutable state during normal command execution.

## Implementation Boundary
- The wrapper may use `uv` to create or refresh the local environment.
- Once the local environment exists, command execution must use the local interpreter directly.
- Validation flows must prefer repo-local cache paths over user-global writable locations.
