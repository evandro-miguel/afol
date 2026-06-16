# Plan: command-output-audit

- Created by native CLI workbench lifecycle.

## Native command metadata
- task: Criar plano WB para auditar saida e token economy dos comandos AFOL
- task: Mapear comandos e medir saidas compactas/default
- task: Corrigir comandos ruidosos ou pouco informativos
- task: Validar release e token economy apos correcoes

## Objective

Audit the default output of the AFOL CLI and release scripts. The output should
be compact, useful for agents, and truthful about command scope. Default
successful commands should not dump verbose manifests, full test logs, or large
JSON payloads unless the user asks for `--verbose`, `--json`, `--deep`, or a
targeted diagnostic mode.

## Non-Goals

- Do not redesign the CLI command model.
- Do not weaken failure evidence: failed commands may still print detailed
stdout/stderr.
- Do not touch retired `.agents` runtime surfaces.
- Do not edit global skills during this repo task.

## Facts

- Repo root: `/home/ozy/apps/agentic_start_folder/.worktree/main_dev`.
- Mutable AFOL state path: `.afol/**`; workbench path: `.afol/wb/**`.
- Branch at session start: `main_dev...origin/main_dev [ahead 22]`.
- Recent fix already compacted `validate:release` from `4398` lines /
  `521786` bytes to `134` lines / `11613` bytes.
- Token economy rule: default AFOL output above 5k tokens is suspect; above
  10k tokens is a bug.

## Audit Method

1. Enumerate public command surface from `cli/main.ts`, registry/help tests, and
   package scripts. Prefer bounded discovery over broad output capture.
2. Split commands by behavior:
   - read/discovery/state: status, help, health, doctor, ctx, pstr, local-state;
   - workbench/lifecycle: new, start, evidence, done, close, verify-tasks;
   - scaffold/update/file: init, bootstrap, update, file/archive helpers;
   - validation/benchmark/release: validate, bench, pb, coverage/release scripts.
3. For each slice, measure representative default successful output:
   - exit code;
   - line count;
   - byte count;
   - whether content is actionable;
   - whether scope is clear;
   - whether detail belongs behind `--verbose`, `--json`, `--deep`, or `--full`.
4. Fix only commands with clear token waste, misleading success output, or weak
   command discovery.
5. Re-run focused tests plus release validation.

## Delegation Plan

- Agent A, read-only discovery/state audit.
  Suggested skills: `agentic-folder-sys` tools, `rtk-token-optimization`,
  `caveman`.
  Allowed reads: `cli/main.ts`, `cli/commands/**`, `cli/services/**`,
  `cli/tests/**`, `package.json`.
  Output: max 10 findings with command, size evidence, and recommended fix.

- Agent B, read-only lifecycle/scaffold/update audit.
  Suggested skills: `agentic-folder-sys` tools/execution, `rtk-token-optimization`.
  Allowed reads: `cli/commands/bootstrap.ts`, `cli/commands/init.ts`,
  `cli/commands/update*.ts`, `cli/commands/file*.ts`, related tests.
  Output: max 10 findings with command, size evidence, and recommended fix.

- Agent C, read-only validation/benchmark/release audit.
  Suggested skills: `agentic-folder-sys` benchmarking/tools,
  `rtk-token-optimization`.
  Allowed reads: `package.json`, `cli/dev/**`, `cli/commands/project-benchmark.ts`,
  `cli/services/project-benchmark/**`, related tests.
  Output: max 10 findings with command/script, size evidence, and recommended
  fix.

The orchestrator owns all edits and final verification. Agents do not commit.

## Execution Plan

- T-01: Criar plano WB para auditar saida e token economy dos comandos AFOL
- T-02: Mapear comandos e medir saidas compactas/default
- T-03: Corrigir comandos ruidosos ou pouco informativos
- T-04: Validar release e token economy apos correcoes
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Validation

- `afol validate project`
- focused tests for touched commands
- `bun run typecheck`
- `bun run validate:release`
- output-size comparison for noisy commands after changes

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
- No unresolved P0/P1 command-output findings from the agent audit remain.
