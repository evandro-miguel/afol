---
doc_type: log
id: 260306_1937_primary-runtime-compatibility_log_01
theme: primary-runtime-compatibility
status: active
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

# Log: primary-runtime-compatibility

## Governance Context
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`
- Child spec: ``

## Timeline
- 2026-03-06 22:36Z - reviewed official runtime documentation - confirmed project-level adapter surfaces and approval/sandbox differences for OpenCode, Codex, and Qwen.
- 2026-03-06 22:39Z - updated scaffold runtime support - added OpenCode project adapter, runtime standard, bootstrap coverage, and sync coverage.
- 2026-03-06 22:47Z - added runtime validation - `agents-doctor.py` now checks primary runtime entrypoints, runtime folders, skills links, and `opencode.json` integrity.
- 2026-03-06 22:52Z - closed parity drift - updated tool catalog, sync fallback, runtime READMEs, and bootstrap docs to distinguish primary runtimes from compatibility mirrors.
- 2026-03-06 22:54Z - generated runtime mirrors and refreshed indexes - `make sync` created `OPENCODE.md`; `make index` updated the specs index.

## Decisions
- OpenCode receives a committed root adapter (`opencode.json`) because official docs expose a meaningful project-level config surface.
- Codex continues to use `AGENTS.md` as the canonical repo entrypoint because the runtime contract is instruction-first rather than config-file-first.
- Runtime support quality is enforced in `doctor` so primary-runtime drift fails health checks instead of surviving as documentation debt.
- Claude and Gemini stay in the scaffold as compatibility mirrors, but primary-support language now explicitly prioritizes OpenCode, Codex, and Qwen.

## Blockers
- None.

## Next Step
- Finalize the report and close the workstream.

---
*Template: `.agents/a-docs/templates/log.md`*
