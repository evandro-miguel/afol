# 🎨 Data Structure

**Generated:** 2026-06-07T11:53:51+00:00
**Last Update:** First run

Data files, constants, and configuration.

---

## 📁 Directory Overview

**Stats:** 58 files, 2,225 lines, 60.2 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/agents.config` | 364 | 9.0 KB | Module; functionality |
| `docs/agentic/agents-config.md` | 155 | 4.6 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/config.py` | 116 | 4.3 KB | Module; functionality |
| `.agents/skills/typescript-expert/references/tsconfig-strict.json` | 92 | 3.3 KB | Module; functionality |
| `src/project-template/.agents/data/telemetry/schemas/event.json` | 78 | 2.3 KB | Module; functionality |
| `.agents/data/telemetry/schemas/event.json` | 78 | 2.3 KB | Module; functionality |
| `.agents/data/benchmarks/registry.json` | 45 | 1.0 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-status.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-mcp-smoke.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-governed-task.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-rule.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-mutation.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-evidence.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-status.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-error.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-conflict.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-check.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-preview.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-local-edit.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-dry-run.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-undo.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-move.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-protected.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-patch.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-surface.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-file.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-task.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-unknown.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-help.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-noisy-output.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-status.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-routing.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-close.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-evidence-add.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-task-start.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-log-add.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-verify.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-unsupported-command.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-help-compact.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-status-json.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-status-compact.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-invalid-root.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-missing-config.json` | 31 | 0.8 KB | Module; functionality |
| `src/project-template/.agents/config.json` | 27 | 0.8 KB | Module; functionality |
| `tsconfig.json` | 23 | 0.6 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/mcp-parity/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/update-safety/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/mutation-safety/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/routing-accuracy/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/token-economy/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/workbench-parity/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/runtime-live-agent/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/cli-kernel-local/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/config.json` | 11 | 0.2 KB | Module; functionality |
| `.agents/data/benchmarks/README.md` | 7 | 0.4 KB | Module; functionality |
| `src/project-template/.agents/data/README.md` | 2 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/data/index/README.md` | 2 | 0.1 KB | Module; functionality |
| `src/project-template/.agents/data/events/README.md` | 2 | 0.1 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
