#!/usr/bin/env bun

import { constants as osConstants } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runBootstrapCommand } from "./commands/bootstrap";
import { runRuleCommand, runSkillCommand } from "./commands/catalog";
import { runInitCommand } from "./commands/init";
import { runStatusCommand } from "./commands/status";
import { runUpdateCommand } from "./commands/update";
import { runValidateCommand } from "./commands/validate";
import {
  runCloseCommand,
  runDoneCommand,
  runEvidenceCommand,
  runLogCommand,
  runNewCommand,
  runStartCommand,
  runVerifyTasksCommand,
} from "./commands/workbench";
import { resolveCommand } from "./router";
import { runValidationCommand } from "./validate/contract";
import { loadProjectRoot } from "./services/project/root";

const HELP_LINES = [
  "Usage: afol [command] [options]",
  "",
  "Commands",
  "  s/status               Show status",
  "  v/validate             Run structural checks",
  "  init                   Install scaffold into current repo",
  "  n/new                  Create workbench session",
  "  st/start               Start workbench task",
  "  e/evidence             Record task evidence",
  "  d/done                 Complete task with evidence",
  "  l/log                  Append session log timeline entry",
  "  vf/verify, verify-tasks Verify workbench tasks",
  "  r/rule sk/skill up/update Inspect routing and updates",
  "  c/close                Close active session",
  "  b/bootstrap            Install scaffold into another repo",
  "",
  "Flags",
  "  -j, --json             JSON output for status",
  "  -h, --help             Show this compact help",
  "",
  "Aliases",
  "  -S --session  -T --task-id  -x --test",
  "  t/task a=afol",
  "",
  "Examples",
  "  afol s",
  "  afol validate",
  "  afol init --dry-run",
  "  afol new <theme> [--intent ...] [--feature-id ...] [--parent-spec ...] [--task ...]",
  "  afol done -T T-01",
].join("\n");

const NEW_COMMAND_HELP = [
  "Usage: afol new <theme> [options]",
  "",
  "Options",
  "  --intent <intent>        Delivery or planning intent",
  "  --feature-id <id>        Governing roadmap feature ID",
  "  --parent-spec <spec-id>  Parent spec identifier",
  "  --task <text>            Initial task summary",
].join("\n");

const exit = (code: number): never => {
  process.exit(code);
};

function signalExitCode(signal: string): number {
  const signalNumber = osConstants.signals[signal as keyof typeof osConstants.signals];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

function runLegacyAdapter(projectRoot: string, args: string[]): number {
  const agents = join(projectRoot, ".agents", "agents");
  if (!existsSync(agents)) {
    console.error(`❌ Missing executable wrapper: ${agents}`);
    return 127;
  }

  const result = spawnSync(agents, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to run ${agents}: ${result.error.message}`);
    return 127;
  }

  if (result.signal) {
    console.error(`Command terminated by signal: ${result.signal}`);
    return signalExitCode(result.signal);
  }

  return result.status ?? 0;
}

function resolveValidateMode(projectRoot: string, args: string[]): {
  mode: "project" | "benchmark";
  args: string[];
} {
  const explicitProject = args[0] === "project" || args.includes("--project");
  if (explicitProject) {
    return {
      mode: "project",
      args: args.filter((arg) => arg !== "project" && arg !== "--project"),
    };
  }

  const benchmarkRegistry = join(projectRoot, ".agents", "data", "benchmarks", "registry.json");
  if (existsSync(benchmarkRegistry)) {
    return { mode: "benchmark", args };
  }

  return { mode: "project", args };
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const resolution = resolveCommand(args);

  if (resolution.kind === "help") {
    console.log(HELP_LINES);
    return 0;
  }

  if (resolution.kind === "unknown") {
    console.error(resolution.message);
    return resolution.exitCode;
  }

  if (
    resolution.kind === "new" &&
    resolution.args.length === 1 &&
    (resolution.args[0] === "-h" || resolution.args[0] === "--help")
  ) {
    console.log(NEW_COMMAND_HELP);
    return 0;
  }

  if (resolution.kind === "bootstrap") {
    return runBootstrapCommand(resolution.args);
  }

  if (resolution.kind === "init") {
    return runInitCommand(resolution.args);
  }

  const project = loadProjectRoot(process.cwd());
  if (!project.ok) {
    console.error(project.error.message);
    return project.error.code;
  }

  if (resolution.kind === "validate") {
    const validateMode = resolveValidateMode(project.value.root, resolution.args);
    if (validateMode.mode === "benchmark") {
      return runValidationCommand(project.value.root, validateMode.args);
    }
    return runValidateCommand(project.value.root, validateMode.args);
  }

  if (resolution.kind === "status") {
    return runStatusCommand(project.value.root, resolution.args);
  }

  if (resolution.kind === "new") {
    return runNewCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "start") {
    return runStartCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "evidence") {
    return runEvidenceCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "done") {
    return runDoneCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "log") {
    return runLogCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "verifyTasks") {
    return runVerifyTasksCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "rule") {
    return runRuleCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "skill") {
    return runSkillCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "update") {
    return runUpdateCommand(resolution.args, project.value.root);
  }

  if (resolution.kind === "close") {
    return runCloseCommand(resolution.args, project.value.root);
  }

  return runLegacyAdapter(project.value.root, resolution.args);
}

if (import.meta.main) {
  exit(await main(process.argv));
}
