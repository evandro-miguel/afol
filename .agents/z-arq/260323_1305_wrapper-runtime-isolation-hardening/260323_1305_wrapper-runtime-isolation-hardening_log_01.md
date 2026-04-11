---
doc_type: log
id: 260323_1305_wrapper-runtime-isolation-hardening_log_01
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
---

# Log: wrapper-runtime-isolation-hardening

## Timeline
- 2026-03-23 13:05-03 - created a dedicated F-06 workstream to harden runtime isolation after wrapper review findings
- 2026-03-23 13:06-03 - confirmed the failure mode: `.agents/agents` depended on `uv run` and global uv cache writes for normal command execution
- 2026-03-23 13:12-03 - patched the wrapper and validation entrypoints to use the local virtualenv directly and repo-local UV cache
- 2026-03-23 13:14-03 - added runtime compatibility regression coverage for wrapper isolation and extended CI with script linting
- 2026-03-23 13:16-03 - verified `make lint-scripts`, `make test-scripts`, `make lint`, `make doctor`, `PATH=/usr/bin:/bin ./.agents/agents doctor`, and `make all`
- 2026-03-23 13:17-03 - attempted `agents-wb-update touch` and the full critical integration suite; write-path checks were blocked by subprocess read-only sandbox restrictions in this environment
- 2026-03-23T13:59:10-03:00 - Added quick task T-04: integration-test-task - pending

## Decisions
- Treat `.agents/agents` as a hermetic product entrypoint, not as a thin `uv run` wrapper.
- Keep repo-local UV cache configuration in the validation path so setup and CI do not depend on `~/.cache/uv`.

## Next Step
- Keep the new wrapper-isolation regression in the default script test target and monitor for downstream runtime parity regressions.
