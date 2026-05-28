# 🎨 Backend Structure

**Generated:** 2026-05-28T19:40:12+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 114 files, 41,806 lines, 1741.3 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/agents-benchmark.py` | 1,780 | 86.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-benchmark.py` | 1,776 | 85.6 KB | Module; functionality |
| `.agents/scripts/agents-skills-sync.py` | 1,733 | 74.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-skills-sync.py` | 1,733 | 74.2 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 1,512 | 61.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-bootstrap.py` | 1,510 | 61.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/verify-tasks.py` | 1,347 | 53.8 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 1,296 | 51.6 KB | Module; functionality |
| `.agents/scripts/lib/execution_commands.py` | 1,238 | 50.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/execution_commands.py` | 1,211 | 49.7 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 991 | 41.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-wb-update.py` | 991 | 41.0 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 957 | 42.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-new.py` | 950 | 41.8 KB | Module; functionality |
| `.agents/scripts/agents-scaffold-update.py` | 797 | 34.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-scaffold-update.py` | 797 | 34.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-telemetry.py` | 740 | 31.1 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 731 | 31.4 KB | Module; functionality |
| `.agents/scripts/agents-local-state.py` | 567 | 23.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-local-state.py` | 567 | 23.0 KB | Module; functionality |
| `cli/validate/contract.ts` | 562 | 19.5 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-doctor.py` | 521 | 20.1 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 520 | 20.3 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 453 | 17.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/changes.py` | 449 | 19.4 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 443 | 16.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-lint-docs.py` | 443 | 16.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-structure-map.py` | 434 | 17.0 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 422 | 16.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/agents_config.py` | 422 | 16.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-repo-map.py` | 361 | 16.3 KB | Module; functionality |
| `.agents/scripts/agents-repo-map.py` | 359 | 16.2 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 341 | 13.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-patterns.py` | 341 | 13.3 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/journal.py` | 330 | 17.8 KB | Module; functionality |
| `.agents/scripts/agents-session.py` | 316 | 13.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-session.py` | 309 | 12.7 KB | Module; functionality |
| `.agents/scripts/lib/workflow_manifest.py` | 305 | 12.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/workflow_manifest.py` | 305 | 12.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/adoption.py` | 300 | 12.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/adoption.py` | 300 | 12.8 KB | Module; functionality |
| `.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/runtime.py` | 270 | 12.5 KB | Module; functionality |
| `.agents/scripts/agents-status.py` | 261 | 10.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-status.py` | 261 | 10.8 KB | Module; functionality |
| `.agents/scripts/agents-knowledge.py` | 223 | 8.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-knowledge.py` | 223 | 8.9 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/cli.py` | 201 | 9.9 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 198 | 7.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/sync-agent-docs.py` | 198 | 7.8 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 187 | 6.8 KB | Module; functionality |
| `.agents/scripts/agents-implement.py` | 184 | 8.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-index.py` | 184 | 6.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-implement.py` | 184 | 8.3 KB | Module; functionality |
| `cli/main.ts` | 179 | 5.6 KB | Module; functionality |
| `.agents/scripts/lib/task_integrity.py` | 172 | 8.0 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/changes.py` | 171 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `.agents/skills/typescript-expert/scripts/ts_diagnostic.py` | 166 | 5.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/server.py` | 156 | 8.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/cli.py` | 155 | 7.4 KB | Module; functionality |
| `.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/journal.py` | 138 | 6.5 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/models.py` | 133 | 3.8 KB | Module; functionality |
| `.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/server.py` | 128 | 7.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/runtime.py` | 122 | 6.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/models.py` | 119 | 3.3 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/registry.py` | 109 | 5.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/registry.py` | 109 | 5.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/search.py` | 103 | 3.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/workspace.py` | 102 | 3.9 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/search.py` | 101 | 3.6 KB | Module; functionality |
| `.agents/skills/node/rules/assets/graceful-server.test.ts` | 68 | 2.6 KB | Test file; unit tests |
| `.agents/skills/node/rules/assets/graceful-server.ts` | 66 | 2.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 58 | 2.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools-smoke.py` | 58 | 2.5 KB | Module; functionality |
| `.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/workspace.py` | 49 | 2.2 KB | Module; functionality |
| `.agents/scripts/lib/process_utils.py` | 47 | 1.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/process_utils.py` | 47 | 1.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/process_utils.py` | 46 | 1.7 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/process_utils.py` | 46 | 1.7 KB | Module; functionality |
| `.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `.agents/scripts/lib/cli_output.py` | 11 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/cli_output.py` | 11 | 0.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/__init__.py` | 5 | 0.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/__init__.py` | 3 | 0.1 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
