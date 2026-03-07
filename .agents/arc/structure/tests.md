# 🎨 Tests Structure

**Generated:** 2026-03-07T21:25:54+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 57 files, 8,686 lines, 343.4 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/TEST_STRATEGY.md` | 1,385 | 55.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 638 | 22.8 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/zod-skill/references/integrations/README.md` | 617 | 15.7 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/API_REFERENCE.md` | 510 | 16.2 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/lib/helpers.js` | 385 | 12.3 KB | Module; functionality |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 376 | 19.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 370 | 18.7 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 290 | 12.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 225 | 10.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_data/scenarios.yaml` | 212 | 7.2 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/run.js` | 199 | 5.7 KB | Module; functionality |
| `.agents/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 193 | 10.9 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/llm-markdown-skill/references/llm-pipeline-integration.md` | 171 | 3.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/markitdown-skill/references/integrations.md` | 170 | 4.3 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 160 | 7.7 KB | Test file; unit tests |
| `.agents/arc/SPECS/TEMPLATE_spec.md` | 133 | 2.8 KB | Module; functionality |
| `.agents/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 104 | 5.4 KB | Module; functionality |
| `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 101 | 6.0 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/unreal-engine/references/automation-testing/python-tests.md` | 94 | 3.1 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/writing-scaffold.snapshot.test.js` | 92 | 2.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_telemetry.py` | 88 | 4.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `.agents/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 79 | 4.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/fixtures/writing-scaffold/manifests.json` | 76 | 2.3 KB | Module; functionality |
| `.agents/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.5 KB | Module; functionality |
| `.agents/arc/structure/tests.md` | 68 | 6.0 KB | Test file; unit tests |
| `.agents/a-docs/specs/README.md` | 62 | 2.1 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 60 | 2.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 58 | 2.7 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/README.md` | 53 | 1.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/bun-skill/references/internals/platform-tests.md` | 47 | 1.2 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 44 | 1.6 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/local-visual-tests.md` | 44 | 2.1 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `.agents/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 42 | 1.5 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 39 | 1.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync.py` | 39 | 1.7 KB | Test file; unit tests |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `.agents/arc/SPECS/README.md` | 36 | 0.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 34 | 1.4 KB | Test file; unit tests |
| `.agents/arc/SPECS/TEMPLATE_spec-lite.md` | 33 | 0.7 KB | Module; functionality |
| `.agents/arc/SPECS/INDEX.md` | 33 | 2.7 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/package.json` | 26 | 0.6 KB | Module; functionality |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/e2e/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
