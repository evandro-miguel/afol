# 🎨 Tests Structure

**Generated:** 2026-03-23T23:31:40+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 94 files, 15,285 lines, 625.9 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/TEST_STRATEGY.md` | 1,385 | 55.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 772 | 28.2 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/zod-skill/references/integrations/README.md` | 617 | 15.7 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/skills/scripts/fix-skill.test.ts` | 614 | 18.6 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/skills/scripts/create-skill.test.ts` | 571 | 18.8 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/skills/scripts/skill-advisor.test.ts` | 542 | 19.3 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/API_REFERENCE.md` | 510 | 16.2 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/skills/scripts/skill-files.test.ts` | 434 | 16.1 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/skills/scripts/check-universal-skills-sync.test.ts` | 428 | 17.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 410 | 21.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 392 | 19.6 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/lib/helpers.js` | 385 | 12.3 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/skills/scripts/check-skill.test.ts` | 357 | 13.2 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/skills/scripts/check-tier-migration.test.ts` | 306 | 13.0 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 290 | 12.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 258 | 14.9 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/skills/scripts/cleanup-empty-folders.test.ts` | 238 | 10.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync.py` | 235 | 10.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 225 | 10.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_data/scenarios.yaml` | 212 | 7.2 KB | Module; functionality |
| `.agents/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md` | 211 | 12.1 KB | Module; functionality |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 199 | 9.9 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/run.js` | 199 | 5.7 KB | Module; functionality |
| `.agents/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 193 | 10.9 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `.agents/skills/markdownlint-skill/references/llm-pipeline-integration.md` | 171 | 3.9 KB | Module; functionality |
| `.agents/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/markdownlint-skill/references/llm-pipeline-integration.md` | 171 | 3.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/markitdown-skill/references/integrations.md` | 170 | 4.3 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 160 | 7.7 KB | Test file; unit tests |
| `.agents/arc/SPECS/TEMPLATE_spec.md` | 133 | 2.8 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_plan_01.md` | 133 | 8.3 KB | Module; functionality |
| `.agents/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `.agents/arc/SPECS/260323_1751_goal-state-canon_spec_01.md` | 124 | 6.7 KB | Module; functionality |
| `.agents/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md` | 121 | 7.0 KB | Module; functionality |
| `.agents/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md` | 119 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | 113 | 5.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_memory.py` | 107 | 4.4 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 104 | 5.4 KB | Module; functionality |
| `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 101 | 6.0 KB | Module; functionality |
| `.agents/arc/structure/tests.md` | 96 | 9.7 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/unreal-engine/references/automation-testing/python-tests.md` | 94 | 3.1 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_repo_map.py` | 92 | 4.1 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/writing-scaffold.snapshot.test.js` | 92 | 2.8 KB | Test file; unit tests |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_plan_01.md` | 92 | 4.8 KB | Module; functionality |
| `.agents/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md` | 90 | 4.5 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_telemetry.py` | 88 | 4.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/skills/scripts/README.md` | 85 | 3.8 KB | Module; functionality |
| `.agents/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_task_01.md` | 79 | 3.6 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_report_01.md` | 78 | 4.8 KB | Module; functionality |
| `.agents/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `.agents/cache/universal-skills/tests/fixtures/writing-scaffold/manifests.json` | 76 | 2.3 KB | Module; functionality |
| `.agents/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.5 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_brainstorm_01.md` | 64 | 3.5 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_explorer-check_01.md` | 64 | 3.3 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_task_01.md` | 63 | 2.4 KB | Module; functionality |
| `.agents/a-docs/specs/README.md` | 62 | 2.1 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_brainstorm_01.md` | 62 | 3.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 60 | 2.4 KB | Test file; unit tests |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_explorer-check_01.md` | 59 | 2.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 53 | 2.5 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/README.md` | 53 | 1.9 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_spec-lite_01.md` | 49 | 2.4 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_postmortem_01.md` | 49 | 3.3 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 48 | 2.1 KB | Test file; unit tests |
| `.agents/skills/bun-skill/references/internals/platform-tests.md` | 47 | 1.2 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/bun-skill/references/internals/platform-tests.md` | 47 | 1.2 KB | Test file; unit tests |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_report_01.md` | 45 | 1.4 KB | Module; functionality |
| `.agents/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 44 | 1.6 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/local-visual-tests.md` | 44 | 2.1 KB | Test file; unit tests |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_spec-lite_01.md` | 44 | 2.0 KB | Module; functionality |
| `.agents/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `.agents/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 42 | 1.5 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_log_01.md` | 41 | 2.8 KB | Module; functionality |
| `.agents/arc/SPECS/INDEX.md` | 40 | 3.8 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_postmortem_01.md` | 39 | 1.2 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `.agents/arc/SPECS/README.md` | 36 | 0.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_research_01.md` | 35 | 2.5 KB | Module; functionality |
| `.agents/arc/SPECS/TEMPLATE_spec-lite.md` | 33 | 0.7 KB | Module; functionality |
| `.agents/wb/260323_1705_universal-skills-runtime-integration/260323_1705_universal-skills-runtime-integration_research_01.md` | 33 | 1.9 KB | Module; functionality |
| `.agents/wb/260323_2023_memory-provider-integration/260323_2023_memory-provider-integration_log_01.md` | 31 | 0.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/package.json` | 26 | 0.6 KB | Module; functionality |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/e2e/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
