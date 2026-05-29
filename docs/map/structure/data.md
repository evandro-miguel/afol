# 🎨 Data Structure

**Generated:** 2026-05-29T18:50:08+00:00
**Last Update:** First run

Data files, constants, and configuration.

---

## 📁 Directory Overview

**Stats:** 76 files, 6,461 lines, 300.3 KB

### Files

| File | Lines | Size | Description |
|------|-------|------|-------------|
| `.agents/data/benchmarks/results/20260529_150800_runtime-flow-live-agent-v4.json` | 595 | 60.4 KB | Module; functionality |
| `.agents/agents.config` | 364 | 9.0 KB | Module; functionality |
| `src/project-template/.agents/agents.config` | 364 | 9.0 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_152313_runtime-flow-live-agent-v4.json` | 280 | 22.8 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_152028_runtime-flow-live-agent-v4.json` | 269 | 19.4 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260424_141508_runtime-flow-live-agent-v4.json` | 268 | 15.5 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_152459_runtime-flow-live-agent-v4.json` | 254 | 17.5 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_144530_runtime-flow-live-agent-v4.json` | 247 | 25.9 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260424_153445_runtime-flow-live-agent-v4.json` | 214 | 13.6 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142632_cli-kernel-local.json` | 212 | 6.1 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_mutation-safety.json` | 181 | 5.1 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142632_workbench-parity.json` | 181 | 5.1 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_mcp-parity.json` | 181 | 5.0 KB | Module; functionality |
| `docs/map/extra/metadata.json` | 169 | 4.8 KB | Module; functionality |
| `docs/agentic/agents-config.md` | 155 | 4.6 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_update-safety.json` | 150 | 4.1 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_routing-accuracy.json` | 150 | 4.2 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_token-economy.json` | 150 | 4.2 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_142633_runtime-live-agent.json` | 127 | 3.5 KB | Module; functionality |
| `.agents/data/benchmarks/results/20260529_151613_runtime-flow-live-agent-v4.json` | 121 | 9.8 KB | Module; functionality |
| `.agents/runtime/src/agentic_scaffold/config.py` | 108 | 4.2 KB | Module; functionality |
| `src/project-template/.agents/runtime/src/agentic_scaffold/config.py` | 108 | 4.2 KB | Module; functionality |
| `.agents/skills/typescript-expert/references/tsconfig-strict.json` | 92 | 3.3 KB | Module; functionality |
| `.agents/data/telemetry/schemas/event.json` | 78 | 2.3 KB | Module; functionality |
| `src/project-template/.agents/data/telemetry/schemas/event.json` | 78 | 2.3 KB | Module; functionality |
| `.agents/data/benchmarks/registry.json` | 45 | 1.0 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-status.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-mcp-smoke.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/runtime-live-agent/live-governed-task.json` | 32 | 0.9 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-preview.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-check.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-local-edit.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/update-safety/up-conflict.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-error.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-status.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-mutation.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-rule.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mcp-parity/mcp-evidence.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-close.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-log-add.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-evidence-add.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-verify.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/workbench-parity/wb-task-start.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-missing-config.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-status-json.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-unsupported-command.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-status-compact.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-invalid-root.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/cli-kernel-local/cli-help-compact.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-surface.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-unknown.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-task.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/routing-accuracy/route-file.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-move.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-protected.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-dry-run.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-undo.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/mutation-safety/mut-patch.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-status.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-routing.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-help.json` | 31 | 0.8 KB | Module; functionality |
| `.agents/data/benchmarks/scenarios/token-economy/token-noisy-output.json` | 31 | 0.8 KB | Module; functionality |
| `docs/map/extra/phase5/data-models.json` | 29 | 0.6 KB | Module; functionality |
| `docs/map/extra/phase2/config-boundary-files.json` | 27 | 0.6 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/update-safety/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/mcp-parity/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/workbench-parity/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/cli-kernel-local/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/routing-accuracy/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/mutation-safety/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/runtime-live-agent/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `.agents/data/benchmarks/baselines/token-economy/baseline-v1.json` | 13 | 0.3 KB | Module; functionality |
| `tsconfig.json` | 12 | 0.2 KB | Module; functionality |
| `.agents/config.json` | 11 | 0.2 KB | Module; functionality |
| `src/project-template/.agents/config.json` | 11 | 0.2 KB | Module; functionality |
| `.agents/data/benchmarks/README.md` | 7 | 0.4 KB | Module; functionality |

---
*Generated by `agents-structure-map.py`*
