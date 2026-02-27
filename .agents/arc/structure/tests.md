# 🎨 Tests Structure

**Generated:** 2026-02-27T15:00:37+00:00
**Last Update:** First run

Unit tests, integration tests, and E2E tests.

---

## 📁 Directory Overview

**Stats:** 47 files, 7,981 lines, 264.8 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/tests/TEST_STRATEGY.md` | 1,385 | 55.9 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/zod-skill/references/integrations/README.md` | 617 | 15.7 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/API_REFERENCE.md` | 510 | 16.2 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/references/server-types.md` | 431 | 10.4 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/SKILL.md` | 417 | 12.2 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/references/tool-usage.md` | 417 | 11.4 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/references/authentication.md` | 415 | 10.0 KB | Module; functionality |
| `.agents/scripts/tests/test_verify_tasks_strict.py` | 397 | 13.9 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/lib/helpers.js` | 385 | 12.3 KB | Module; functionality |
| `.agents/scripts/tests/conftest.py` | 290 | 12.4 KB | Test file; unit tests |
| `.agents/scripts/tests/test_data/scenarios.yaml` | 212 | 7.2 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/run.js` | 199 | 5.7 KB | Module; functionality |
| `.agents/scripts/tests/unit/test_refactored_functions.py` | 196 | 7.0 KB | Test file; unit tests |
| `.agents/scripts/tests/unit/test_version.py` | 189 | 9.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_wb_update_task_marker.py` | 176 | 7.6 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/llm-markdown-skill/references/llm-pipeline-integration.md` | 171 | 3.9 KB | Module; functionality |
| `.agents/cache/universal-skills/skills/markitdown-skill/references/integrations.md` | 170 | 4.3 KB | Module; functionality |
| `.agents/scripts/tests/integration/test_critical_workflows.py` | 154 | 5.3 KB | Test file; unit tests |
| `.agents/arc/SPECS/TEMPLATE_spec.md` | 133 | 2.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_new_quick_mode.py` | 100 | 4.6 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/unreal-engine/references/automation-testing/python-tests.md` | 94 | 3.1 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/writing-scaffold.snapshot.test.js` | 92 | 2.7 KB | Test file; unit tests |
| `.agents/cache/universal-skills/tests/fixtures/writing-scaffold/manifests.json` | 76 | 2.3 KB | Module; functionality |
| `.agents/a-docs/specs/README.md` | 68 | 1.7 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_telemetry.py` | 60 | 2.9 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_lint_noise_reduction.py` | 58 | 2.3 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/README.md` | 53 | 1.9 KB | Module; functionality |
| `.agents/arc/structure/tests.md` | 51 | 4.2 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/bun-skill/references/internals/platform-tests.md` | 47 | 1.2 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/local-visual-tests.md` | 44 | 2.1 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_tools_catalog.py` | 39 | 1.5 KB | Test file; unit tests |
| `.agents/scripts/tests/unit/test_agents_config_active_session.py` | 38 | 2.0 KB | Test file; unit tests |
| `.agents/arc/SPECS/README.md` | 36 | 0.8 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_frontmatter.py` | 35 | 1.3 KB | Test file; unit tests |
| `.agents/scripts/tests/test_agents_doctor_fix.py` | 34 | 1.4 KB | Test file; unit tests |
| `.agents/arc/SPECS/TEMPLATE_spec-lite.md` | 33 | 0.7 KB | Module; functionality |
| `.agents/scripts/tests/test_agents_lint_state_board.py` | 33 | 1.4 KB | Test file; unit tests |
| `.agents/cache/universal-skills/skills/playwright-skill/references/e2e/package.json` | 26 | 0.6 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/examples/stdio-server.json` | 26 | 0.7 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/examples/http-server.json` | 20 | 0.5 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/mcp-integration/examples/sse-server.json` | 19 | 0.4 KB | Module; functionality |
| `C:/Users/evand/.claude/plugins/marketplaces/claude-plugins-official/plugins/hookify/examples/require-tests-stop.local.md` | 18 | 0.5 KB | Test file; unit tests |
| `.agents/arc/SPECS/INDEX.md` | 13 | 0.3 KB | Module; functionality |
| `.agents/scripts/tests/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/integration/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/e2e/__init__.py` | 1 | 0.0 KB | Module; functionality |
| `.agents/scripts/tests/unit/__init__.py` | 1 | 0.0 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
