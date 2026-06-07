# 🎨 Backend Structure

**Generated:** 2026-06-07T09:09:44+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 94 files, 30,839 lines, 1383.2 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/agents-benchmark.py` | 1,796 | 86.5 KB | Module; functionality |
| `.agents/scripts/agents-skills-sync.py` | 1,733 | 74.2 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 1,488 | 60.4 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 1,363 | 54.1 KB | Module; functionality |
| `.agents/scripts/lib/execution_commands.py` | 1,348 | 52.4 KB | Module; functionality |
| `cli/validate/contract.ts` | 1,022 | 36.3 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 1,016 | 41.3 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 966 | 42.7 KB | Module; functionality |
| `cli/commands/file.ts` | 955 | 30.8 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 787 | 32.0 KB | Module; functionality |
| `.agents/scripts/agents-scaffold-update.py` | 774 | 33.0 KB | Module; functionality |
| `cli/commands/workbench.ts` | 579 | 15.8 KB | Module; functionality |
| `.agents/scripts/agents-local-state.py` | 567 | 23.0 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 535 | 20.4 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 530 | 20.2 KB | Module; functionality |
| `cli/services/update/check.ts` | 524 | 17.9 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 512 | 19.4 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 509 | 20.3 KB | Module; functionality |
| `cli/services/local-state/project-indexes.ts` | 490 | 15.6 KB | Module; functionality |
| `cli/generated/template.ts` | 482 | 197.7 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 475 | 17.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/changes.py` | 449 | 19.4 KB | Module; functionality |
| `cli/services/workbench/lifecycle.ts` | 427 | 14.1 KB | Module; functionality |
| `cli/commands/bootstrap.ts` | 393 | 14.2 KB | Module; functionality |
| `.agents/scripts/agents-repo-map.py` | 393 | 16.5 KB | Module; functionality |
| `cli/services/workbench/verify.ts` | 382 | 11.9 KB | Module; functionality |
| `.agents/scripts/lib/workflow_manifest.py` | 365 | 12.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/search.py` | 357 | 14.2 KB | Module; functionality |
| `cli/services/local-state/workbench-index.ts` | 354 | 10.7 KB | Module; functionality |
| `.agents/scripts/agents-session.py` | 340 | 13.5 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 335 | 13.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/journal.py` | 330 | 17.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/adoption.py` | 312 | 13.0 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 310 | 11.0 KB | Module; functionality |
| `.agents/scripts/agents-memory.py` | 305 | 11.8 KB | Module; functionality |
| `cli/commands/status.ts` | 288 | 8.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/registry.py` | 287 | 13.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/runtime.py` | 284 | 12.8 KB | Module; functionality |
| `.agents/scripts/agents-status.py` | 261 | 10.8 KB | Module; functionality |
| `.agents/scripts/agents-knowledge.py` | 259 | 10.0 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 240 | 9.6 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 232 | 8.7 KB | Module; functionality |
| `cli/router.ts` | 229 | 7.2 KB | Module; functionality |
| `cli/services/mutations/journal.ts` | 204 | 6.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/cli.py` | 200 | 9.8 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 197 | 7.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/workspace.py` | 196 | 6.3 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 195 | 7.8 KB | Module; functionality |
| `.agents/scripts/agents-implement.py` | 194 | 8.3 KB | Module; functionality |
| `cli/main.ts` | 193 | 6.7 KB | Module; functionality |
| `.agents/scripts/lib/task_integrity.py` | 183 | 8.4 KB | Module; functionality |
| `.agents/scripts/agents-revert.py` | 176 | 7.3 KB | Module; functionality |
| `.agents/scripts/agents-review.py` | 172 | 7.0 KB | Module; functionality |
| `.agents/scripts/lib/artifact_utility.py` | 166 | 7.1 KB | Module; functionality |
| `.agents/skills/typescript-expert/scripts/ts_diagnostic.py` | 166 | 5.9 KB | Module; functionality |
| `cli/services/project/validate.ts` | 162 | 5.0 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/server.py` | 156 | 8.2 KB | Module; functionality |
| `cli/services/bootstrap/planner.ts` | 155 | 4.7 KB | Module; functionality |
| `cli/commands/update.ts` | 148 | 4.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/models.py` | 133 | 3.8 KB | Module; functionality |
| `cli/services/project/paths.ts` | 131 | 5.4 KB | Module; functionality |
| `cli/commands/catalog.ts` | 128 | 4.3 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 128 | 5.3 KB | Module; functionality |
| `cli/services/template/payload.ts` | 126 | 4.0 KB | Module; functionality |
| `cli/services/bootstrap/cleanup.ts` | 118 | 3.8 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 115 | 4.3 KB | Module; functionality |
| `cli/services/project/root.ts` | 114 | 3.9 KB | Module; functionality |
| `cli/registry.ts` | 112 | 5.2 KB | Module; functionality |
| `cli/services/catalog/rules.ts` | 106 | 3.8 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 102 | 3.8 KB | Module; functionality |
| `cli/commands/local-state.ts` | 91 | 2.9 KB | Module; functionality |
| `.agents/skills/node/rules/assets/graceful-server.test.ts` | 68 | 2.6 KB | Test file; unit tests |
| `.agents/skills/node/rules/assets/graceful-server.ts` | 66 | 2.2 KB | Module; functionality |
| `cli/services/catalog/skills.ts` | 65 | 2.4 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 62 | 2.5 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `cli/commands/validate.ts` | 60 | 1.7 KB | Module; functionality |
| `cli/commands/init.ts` | 57 | 1.4 KB | Module; functionality |
| `.agents/scripts/lib/process_utils.py` | 57 | 2.0 KB | Module; functionality |
| `.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `cli/dev/security-scan.ts` | 56 | 1.8 KB | Module; functionality |
| `cli/dev/coverage-check.ts` | 54 | 1.9 KB | Module; functionality |
| `cli/services/local-state/workbench-events.ts` | 52 | 1.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/process_utils.py` | 52 | 1.8 KB | Module; functionality |
| `cli/core/schema.ts` | 49 | 1.7 KB | Module; functionality |
| `cli/dev/toolchain-smoke.ts` | 42 | 1.5 KB | Module; functionality |
| `cli/dev/generate-template.ts` | 31 | 1.2 KB | Module; functionality |
| `.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `cli/dev/release-provenance.ts` | 30 | 0.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `.agents/scripts/lib/cli_output.py` | 11 | 0.4 KB | Module; functionality |
| `cli/core/result.ts` | 9 | 0.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/__init__.py` | 5 | 0.2 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
