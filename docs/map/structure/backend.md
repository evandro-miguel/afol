# 🎨 Backend Structure

**Generated:** 2026-05-14T21:24:25+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 102 files, 34,325 lines, 1423.8 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/agents-benchmark.py` | 1,763 | 85.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-benchmark.py` | 1,763 | 85.3 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 1,353 | 55.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-bootstrap.py` | 1,353 | 55.4 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 1,347 | 53.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/verify-tasks.py` | 1,347 | 53.8 KB | Module; functionality |
| `.agents/scripts/agents-skills-sync.py` | 1,248 | 51.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-skills-sync.py` | 1,248 | 51.7 KB | Module; functionality |
| `.agents/scripts/lib/execution_commands.py` | 950 | 39.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/execution_commands.py` | 950 | 39.3 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 869 | 37.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-new.py` | 869 | 37.7 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 740 | 31.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-telemetry.py` | 740 | 31.1 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 720 | 28.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-wb-update.py` | 720 | 28.9 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 521 | 20.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-doctor.py` | 521 | 20.1 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 443 | 16.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-lint-docs.py` | 443 | 16.8 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 432 | 16.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-structure-map.py` | 432 | 16.9 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 422 | 16.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/agents_config.py` | 422 | 16.2 KB | Module; functionality |
| `.agents/scripts/agents-repo-map.py` | 361 | 16.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-repo-map.py` | 361 | 16.3 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 341 | 13.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-patterns.py` | 341 | 13.3 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `.agents/scripts/agents-session.py` | 309 | 12.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-session.py` | 309 | 12.7 KB | Module; functionality |
| `.agents/scripts/lib/workflow_manifest.py` | 305 | 12.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/workflow_manifest.py` | 305 | 12.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/adoption.py` | 300 | 12.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/adoption.py` | 300 | 12.8 KB | Module; functionality |
| `.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `.agents/scripts/agents-knowledge.py` | 223 | 8.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-knowledge.py` | 223 | 8.9 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 198 | 7.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/sync-agent-docs.py` | 198 | 7.8 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 184 | 6.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-index.py` | 184 | 6.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/changes.py` | 178 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/changes.py` | 171 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-status.py` | 168 | 6.7 KB | Module; functionality |
| `.agents/scripts/agents-implement.py` | 168 | 7.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-status.py` | 168 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-implement.py` | 168 | 7.3 KB | Module; functionality |
| `.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/cli.py` | 155 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/cli.py` | 155 | 7.4 KB | Module; functionality |
| `.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/journal.py` | 138 | 6.5 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/journal.py` | 138 | 6.5 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/server.py` | 128 | 7.1 KB | Module; functionality |
| `.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/server.py` | 128 | 7.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/runtime.py` | 122 | 6.0 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/runtime.py` | 122 | 6.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/models.py` | 119 | 3.3 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/models.py` | 119 | 3.3 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/registry.py` | 108 | 5.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/registry.py` | 108 | 5.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/search.py` | 103 | 3.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/search.py` | 101 | 3.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 58 | 2.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools-smoke.py` | 58 | 2.5 KB | Module; functionality |
| `.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/postmortem_governance.py` | 57 | 2.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/workspace.py` | 49 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/workspace.py` | 49 | 2.2 KB | Module; functionality |
| `.agents/scripts/lib/process_utils.py` | 47 | 1.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/process_utils.py` | 47 | 1.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/process_utils.py` | 46 | 1.7 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/process_utils.py` | 46 | 1.7 KB | Module; functionality |
| `.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/__init__.py` | 5 | 0.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/__init__.py` | 3 | 0.1 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
