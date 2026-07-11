#!/usr/bin/env bun

import { runAdapterCommand } from "./commands/adapter";
import { runAdmCommand } from "./commands/adm";
import { runAdrCommand } from "./commands/adr";
import { runBenchCommand } from "./commands/bench";
import { runBootstrapCommand } from "./commands/bootstrap";
import {
	runHookCommand,
	runRuleCommand,
	runSkillCommand,
} from "./commands/catalog";
import { runCatchupCommand } from "./commands/catchup";
import { runChangelogCommand } from "./commands/changelog";
import { runContextCommand } from "./commands/context";
import { runDbCommand } from "./commands/db";
import { runDoctorCommand } from "./commands/doctor";
import { runFileCommand } from "./commands/file";
import { runGovernanceCommand } from "./commands/governance";
import { runHealthCommand } from "./commands/health";
import { runHydrateCommand } from "./commands/hydrate";
import { runInitCommand } from "./commands/init";
import { runLibraryCommand } from "./commands/library";
import { runLocalStateCommand } from "./commands/local-state";
import { runMaintenanceCommand } from "./commands/maintenance";
import { runMemoryCommand } from "./commands/memory";
import { runPreflightCommand } from "./commands/preflight";
import { runProjectBenchmarkCommand } from "./commands/project-benchmark";
import { runPstrCommand } from "./commands/pstr";
import { runQuickTaskCommand } from "./commands/quick-task";
import { runSchemaCommand } from "./commands/schema-cmd";
import { runSessionCommand } from "./commands/session";
import { runSpecCommand } from "./commands/spec";
import { runStateCommand } from "./commands/state";
import { runStatusCommand } from "./commands/status";
import { runSweepCommand } from "./commands/sweep";
import { runTelemetryCommand } from "./commands/telemetry";
import { runUpdateCommand } from "./commands/update";
import { runUxCommand } from "./commands/ux";
import { runValidateCommand } from "./commands/validate";
import {
	runCloseCommand,
	runDoneCommand,
	runEvidenceCommand,
	runLogCommand,
	runNewCommand,
	runStartCommand,
	runTransitionCommand,
	runVerifyTasksCommand,
} from "./commands/workbench";
import {
	defaultOperationContext,
	type OperationContext,
	resolveOperationContext,
} from "./core/operation-context";
import { CLI_VERSION } from "./generated/version";
import {
	buildCommandHelpJson,
	formatCatalogJson,
	formatCommandHelp,
	formatHelpText,
	type HelpIntent,
	isHelpIntent,
} from "./help";
import { kernelRegistry } from "./registry";
import { resolveCommand } from "./router";
import { loadProjectRoot } from "./services/project/root";
import {
	resolveValidateInvocation,
	runValidationCommand,
} from "./validate/command";

const NEW_COMMAND_HELP = [
	"Usage: afol new <theme> [options]",
	"",
	"Options",
	"  --intent <intent>        Delivery or planning intent",
	"  --feature-id <id>        Governing roadmap feature ID",
	"  --parent-spec <spec-id>  Parent spec identifier",
	"  --no-spec-required      Waive spec requirement for this session",
	"  --reason <reason>       Required with --no-spec-required",
	"  --task <text>            Initial task summary; repeat for multiple tasks",
].join("\n");

const START_COMMAND_HELP = [
	"Usage: afol start --session <session-id> --task-id <task-id> [options]",
	"",
	"Options",
	"  --session <session-id>  Workbench session to start from",
	"  --task-id <task-id>    Task identifier to mark in progress",
	"  --json                 Emit machine-readable start result",
	"  --brief                Emit concise start briefing",
	"  --brief full           Emit full start briefing",
	"  --compact              Emit compact human output",
].join("\n");

const CLOSE_COMMAND_HELP = [
	"Usage: afol close --session <session-id> [options]",
	"",
	"Options",
	"  --session <session-id>  Workbench session to close",
	"  --json                 Emit machine-readable close result",
].join("\n");

const exit = (code: number): never => {
	process.exit(code);
};

export const DIRECT_DISPATCH_KINDS = Object.freeze([
	"bootstrap",
	"init",
	"validate",
	"status",
	"new",
	"start",
	"evidence",
	"done",
	"transition",
	"log",
	"quickTask",
	"verifyTasks",
	"hook",
	"rule",
	"skill",
	"update",
	"close",
	"file",
	"localState",
	"catchup",
	"preflight",
]);

export const SUBCOMMAND_DISPATCH_GROUPS = Object.freeze([
	"adm",
	"governance",
	"health",
	"db",
	"doctor",
	"maintenance",
	"pstr",
	"schema",
	"session",
	"bench",
	"projectBenchmark",
	"sweep",
	"spec",
	"ux",
	"adr",
	"changelog",
	"ctx",
	"library",
	"memory",
	"state",
	"adapter",
	"telemetry",
	"hydrate",
]);

function isVerboseHelpArg(arg: string): boolean {
	return arg === "--verbose";
}

function hasHelpArg(args: readonly string[]): boolean {
	return args.some((arg) => kernelRegistry.isHelpAlias(arg));
}

function registryHelpCommandForGroup(group: string): string | null {
	return (
		kernelRegistry.commands.find((spec) => spec.command === group)?.command ??
		kernelRegistry.commands.find((spec) => spec.kind === group)?.command ??
		null
	);
}

function subcommandGroupHelpCommand(
	resolution: ReturnType<typeof resolveCommand>,
): string | null {
	if (resolution.kind !== "subcommand" || !hasHelpArg(resolution.args)) {
		return null;
	}
	if (resolution.group === "memory" && resolution.action === "render") {
		return "render";
	}
	return registryHelpCommandForGroup(resolution.group);
}

function parseHelpArgs(args: readonly string[]): {
	remaining: string[];
	intent?: HelpIntent;
	error?: string;
} {
	const remaining: string[] = [];
	let intent: HelpIntent | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg !== "--for") {
			remaining.push(arg);
			continue;
		}
		const value = args[index + 1];
		if (!value) {
			return {
				remaining,
				error:
					'err missing-help-intent hint="use planning, execution, or maintenance"',
			};
		}
		if (!isHelpIntent(value)) {
			return {
				remaining,
				error: `err unknown-help-intent intent=${value} hint="use planning, execution, or maintenance"`,
			};
		}
		intent = value;
		index += 1;
	}
	return intent ? { remaining, intent } : { remaining };
}

export async function main(argv: string[]): Promise<number> {
	let args = argv.slice(2);

	// Resolve restricted operation context from env/flags early so mutation
	// gates in schema/pstr/library/memory/file commands work for agent/remote
	// callers. Default is local interactive (trusted, no approval required).
	let operationCtx: OperationContext = defaultOperationContext();
	{
		const resolved = resolveOperationContext(args);
		operationCtx = resolved.ctx;
		args = resolved.remainingArgs;
	}
	if (
		args.length === 1 &&
		(args[0] === "--version" || args[0] === "-V" || args[0] === "version")
	) {
		console.log(`afol ${CLI_VERSION}`);
		return 0;
	}

	if (args[0] === "help") {
		const parsedHelp = parseHelpArgs(args.slice(1));
		if (parsedHelp.error) {
			console.error(parsedHelp.error);
			return 2;
		}
		const helpArgs = parsedHelp.remaining;
		const jsonRequested = helpArgs.some((arg) =>
			kernelRegistry.isJsonAlias(arg),
		);
		const helpTarget =
			helpArgs.find(
				(arg) =>
					!kernelRegistry.isJsonAlias(arg) &&
					!isVerboseHelpArg(arg) &&
					!kernelRegistry.isHelpAlias(arg),
			) ?? "";
		const verboseRequested = helpArgs.some(isVerboseHelpArg);
		if (jsonRequested) {
			if (helpTarget && !kernelRegistry.isJsonAlias(helpTarget)) {
				const help = buildCommandHelpJson(helpTarget, kernelRegistry);
				if (help) {
					console.log(`${JSON.stringify(help, null, 2)}\n`);
					return 0;
				}
				console.error(
					`err unknown-command command=${helpTarget} hint="run afol -h"`,
				);
				return 2;
			}
			console.log(
				formatCatalogJson(
					kernelRegistry,
					parsedHelp.intent ? { intent: parsedHelp.intent } : {},
				),
			);
			return 0;
		}
		if (!helpTarget) {
			console.log(
				formatHelpText(kernelRegistry, {
					verbose: verboseRequested,
					...(parsedHelp.intent ? { intent: parsedHelp.intent } : {}),
				}),
			);
			return 0;
		}
		const help = formatCommandHelp(helpTarget, kernelRegistry);
		if (help) {
			console.log(help);
			return 0;
		}
		console.error(
			`err unknown-command command=${args[1] ?? ""} hint="run afol -h"`,
		);
		return 2;
	}

	const resolution = resolveCommand(args);

	if (resolution.kind === "help") {
		console.log(
			formatHelpText(kernelRegistry, { verbose: args.some(isVerboseHelpArg) }),
		);
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

	if (
		resolution.kind === "start" &&
		resolution.args.length === 1 &&
		(resolution.args[0] === "-h" || resolution.args[0] === "--help")
	) {
		console.log(START_COMMAND_HELP);
		return 0;
	}

	if (
		resolution.kind === "close" &&
		resolution.args.length === 1 &&
		(resolution.args[0] === "-h" || resolution.args[0] === "--help")
	) {
		console.log(CLOSE_COMMAND_HELP);
		return 0;
	}

	const topLevelHelpArgs =
		resolution.kind === "status"
			? resolution.args.filter((arg) => arg !== "status")
			: resolution.args;
	if (
		(resolution.kind === "status" ||
			resolution.kind === "evidence" ||
			resolution.kind === "done" ||
			resolution.kind === "log") &&
		topLevelHelpArgs.length === 1 &&
		kernelRegistry.isHelpAlias(topLevelHelpArgs[0] ?? "")
	) {
		const help = formatCommandHelp(resolution.kind, kernelRegistry);
		if (help) {
			console.log(help);
			return 0;
		}
	}

	const helpCommand = subcommandGroupHelpCommand(resolution);
	if (helpCommand) {
		const help = formatCommandHelp(helpCommand, kernelRegistry);
		if (help) {
			console.log(help);
			return 0;
		}
	}

	if (resolution.kind === "bootstrap") {
		return runBootstrapCommand(resolution.args, {}, operationCtx);
	}

	if (resolution.kind === "init") {
		return runInitCommand(resolution.args, operationCtx);
	}

	const project = loadProjectRoot(process.cwd());
	if (!project.ok) {
		console.error(project.error.message);
		return project.error.code;
	}

	if (resolution.kind === "validate") {
		const validateInvocation = resolveValidateInvocation(resolution.args);
		if (validateInvocation.kind === "benchmark") {
			return runValidationCommand(project.value.root, validateInvocation.args);
		}
		return runValidateCommand(project.value.root, validateInvocation.args);
	}

	if (resolution.kind === "status") {
		return runStatusCommand(project.value.root, resolution.args);
	}

	if (resolution.kind === "new") {
		return runNewCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "start") {
		return runStartCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "evidence") {
		return runEvidenceCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "done") {
		return runDoneCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "transition") {
		return runTransitionCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "log") {
		return runLogCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "quickTask") {
		return runQuickTaskCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "verifyTasks") {
		return runVerifyTasksCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "hook") {
		return runHookCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "rule") {
		return runRuleCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "skill") {
		return runSkillCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "update") {
		return runUpdateCommand(
			resolution.args,
			project.value.root,
			undefined,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "close") {
		return runCloseCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "file") {
		return runFileCommand(
			resolution.args,
			project.value.root,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "localState") {
		return runLocalStateCommand(
			resolution.args,
			project.value.root,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "catchup") {
		return runCatchupCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "preflight") {
		return runPreflightCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "subcommand" && resolution.group === "adm") {
		return runAdmCommand(
			resolution.action,
			resolution.args,
			project.value.root,
		);
	}

	if (resolution.kind === "subcommand") {
		if (resolution.group === "health") {
			return runHealthCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "governance") {
			return runGovernanceCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "db") {
			return runDbCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "doctor") {
			return runDoctorCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "maintenance") {
			return runMaintenanceCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "pstr") {
			return runPstrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "schema") {
			return runSchemaCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "session") {
			return runSessionCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "bench") {
			if (resolution.action === "" && resolution.args.includes("--pack")) {
				return runValidationCommand(project.value.root, [
					"bench",
					...resolution.args,
				]);
			}
			return runBenchCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "projectBenchmark") {
			return runProjectBenchmarkCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "sweep") {
			return runSweepCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "spec") {
			return runSpecCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "ux") {
			return runUxCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "adr") {
			return runAdrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "changelog") {
			return runChangelogCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "ctx") {
			return runContextCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "library") {
			return runLibraryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "memory") {
			return runMemoryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "state") {
			return runStateCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "adapter") {
			return runAdapterCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "telemetry") {
			return runTelemetryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "hydrate") {
			const hydrateArgs = resolution.action
				? [resolution.action, ...resolution.args]
				: resolution.args;
			return runHydrateCommand("hydrate", hydrateArgs, project.value.root);
		}
		console.error(
			`err unknown-group group=${resolution.group} action=${resolution.action} hint="run afol -h"`,
		);
		return 2;
	}

	console.error("err unsupported-command");
	return 2;
}

if (import.meta.main) {
	exit(await main(process.argv));
}
