---
doc_type: structure
id: backend
theme: structure
status: active
created_at: '2026-05-10T16:27:41+00:00'
updated_at: '2026-05-10T16:27:41+00:00'
---

# 🎨 Backend Structure

**Generated:** 2026-04-16T00:32:54+00:00
**Last Update:** First run

Services, utilities, and business logic.

---

## 📁 Directory Overview

**Stats:** 94 files, 27,170 lines, 1099.3 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/scripts/agents-skills-sync.py` | 1,147 | 47.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-skills-sync.py` | 1,147 | 47.4 KB | Module; functionality |
| `.agents/scripts/verify-tasks.py` | 1,117 | 43.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/verify-tasks.py` | 1,117 | 43.8 KB | Module; functionality |
| `.agents/scripts/agents-bootstrap.py` | 1,056 | 43.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-bootstrap.py` | 1,056 | 43.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-new.py` | 805 | 34.5 KB | Module; functionality |
| `.agents/scripts/agents-new.py` | 801 | 34.4 KB | Module; functionality |
| `.agents/scripts/agents-telemetry.py` | 728 | 30.7 KB | Module; functionality |
| `.agents/scripts/lib/execution_commands.py` | 717 | 29.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-telemetry.py` | 717 | 30.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/execution_commands.py` | 690 | 28.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-wb-update.py` | 669 | 26.0 KB | Module; functionality |
| `.agents/scripts/agents-wb-update.py` | 659 | 25.7 KB | Module; functionality |
| `.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools.py` | 543 | 20.2 KB | Module; functionality |
| `.agents/scripts/agents-doctor.py` | 521 | 20.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-doctor.py` | 521 | 20.1 KB | Module; functionality |
| `.agents/scripts/agents-lint-docs.py` | 430 | 16.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-lint-docs.py` | 430 | 16.6 KB | Module; functionality |
| `.agents/scripts/agents-structure-map.py` | 427 | 16.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-structure-map.py` | 427 | 16.7 KB | Module; functionality |
| `.agents/scripts/lib/agents_config.py` | 417 | 16.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/agents_config.py` | 414 | 16.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-patterns.py` | 353 | 13.8 KB | Module; functionality |
| `.agents/scripts/agents-repo-map.py` | 342 | 15.5 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-repo-map.py` | 342 | 15.5 KB | Module; functionality |
| `.agents/scripts/agents-patterns.py` | 341 | 13.3 KB | Module; functionality |
| `.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/check-links.py` | 331 | 11.2 KB | Module; functionality |
| `.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-memory.py` | 288 | 11.7 KB | Module; functionality |
| `.agents/scripts/lib/workflow_manifest.py` | 282 | 11.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/workflow_manifest.py` | 282 | 11.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-knowledge.py` | 238 | 9.3 KB | Module; functionality |
| `.agents/scripts/agents-knowledge.py` | 223 | 8.9 KB | Module; functionality |
| `.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-all.py` | 212 | 8.3 KB | Module; functionality |
| `.agents/scripts/sync-agent-docs.py` | 199 | 7.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/sync-agent-docs.py` | 199 | 7.9 KB | Module; functionality |
| `.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-fix-symlinks.py` | 196 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-index.py` | 184 | 6.6 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-index.py` | 184 | 6.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/changes.py` | 178 | 7.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/changes.py` | 171 | 7.1 KB | Module; functionality |
| `.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-revert.py` | 167 | 7.2 KB | Module; functionality |
| `.agents/scripts/agents-status.py` | 160 | 6.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-status.py` | 160 | 6.3 KB | Module; functionality |
| `.agents/scripts/agents-session.py` | 157 | 6.6 KB | Module; functionality |
| `.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-review.py` | 148 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-session.py` | 146 | 6.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/cli.py` | 141 | 6.7 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/cli.py` | 141 | 6.7 KB | Module; functionality |
| `.agents/scripts/agents-implement.py` | 139 | 6.0 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-implement.py` | 139 | 6.0 KB | Module; functionality |
| `.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-doctypes.py` | 137 | 5.4 KB | Module; functionality |
| `.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/artifact_utility.py` | 128 | 6.8 KB | Module; functionality |
| `.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-checkboxes.py` | 122 | 4.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/server.py` | 117 | 6.4 KB | Module; functionality |
| `.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `src/project-template/.agents/scripts/fix-lint-frontmatter.py` | 112 | 3.9 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/server.py` | 109 | 6.0 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/registry.py` | 107 | 5.1 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/search.py` | 103 | 3.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/journal.py` | 102 | 4.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/journal.py` | 102 | 4.8 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/search.py` | 101 | 3.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/registry.py` | 99 | 4.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/runtime.py` | 96 | 4.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/models.py` | 80 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/models.py` | 80 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/runtime.py` | 76 | 3.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/validation.py` | 62 | 2.6 KB | Module; functionality |
| `.agents/scripts/agents-tools-smoke.py` | 57 | 2.3 KB | Module; functionality |
| `src/project-template/.agents/scripts/agents-tools-smoke.py` | 57 | 2.3 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/workspace.py` | 49 | 2.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/workspace.py` | 49 | 2.2 KB | Module; functionality |
| `.agents/scripts/lib/process_utils.py` | 47 | 1.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/process_utils.py` | 46 | 1.7 KB | Module; functionality |
| `.agents/scripts/lib/markdown_docs.py` | 31 | 1.2 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/markdown_docs.py` | 24 | 0.9 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/services/__init__.py` | 12 | 0.4 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/__init__.py` | 3 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/__init__.py` | 3 | 0.1 KB | Module; functionality |
| `.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/scripts/lib/__init__.py` | 1 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
