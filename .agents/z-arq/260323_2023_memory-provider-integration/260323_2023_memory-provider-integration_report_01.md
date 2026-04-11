---
doc_type: report
id: 260323_2023_memory-provider-integration_report_01
theme: memory-provider-integration
status: final
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
related_tasks:
- <optional_task_id>
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_2023_memory-provider-integration_plan_01
  task: 260323_2023_memory-provider-integration_task_01
  postmortem: 260323_2023_memory-provider-integration_postmortem_01
---

# Report: memory-provider-integration

## Governance Context
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`
- Child spec: ``

## Summary
- Added a new optional `memory` command family to the scaffold so interactive runtimes can retrieve external memory through deterministic MCP contracts without weakening repo-local governance.

## Delivered Changes
- Added `.agents/scripts/agents-memory.py` with `status`, `search`, `context`, `recent`, and `show` subcommands.
- Added configurable external-memory defaults to `.agents/agents.config` and `.agents/scripts/lib/agents_config.py`.
- Wired `memory` into `.agents/agents`, `.agents/tools.json`, and `.agents/a-docs/standards/Makefile`.
- Updated `AGENTS.md`, runtime mirrors, `README.md`, and standards docs to document the `knowledge -> memory -> repo reread` order and the non-canonical role of external memory.
- Added canonical agentic reference docs and index entries so the feature is discoverable from `.agents/a-docs/agentic/` and quick-reference surfaces.
- Added tests covering memory command output and tool-catalog registration.

## Files Changed
- `.agents/scripts/agents-memory.py`
- `.agents/scripts/lib/agents_config.py`
- `.agents/scripts/tests/test_agents_memory.py`
- `.agents/scripts/tests/test_agents_tools_catalog.py`
- `.agents/agents`
- `.agents/agents.config`
- `.agents/tools.json`
- `.agents/a-docs/standards/Makefile`
- `AGENTS.md`
- `README.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-usage.md`
- `.agents/a-docs/agentic/agents-memory.md`
- `.agents/a-docs/agentic/INDEX.md`
- `.agents/a-docs/agentic/README.md`
- `.agents/a-docs/agentic/agents-config.md`
- `.agents/a-docs/agentic/agents-wrapper.md`
- `.agents/a-docs/agentic/makefile.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `OPENCODE.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`

## Verification
- Unit tests: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_memory.py -q` -> pass -> Evidence: `4 passed`
- E2E tests: `./.agents/agents memory search "agent memory mcp integration" --runtime codex` and `./.agents/agents memory context "persistent planning memory" --runtime codex` -> pass -> Evidence: emitted exact `basic_memory` contracts with `search_notes` and `build_context`
- Typecheck: `N/A` -> pass -> Evidence: Python-only command family validated through unit tests and lint
- Lint: `make lint` and `make lint-scripts` -> pass -> Evidence: `Issues found: 0` and `All checks passed!`
- Additional checks:
  - `./.agents/agents tools validate` -> pass -> Evidence: `Catalog is valid`
  - `make doctor` -> pass -> Evidence: `No issues found`
  - `make test-scripts` -> pass -> Evidence: `144 passed, 6 deselected`
  - `make all` -> pass -> Evidence: `✓ All validations passed`

## Risks / Follow-ups
- Future provider-specific execution bridges may be useful, but they should remain optional and must not blur the contract-only nature of the scaffold surface unless the host/runtime path is truly executable.

## Postmortem Link
- Postmortem: `260323_2023_memory-provider-integration_postmortem_01`

## Lessons (if any)
- No new correction-driven lesson entry was required. The main reusable takeaway is captured in the workstream itself: external memory integration in a CLI-first scaffold should govern runtime contracts instead of pretending shell commands can call MCP tools directly.

---
*Template: `.agents/a-docs/templates/report.md`*
