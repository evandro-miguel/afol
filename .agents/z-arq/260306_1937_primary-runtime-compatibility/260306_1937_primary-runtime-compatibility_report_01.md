---
doc_type: report
id: 260306_1937_primary-runtime-compatibility_report_01
theme: primary-runtime-compatibility
status: final
created_at: '2026-03-06T19:37:14-03:00'
updated_at: '2026-03-06T19:50:11-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
- T-05
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_1937_primary-runtime-compatibility_plan_01
  task: 260306_1937_primary-runtime-compatibility_task_01
---

# Report: primary-runtime-compatibility

## Governance Context
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`
- Child spec: ``

## Summary
- Delivered a stronger runtime compatibility layer for the scaffold, with OpenCode promoted to first-class committed support and enforcement added for the primary runtime set: OpenCode, Codex, and Qwen.

## Delivered Changes
- Added OpenCode project adapter support to sync, bootstrap, standards, and repo documentation.
- Added runtime health checks to `doctor` for primary runtime entrypoints, folders, skills links, and `opencode.json`.
- Standardized runtime README contract language across `.opencode/`, `.codex/`, and `.qwen/`.
- Added a research artifact tying runtime decisions back to official vendor documentation.

## Files Changed
- `.agents/arc/GENERAL-ROADMAP.md`
- `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md`
- `.agents/a-docs/standards/primary-runtime-compatibility.md`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/scripts/agents-doctor.py`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/sync-agent-docs.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/tools.json`
- `AGENTS.md`
- `README.md`
- `OPENCODE.md`
- `opencode.json`
- `.opencode/README.md`
- `.opencode/agent/README.md`
- `.codex/README.md`
- `.qwen/README.md`
- `260306_1937_primary-runtime-compatibility_research_01.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: `72 passed, 5 deselected`
- E2E tests: `N/A`
- Typecheck: `N/A`
- Lint: `make lint` -> pass -> Evidence: `Files checked: 216`, `Issues found: 0`
- Additional checks:
  - `make sync` -> pass -> Evidence: `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md` regenerated from `AGENTS.md`
  - `make index` -> pass -> Evidence: `.agents/arc/SPECS/INDEX.md` refreshed with 2 spec files
  - `make doctor` -> pass -> Evidence: primary runtime compatibility checks passed for `OPENCODE.md`, `QWEN.md`, `AGENTS.md`, `.opencode/`, `.codex/`, and `.qwen/`
  - `make all` -> pass -> Evidence: aggregate validation completed successfully, including tools smoke and telemetry validation

## Risks / Follow-ups
- The scaffold still needs a formal threshold rule for when `spec-lite` is acceptable and when child-spec decomposition is mandatory; that belongs to roadmap features `F-02` and `F-03`.

## Lessons (if any)
- Keep the tool catalog in sync with runtime support changes. If `sync` adds a new runtime target, `tools.json` must be updated in the same change.

---
*Template: `.agents/a-docs/templates/report.md`*
