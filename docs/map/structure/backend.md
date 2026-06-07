# 🎨 Backend Structure

**Generated:** 2026-06-07T01:11:04+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 106 files, 38,940 lines, 1565.1 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/agents-benchmark.py` | 1,844 | 86.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-benchmark.py` | 1,840 | 86.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-bootstrap.py` | 1,704 | 68.3 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 1,704 | 68.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-skills-sync.py` | 1,643 | 67.5 KB | Module; functionality |
| `.agents/scripts/agents-skills-sync.py` | 1,643 | 67.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/verify-tasks.py` | 1,428 | 54.8 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 1,428 | 54.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/execution_commands.py` | 1,060 | 41.1 KB | Module; functionality |
| `.agents/scripts/lib/execution_commands.py` | 1,060 | 41.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-new.py` | 932 | 38.3 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 932 | 38.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-telemetry.py` | 803 | 31.7 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 787 | 32.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-wb-update.py` | 748 | 29.3 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 745 | 29.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-scaffold-update.py` | 555 | 23.6 KB | Module; functionality |
| `.agents/scripts/agents-scaffold-update.py` | 555 | 23.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools.py` | 534 | 20.2 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 534 | 20.2 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 509 | 20.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-doctor.py` | 508 | 20.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/agents_config.py` | 485 | 17.8 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 480 | 17.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-lint-docs.py` | 475 | 17.7 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 475 | 17.7 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 463 | 17.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-structure-map.py` | 460 | 17.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-repo-map.py` | 395 | 16.5 KB | Module; functionality |
| `.agents/scripts/agents-repo-map.py` | 393 | 16.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/workflow_manifest.py` | 365 | 12.9 KB | Module; functionality |
| `.agents/scripts/lib/workflow_manifest.py` | 365 | 12.9 KB | Module; functionality |
| `.agents/scripts/agents-session.py` | 340 | 13.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-patterns.py` | 335 | 13.4 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 335 | 13.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-session.py` | 320 | 12.9 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/adoption.py` | 312 | 13.0 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/adoption.py` | 312 | 13.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/check-links.py` | 310 | 11.0 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 310 | 11.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-memory.py` | 305 | 11.8 KB | Module; functionality |
| `.agents/scripts/agents-memory.py` | 305 | 11.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-all.py` | 240 | 9.6 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 240 | 9.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-knowledge.py` | 238 | 9.1 KB | Module; functionality |
| `.agents/scripts/agents-knowledge.py` | 238 | 9.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/cli.py` | 220 | 9.2 KB | Module; functionality |
| `.agents/scripts/agents-status.py` | 197 | 7.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/workspace.py` | 196 | 6.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/sync-agent-docs.py` | 195 | 7.8 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 195 | 7.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-index.py` | 188 | 6.7 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 188 | 6.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/changes.py` | 184 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-implement.py` | 178 | 7.4 KB | Module; functionality |
| `.agents/scripts/agents-implement.py` | 178 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/cli.py` | 177 | 7.5 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/changes.py` | 177 | 7.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-revert.py` | 176 | 7.3 KB | Module; functionality |
| `.agents/scripts/agents-revert.py` | 176 | 7.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-status.py` | 174 | 6.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-review.py` | 172 | 6.9 KB | Module; functionality |
| `.agents/scripts/agents-review.py` | 172 | 6.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/artifact_utility.py` | 166 | 7.1 KB | Module; functionality |
| `.agents/scripts/lib/artifact_utility.py` | 166 | 7.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/server.py` | 160 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/server.py` | 154 | 7.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/journal.py` | 144 | 6.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/journal.py` | 144 | 6.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/runtime.py` | 139 | 6.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/runtime.py` | 132 | 6.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-doctypes.py` | 128 | 5.3 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 128 | 5.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/workspace.py` | 126 | 4.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/registry.py` | 124 | 5.5 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/registry.py` | 124 | 5.5 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/models.py` | 119 | 3.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/models.py` | 119 | 3.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-checkboxes.py` | 115 | 4.3 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 115 | 4.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/search.py` | 105 | 3.7 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/search.py` | 103 | 3.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-frontmatter.py` | 102 | 3.8 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 102 | 3.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools-smoke.py` | 62 | 2.5 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 62 | 2.5 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/process_utils.py` | 57 | 2.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `.agents/scripts/lib/process_utils.py` | 57 | 2.0 KB | Module; functionality |
| `.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/process_utils.py` | 52 | 1.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/process_utils.py` | 52 | 1.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/cli_output.py` | 11 | 0.4 KB | Module; functionality |
| `.agents/scripts/lib/cli_output.py` | 11 | 0.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/__init__.py` | 5 | 0.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/__init__.py` | 3 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
