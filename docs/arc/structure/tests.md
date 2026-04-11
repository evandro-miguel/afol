# 🎨 Tests Structure

**Generated:** 2026-04-11T18:27:22+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 57 files, 8,011 lines, 367.2 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 861 | 31.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_skills_sync.py` | 712 | 32.0 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_scenarios.py` | 499 | 25.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_execution_command_flow.py` | 427 | 21.7 KB | Test file; unit tests |
| `.agents/scripts/tests/conftest.py` | 315 | 13.4 KB | Test file; unit tests |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 304 | 13.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_runtime_compatibility.py` | 287 | 16.6 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 284 | 12.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 225 | 10.1 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md` | 211 | 12.2 KB | Module; functionality |
| `docs/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md` | 193 | 10.9 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `.agents/skills/markdownlint-skill/references/llm-pipeline-integration.md` | 171 | 3.9 KB | Module; functionality |
| `docs/arc/SPECS/260306_primary-agent-runtime-compatibility_spec_01.md` | 171 | 8.4 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_repo_map.py` | 137 | 6.0 KB | Test file; unit tests |
| `docs/arc/SPECS/TEMPLATE_spec.md` | 133 | 2.9 KB | Module; functionality |
| `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md` | 124 | 7.7 KB | Module; functionality |
| `docs/arc/SPECS/260323_1751_goal-state-canon_spec_01.md` | 124 | 6.7 KB | Module; functionality |
| `docs/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md` | 121 | 7.0 KB | Module; functionality |
| `docs/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md` | 119 | 5.8 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 117 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_knowledge.py` | 115 | 5.3 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | 113 | 5.6 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_memory.py` | 107 | 4.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status_summary.py` | 107 | 4.4 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | 104 | 5.4 KB | Module; functionality |
| `docs/arc/SPECS/260307_persistent-planning-memory_spec_01.md` | 101 | 6.0 KB | Module; functionality |
| `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | 93 | 4.0 KB | Module; functionality |
| `.agents/scripts/tests/TEST_STRATEGY.md` | 92 | 3.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260323_1815_execplan-native-planning-system_spec_01.md` | 90 | 4.5 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_telemetry.py` | 88 | 4.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_bootstrap.py` | 86 | 4.8 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | 85 | 3.6 KB | Module; functionality |
| `docs/arc/SPECS/260306_guided-status-and-implementation_spec_01.md` | 82 | 3.1 KB | Module; functionality |
| `docs/arc/SPECS/260306_review-and-logical-revert_spec_01.md` | 76 | 2.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 74 | 3.2 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_runtime-command-parity_spec_01.md` | 71 | 2.6 KB | Module; functionality |
| `docs/arc/structure/tests.md` | 69 | 5.8 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor.py` | 68 | 3.6 KB | Test file; unit tests |
| `docs/arc/SPECS/FOLDER_GUIDE.md` | 62 | 2.1 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 58 | 2.7 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 53 | 2.5 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_status.py` | 52 | 2.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 48 | 2.1 KB | Test file; unit tests |
| `.agents/skills/bun-skill/references/internals/platform-tests.md` | 47 | 1.2 KB | Test file; unit tests |
| `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md` | 44 | 1.6 KB | Module; functionality |
| `docs/arc/SPECS/260306_knowledge-reuse-and-token-efficiency_spec_01.md` | 42 | 1.6 KB | Module; functionality |
| `docs/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md` | 42 | 1.5 KB | Module; functionality |
| `docs/arc/SPECS/INDEX.md` | 41 | 3.7 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `docs/arc/SPECS/README.md` | 36 | 0.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `docs/arc/SPECS/TEMPLATE_spec-lite.md` | 33 | 0.7 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_session.py` | 32 | 1.5 KB | Test file; unit tests |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
