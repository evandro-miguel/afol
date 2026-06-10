#!/usr/bin/env bun

import { runBootstrapCommand } from "./commands/bootstrap";
import { runRuleCommand, runSkillCommand } from "./commands/catalog";
import { runFileCommand } from "./commands/file";
import { runInitCommand } from "./commands/init";
import { runLocalStateCommand } from "./commands/local-state";
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
import { CLI_VERSION } from "./generated/version";
import { resolveCommand } from "./router";
import { loadProjectRoot } from "./services/project/root";
import { runValidationCommand } from "./validate/contract";

const HELP_LINES = [
	"Usage: afol [command] [options]",
	"",
	"Commands",
	"  s/status               Show status",
	"  v/validate             Run selected validation gates",
	"  init                   Install scaffold into current repo",
	"  n/new                  Create workbench session",
	"  st/start               Start workbench task",
	"  e/evidence             Record task evidence",
	"  d/done                 Complete task with evidence",
	"  l/log                  Append session log timeline entry",
	"  vf/verify, verify-tasks Verify workbench tasks",
	"  r/rule sk/skill up/update ls/local-state Inspect routing, updates, indexes",
	"  c/close                Close active session",
	"  b/bootstrap            Install scaffold into another repo",
	"",
	"Flags",
	"  -j, --json             JSON output for status",
	"  -h, --help  -V, --version Show help or version",
	"",
	"Aliases",
	"  -S --session  -T --task-id  -x --test",
	"  a=afol",
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

function resolveValidateMode(
	projectRoot: string,
	args: string[],
): {
	mode: "project" | "benchmark";
	args: string[];
} {
	void projectRoot;
	const explicitProject = args[0] === "project" || args.includes("--project");
	if (explicitProject) {
		return {
			mode: "project",
			args: args.filter((arg) => arg !== "project" && arg !== "--project"),
		};
	}

	const explicitBenchmarkMode = args[0];
	if (
		explicitBenchmarkMode === "bench" ||
		explicitBenchmarkMode === "select" ||
		explicitBenchmarkMode === "run"
	) {
		return { mode: "benchmark", args };
	}

	return { mode: "project", args };
}

export async function main(argv: string[]): Promise<number> {
	const args = argv.slice(2);
	if (
		args.length === 1 &&
		(args[0] === "--version" || args[0] === "-V" || args[0] === "version")
	) {
		console.log(`afol ${CLI_VERSION}`);
		return 0;
	}

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
		const validateMode = resolveValidateMode(
			project.value.root,
			resolution.args,
		);
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

	if (resolution.kind === "file") {
		return runFileCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "localState") {
		return runLocalStateCommand(resolution.args, project.value.root);
	}

	console.error("err unsupported-command");
	return 2;
}

if (import.meta.main) {
	exit(await main(process.argv));
}
