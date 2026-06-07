# 🎨 Tests Structure

**Generated:** 2026-06-07T11:53:51+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 136 files, 28,555 lines, 1309.9 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/test_agents_skills_sync.py` | 1,763 | 79.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_cli_utility_coverage.py` | 1,537 | 68.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 1,386 | 55.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_benchmark.py` | 885 | 37.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 868 | 46.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 781 | 40.1 KB | Test file; unit tests |
| `.agents/runtime/tests/test_cli.py` | 674 | 30.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 602 | 27.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_scaffold_update.py` | 570 | 30.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 553 | 27.3 KB | Test file; unit tests |
| `cli/tests/validation.test.ts` | 521 | 23.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 478 | 23.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync_extra.py` | 477 | 23.3 KB | Test file; unit tests |
| `.agents/runtime/tests/test_changes.py` | 447 | 23.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_implement.py` | 446 | 20.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_bootstrap.py` | 431 | 22.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md` | 422 | 23.3 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_session.py` | 392 | 18.5 KB | Test file; unit tests |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 387 | 16.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md` | 372 | 14.5 KB | Module; functionality |
| `cli/tests/mutation-safety.test.ts` | 344 | 11.0 KB | Test file; unit tests |
| `cli/tests/kernel.test.ts` | 342 | 14.1 KB | Test file; unit tests |
| `.agents/skills/node/rules/flaky-tests.md` | 331 | 10.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status.py` | 316 | 16.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_review.py` | 312 | 13.9 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 311 | 13.3 KB | Test file; unit tests |
| `cli/tests/local-state-indexes.test.ts` | 298 | 10.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_revert.py` | 297 | 14.3 KB | Test file; unit tests |
| `.agents/runtime/tests/test_runtime.py` | 290 | 14.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_fix_symlinks.py` | 284 | 13.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_repo_map.py` | 284 | 12.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_front_door_a.py` | 241 | 10.7 KB | Test file; unit tests |
| `cli/tests/status.test.ts` | 235 | 7.7 KB | Test file; unit tests |
| `cli/tests/workbench-verify.test.ts` | 231 | 8.0 KB | Test file; unit tests |
| `cli/tests/workbench-lifecycle.test.ts` | 230 | 8.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260423_1605_controlled-runtime-flow-benchmarks_spec_01.md` | 222 | 10.6 KB | Module; functionality |
| `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md` | 211 | 12.2 KB | Module; functionality |
| `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 211 | 12.0 KB | Module; functionality |
| `docs/arc/SPECS/260521_0100_runtime-adapters-and-mcp_spec_01.md` | 192 | 7.8 KB | Module; functionality |
| `docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md` | 191 | 8.7 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_local_state.py` | 189 | 10.2 KB | Test file; unit tests |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0010_universal-agent-cli_spec_01.md` | 187 | 7.9 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_telemetry.py` | 183 | 9.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0030_agent-command-design-system_spec_01.md` | 181 | 6.4 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_repo_map_extra.py` | 178 | 9.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `docs/arc/SPECS/F-11/spec-tests/260521_0145_validation-ci-benchmark-matrix_spec-test_01.md` | 170 | 6.4 KB | Test file; unit tests |
| `cli/tests/update-command.test.ts` | 167 | 6.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 167 | 7.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 164 | 8.0 KB | Test file; unit tests |
| `cli/tests/bootstrap.test.ts` | 162 | 8.2 KB | Test file; unit tests |
| `.agents/runtime/tests/test_mcp.py` | 162 | 7.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260413_1849_just-command-runner-migration_spec_01.md` | 161 | 7.4 KB | Module; functionality |
| `docs/arc/SPECS/260531_0000_template-cli-boundary-hardening_spec_01.md` | 154 | 7.4 KB | Module; functionality |
| `docs/arc/SPECS/260412_1110_spec-child-and-spec-test-governance_spec_01.md` | 154 | 7.2 KB | Test file; unit tests |
| `cli/tests/validate-command.test.ts` | 154 | 6.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260426_1215_parallel-session-isolation_spec_01.md` | 149 | 7.0 KB | Module; functionality |
| `.agents/runtime/tests/conftest.py` | 148 | 4.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0020_minimal-project-template_spec_01.md` | 145 | 5.2 KB | Module; functionality |
| `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | 139 | 7.6 KB | Module; functionality |
| `cli/tests/project-root.test.ts` | 139 | 5.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260509_1453_plan-task-execution-integrity-state-model_spec-child_01.md` | 128 | 8.5 KB | Module; functionality |
| `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md` | 125 | 7.2 KB | Module; functionality |
| `docs/arc/SPECS/260323_1751_goal-state-canon_spec_01.md` | 124 | 6.7 KB | Module; functionality |
| `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 123 | 7.3 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 120 | 5.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260411_agentic-runtime-restructure_spec_01.md` | 119 | 6.6 KB | Module; functionality |
| `docs/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md` | 119 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `cli/tests/log-command.test.ts` | 114 | 4.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_script_process_utils.py` | 114 | 5.2 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_memory.py` | 113 | 4.5 KB | Test file; unit tests |
| `docs/arc/SPECS/260423_1821_runtime-flow-benchmark-runner_spec-child_01.md` | 110 | 4.9 KB | Module; functionality |
| `cli/tests/template-policy.test.ts` | 108 | 4.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status_summary.py` | 107 | 4.5 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 105 | 6.1 KB | Module; functionality |
| `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md` | 101 | 5.0 KB | Module; functionality |
| `docs/arc/SPECS/260423_2006_runtime-flow-benchmark-live-agent_spec-child_01.md` | 96 | 4.3 KB | Module; functionality |
| `cli/tests/verify-command.test.ts` | 96 | 3.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/skills/node/rules/stuck-processes-and-tests.md` | 93 | 3.9 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0120_public-distribution-and-onboarding_spec_01.md` | 92 | 4.3 KB | Module; functionality |
| `.agents/scripts/tests/TEST_STRATEGY.md` | 92 | 3.9 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0070_local-state-index-and-event-log_spec_01.md` | 91 | 4.3 KB | Module; functionality |
| `docs/arc/SPECS/F-01/spec-tests/260521_0130_universal-agent-cli-kernel-contract_spec-test_01.md` | 90 | 3.2 KB | Test file; unit tests |
| `cli/tests/bootstrap-cleanup.test.ts` | 89 | 5.2 KB | Test file; unit tests |
| `cli/tests/downstream-smoke.test.ts` | 88 | 3.2 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0050_smart-rules-and-skills-routing_spec_01.md` | 86 | 3.9 KB | Module; functionality |
| `docs/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `docs/arc/SPECS/INDEX.md` | 83 | 13.8 KB | Module; functionality |
| `docs/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `.agents/scripts/tests/test_session_resolution_contract.py` | 82 | 4.2 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md` | 81 | 3.6 KB | Module; functionality |
| `docs/arc/SPECS/260413_1250_project-template-source-separation_spec_01.md` | 79 | 3.6 KB | Module; functionality |
| `cli/tests/rule-command.test.ts` | 77 | 2.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `docs/arc/SPECS/260521_0080_safe-file-mutation-and-undo_spec_01.md` | 74 | 3.4 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 73 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/FOLDER_GUIDE.md` | 72 | 2.5 KB | Module; functionality |
| `docs/arc/SPECS/F-10/spec-tests/260521_0140_runtime-adapters-and-mcp-parity_spec-test_01.md` | 72 | 2.6 KB | Test file; unit tests |
| `cli/tests/bootstrap-conflicts.test.ts` | 72 | 2.6 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.6 KB | Module; functionality |
| `docs/arc/SPECS/260528_1723_map-boundary-cleanup_spec-child_01.md` | 68 | 2.8 KB | Module; functionality |
| `docs/arc/SPECS/260521_0040_governance-workbench-system_spec_01.md` | 68 | 2.9 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_doctor.py` | 68 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/F-14/spec-tests/260412_1130_spec-child-and-spec-test-governance_spec-test_01.md` | 67 | 3.0 KB | Test file; unit tests |
| `cli/tests/registry.test.ts` | 66 | 3.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260528_1745_runtime-registry-parity_spec-child_01.md` | 63 | 2.7 KB | Module; functionality |
| `docs/arc/SPECS/260528_1759_python-command-simplification_spec-child_01.md` | 63 | 2.9 KB | Module; functionality |
| `docs/arc/SPECS/260521_0000_total-reformulation-strategy_spec_01.md` | 61 | 2.5 KB | Module; functionality |
| `docs/arc/SPECS/260413_1250_project-template-source-separation_spec-child_01.md` | 61 | 2.4 KB | Module; functionality |
| `docs/arc/SPECS/260528_2022_runtime-mirror-cleanup_spec-child_01.md` | 61 | 2.7 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 59 | 3.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260528_1913_command-parity-gate-hardening_spec-child_01.md` | 58 | 2.5 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `docs/arc/SPECS/260521_0060_file-first-low-token-execution_spec_01.md` | 55 | 2.2 KB | Module; functionality |
| `cli/tests/skill-command.test.ts` | 55 | 2.1 KB | Test file; unit tests |
| `docs/arc/SPECS/F-03/spec-tests/260521_0135_agent-command-design-system_spec-test_01.md` | 54 | 2.0 KB | Test file; unit tests |
| `docs/arc/SPECS/260528_1946_bootstrap-template-justfile-wiring_spec-child_01.md` | 53 | 2.4 KB | Module; functionality |
| `docs/arc/SPECS/F-02/spec-tests/260521_0132_minimal-project-template-export_spec-test_01.md` | 48 | 1.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260423_2120_runtime-flow-benchmark-scenarios_spec-child_01.md` | 47 | 1.8 KB | Module; functionality |
| `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 47 | 2.1 KB | Module; functionality |
| `docs/arc/SPECS/README.md` | 45 | 1.5 KB | Module; functionality |
| `src/project-template/docs/arc/SPECS/README.md` | 45 | 1.5 KB | Module; functionality |
| `docs/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 43 | 1.9 KB | Module; functionality |
| `docs/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_config_parse_offset.py` | 36 | 1.9 KB | Test file; unit tests |
| `docs/arc/SPECS/260415_2121_scripts-cleanup-optimization_spec-child_01.md` | 35 | 1.5 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.4 KB | Test file; unit tests |
| `cli/tests/bootstrap-template-cleanliness.test.ts` | 32 | 1.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_markdown_docs.py` | 25 | 1.2 KB | Test file; unit tests |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
