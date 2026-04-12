# 🎨 Tests Structure

**Generated:** 2026-04-12T17:15:08+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 65 files, 8,794 lines, 405.5 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 861 | 31.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync.py` | 739 | 32.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 520 | 26.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 427 | 21.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 358 | 16.1 KB | Test file; unit tests |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 327 | 14.6 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 315 | 13.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 314 | 17.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 245 | 11.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md` | 211 | 12.2 KB | Module; functionality |
| `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 211 | 12.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `docs/arc/SPECS/260412_1110_spec-child-and-spec-test-governance_spec_01.md` | 149 | 6.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_repo_map.py` | 137 | 6.0 KB | Test file; unit tests |
| `docs/arc/SPECS/TEMPLATE_spec.md` | 133 | 2.9 KB | Module; functionality |
| `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md` | 125 | 7.2 KB | Module; functionality |
| `.agents/runtime/tests/conftest.py` | 124 | 3.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `docs/arc/SPECS/260323_1751_goal-state-canon_spec_01.md` | 124 | 6.7 KB | Module; functionality |
| `docs/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md` | 119 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | 113 | 5.6 KB | Module; functionality |
| `docs/arc/SPECS/260411_agentic-runtime-restructure_spec_01.md` | 109 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_memory.py` | 107 | 4.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status_summary.py` | 107 | 4.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 104 | 5.4 KB | Module; functionality |
| `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md` | 101 | 5.0 KB | Module; functionality |
| `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 101 | 6.0 KB | Module; functionality |
| `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/scripts/tests/TEST_STRATEGY.md` | 92 | 3.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_telemetry.py` | 88 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_bootstrap.py` | 86 | 4.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `.agents/runtime/tests/test_changes.py` | 84 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `docs/arc/structure/tests.md` | 77 | 6.5 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 74 | 3.2 KB | Test file; unit tests |
| `docs/arc/SPECS/FOLDER_GUIDE.md` | 72 | 2.5 KB | Module; functionality |
| `docs/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_doctor.py` | 68 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/F-14/spec-tests/260412_1130_spec-child-and-spec-test-governance_spec-test_01.md` | 67 | 3.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `.agents/runtime/tests/test_cli.py` | 56 | 2.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 53 | 2.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status.py` | 52 | 2.3 KB | Test file; unit tests |
| `docs/arc/SPECS/TEMPLATE_spec-test.md` | 50 | 1.2 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 48 | 2.1 KB | Test file; unit tests |
| `docs/arc/SPECS/README.md` | 45 | 1.5 KB | Module; functionality |
| `.agents/runtime/tests/test_mcp.py` | 44 | 1.9 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 44 | 1.6 KB | Module; functionality |
| `docs/arc/SPECS/INDEX.md` | 43 | 4.0 KB | Module; functionality |
| `docs/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `docs/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 42 | 1.5 KB | Module; functionality |
| `docs/arc/SPECS/TEMPLATE_spec-child.md` | 41 | 0.9 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `docs/arc/SPECS/TEMPLATE_spec-lite.md` | 36 | 0.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_session.py` | 32 | 1.5 KB | Test file; unit tests |
| `.agents/runtime/tests/test_runtime.py` | 20 | 1.0 KB | Test file; unit tests |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
