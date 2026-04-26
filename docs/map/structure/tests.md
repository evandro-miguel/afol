# 🎨 Tests Structure

**Generated:** 2026-04-26T16:04:47+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 122 files, 22,717 lines, 1080.1 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/test_cli_utility_coverage.py` | 1,165 | 57.5 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_cli_utility_coverage.py` | 1,165 | 57.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 937 | 35.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync.py` | 883 | 39.4 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_verify_tasks_strict.py` | 861 | 31.9 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_skills_sync.py` | 799 | 36.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 576 | 31.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 542 | 27.5 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_execution_command_scenarios.py` | 520 | 26.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync_extra.py` | 446 | 22.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 427 | 21.7 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_execution_command_flow.py` | 427 | 21.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 383 | 17.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_runtime_compatibility.py` | 365 | 20.8 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_new_quick_mode.py` | 358 | 16.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md` | 353 | 19.3 KB | Module; functionality |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 345 | 15.6 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/integration/test_critical_workflows.py` | 328 | 14.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 327 | 15.4 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 315 | 13.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_implement.py` | 315 | 18.0 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/conftest.py` | 315 | 13.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_revert.py` | 273 | 14.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_benchmark.py` | 261 | 11.0 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_benchmark.py` | 261 | 11.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_fix_symlinks.py` | 252 | 12.1 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 245 | 11.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status.py` | 231 | 11.5 KB | Test file; unit tests |
| `docs/arc/SPECS/260423_1605_controlled-runtime-flow-benchmarks_spec_01.md` | 222 | 10.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_repo_map.py` | 218 | 9.8 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_repo_map.py` | 218 | 9.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_session.py` | 214 | 11.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md` | 211 | 12.2 KB | Module; functionality |
| `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 211 | 12.0 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_review.py` | 198 | 11.1 KB | Test file; unit tests |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md` | 187 | 8.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_repo_map_extra.py` | 178 | 9.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md` | 161 | 7.2 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_bootstrap.py` | 155 | 8.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260412_1110_spec-child-and-spec-test-governance_spec_01.md` | 149 | 6.9 KB | Test file; unit tests |
| `docs/arc/SPECS/260426_1215_parallel-session-isolation_spec_01.md` | 149 | 7.0 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 140 | 7.6 KB | Test file; unit tests |
| `docs/map/structure/tests.md` | 134 | 12.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_telemetry.py` | 130 | 6.6 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md` | 125 | 7.2 KB | Module; functionality |
| `.agents/runtime/tests/conftest.py` | 124 | 3.8 KB | Test file; unit tests |
| `src/project-template/.agents/runtime/tests/conftest.py` | 124 | 3.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `docs/arc/SPECS/260323_1751_goal-state-canon_spec_01.md` | 124 | 6.7 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 120 | 5.1 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 120 | 5.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md` | 119 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_script_process_utils.py` | 114 | 5.2 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | 113 | 5.6 KB | Module; functionality |
| `.agents/runtime/tests/test_runtime.py` | 111 | 5.3 KB | Test file; unit tests |
| `src/project-template/.agents/runtime/tests/test_runtime.py` | 111 | 5.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260423_1821_runtime-flow-benchmark-runner_spec-child_01.md` | 110 | 4.9 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_status_summary.py` | 109 | 4.5 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_bootstrap.py` | 109 | 6.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260411_agentic-runtime-restructure_spec_01.md` | 109 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_memory.py` | 107 | 4.4 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_memory.py` | 107 | 4.4 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_status_summary.py` | 107 | 4.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 105 | 6.1 KB | Module; functionality |
| `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md` | 101 | 5.0 KB | Module; functionality |
| `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 101 | 6.0 KB | Module; functionality |
| `docs/arc/SPECS/260423_2006_runtime-flow-benchmark-live-agent_spec-child_01.md` | 96 | 4.3 KB | Module; functionality |
| `.agents/runtime/tests/test_mcp.py` | 93 | 4.4 KB | Test file; unit tests |
| `src/project-template/.agents/runtime/tests/test_mcp.py` | 93 | 4.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/scripts/tests/TEST_STRATEGY.md` | 92 | 3.9 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/TEST_STRATEGY.md` | 92 | 3.9 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_telemetry.py` | 88 | 4.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `.agents/runtime/tests/test_cli.py` | 84 | 4.3 KB | Test file; unit tests |
| `.agents/runtime/tests/test_changes.py` | 84 | 3.6 KB | Test file; unit tests |
| `src/project-template/.agents/runtime/tests/test_cli.py` | 84 | 4.3 KB | Test file; unit tests |
| `src/project-template/.agents/runtime/tests/test_changes.py` | 84 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md` | 77 | 3.1 KB | Module; functionality |
| `docs/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `docs/arc/SPECS/FOLDER_GUIDE.md` | 72 | 2.5 KB | Module; functionality |
| `docs/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_doctor.py` | 68 | 3.6 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_doctor.py` | 68 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/F-14/spec-tests/260412_1130_spec-child-and-spec-test-governance_spec-test_01.md` | 67 | 3.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260413_1250_project-template-source-separation_spec-child_01.md` | 61 | 2.4 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 60 | 2.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `docs/arc/SPECS/INDEX.md` | 54 | 6.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/test_agents_doctor_fix.py` | 53 | 2.5 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_status.py` | 52 | 2.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_tools_catalog.py` | 48 | 2.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 47 | 2.1 KB | Module; functionality |
| `docs/arc/SPECS/260423_2120_runtime-flow-benchmark-scenarios_spec-child_01.md` | 47 | 1.8 KB | Module; functionality |
| `src/project-template/docs/arc/SPECS/README.md` | 45 | 1.5 KB | Module; functionality |
| `docs/arc/SPECS/README.md` | 45 | 1.5 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 44 | 2.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 43 | 1.9 KB | Module; functionality |
| `docs/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260415_2121_scripts-cleanup-optimization_spec-child_01.md` | 33 | 1.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/test_agents_session.py` | 32 | 1.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_markdown_docs.py` | 29 | 1.2 KB | Test file; unit tests |
| `src/project-template/.agents/scripts/tests/test_markdown_docs.py` | 29 | 1.2 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_config_parse_offset.py` | 17 | 0.8 KB | Test file; unit tests |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
