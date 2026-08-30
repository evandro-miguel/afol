#!/usr/bin/env bun

import { envelopeErr, stringifyEnvelope } from "./core/envelope";
import {
	defaultOperationContext,
	isActionAllowed,
	type OperationContext,
	resolveCanonicalAction,
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
	"Usage: afol close [--session <session-id>] [options]",
	"",
	"Options",
	"  --session <session-id>      Workbench session; omit when active/bound",
	"  -m, --summary <text>        Summary for the generated report",
	"  --allow-no-report           Explicitly waive a missing report",
	"  --carry-open                Move open tasks to one governed continuation",
	"  --reason <text>             Required with --allow-no-report or --carry-open",
	"  --admit-legacy-baseline     Waive issues admitted by the legacy evidence baseline",
	"  -j, --json                  Emit machine-readable close result",
].join("\n");

const exit = (code: number): never => {
	process.exit(code);
};

export const DIRECT_DISPATCH_KINDS = Object.freeze([
	"bootstrap",
	"init",
	"validate",
	"status",
	"feedback",
	"new",
	"start",
	"evidence",
	"legacy",
	"done",
	"transition",
	"log",
	"quickTask",
	"verifyTasks",
	"hook",
	"rule",
	"skill",
	"update",
	"fleet",
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
	"evolve",
	"state",
	"adapter",
	"telemetry",
	"receipt",
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
	// callers. Privileged local evolution mutations require a real terminal.
	let operationCtx: OperationContext = defaultOperationContext();
	{
		const resolved = resolveOperationContext(
			args,
			process.env,
			Boolean(process.stdin.isTTY && process.stderr.isTTY),
		);
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
			if (verboseRequested && !parsedHelp.intent) {
				console.error(
					'err help-json-too-large hint="add --for planning, execution, or maintenance"',
				);
				return 2;
			}
			console.log(
				formatCatalogJson(kernelRegistry, {
					verbose: verboseRequested,
					...(parsedHelp.intent ? { intent: parsedHelp.intent } : {}),
				}),
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
		const jsonRequested = args.some((arg) => kernelRegistry.isJsonAlias(arg));
		if (jsonRequested && resolution.message.startsWith("err unknown-command")) {
			const fields =
				/^err unknown-command command=(\S+) hint="([^"]*)"(?: did_you_mean=(\S+))?$/.exec(
					resolution.message,
				);
			if (fields) {
				const [command, hint, didYouMean] = fields.slice(1);
				console.log(
					stringifyEnvelope({
						schema: "afol.result/v1",
						ok: false,
						exit_code: 2,
						action: "route",
						data:
							didYouMean === undefined
								? { command, hint }
								: { command, hint, did_you_mean: didYouMean },
					}),
				);
				return 2;
			}
		}
		console.error(resolution.message);
		return resolution.exitCode;
	}

	if (resolution.kind === "new" && hasHelpArg(resolution.args)) {
		console.log(NEW_COMMAND_HELP);
		return 0;
	}

	if (resolution.kind === "start" && hasHelpArg(resolution.args)) {
		console.log(START_COMMAND_HELP);
		return 0;
	}

	if (resolution.kind === "close" && hasHelpArg(resolution.args)) {
		console.log(CLOSE_COMMAND_HELP);
		return 0;
	}

	const directHelpCommand =
		resolution.kind !== "subcommand" &&
		resolution.kind !== "verifyTasks" &&
		hasHelpArg(resolution.args)
			? registryHelpCommandForGroup(resolution.kind)
			: null;
	if (directHelpCommand) {
		const help = formatCommandHelp(directHelpCommand, kernelRegistry);
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

	const policy = resolveCanonicalAction({
		kind: resolution.kind,
		args: resolution.args,
		...(resolution.kind === "subcommand"
			? { group: resolution.group, action: resolution.action }
			: {}),
	});
	if (!isActionAllowed(operationCtx, policy)) {
		const action = policy?.action ?? resolution.kind;
		const message = `${action} requires local interactive approval`;
		const json = resolution.args.some((arg) => kernelRegistry.isJsonAlias(arg));
		if (json) {
			console.log(
				stringifyEnvelope(
					envelopeErr("approval-required", message, {
						action,
						exitCode: 2,
					}),
				),
			);
		} else {
			console.error(`err approval-required ${message}`);
		}
		return 2;
	}

	if (resolution.kind === "feedback") {
		const { runFeedbackCommand } = await import("./commands/feedback");
		const [action = "status", ...feedbackArgs] = resolution.args;
		return runFeedbackCommand(action, feedbackArgs);
	}

	if (resolution.kind === "bootstrap") {
		const { runBootstrapCommand } = await import("./commands/bootstrap");
		return runBootstrapCommand(resolution.args, {}, operationCtx);
	}

	if (resolution.kind === "init") {
		const { runInitCommand } = await import("./commands/init");
		return runInitCommand(resolution.args, operationCtx);
	}

	if (resolution.kind === "fleet") {
		const { runFleetCommand } = await import("./commands/fleet");
		return runFleetCommand(
			resolution.args,
			process.cwd(),
			undefined,
			operationCtx,
		);
	}

	const project = loadProjectRoot(process.cwd());
	if (!project.ok) {
		console.error(project.error.message);
		return project.error.code;
	}

	if (resolution.kind === "validate") {
		const { resolveValidateInvocation, runValidationCommand } = await import(
			"./validate/command"
		);
		const validateInvocation = resolveValidateInvocation(resolution.args);
		if (validateInvocation.kind === "benchmark") {
			return runValidationCommand(project.value.root, validateInvocation.args);
		}
		const { runValidateCommand } = await import("./commands/validate");
		return runValidateCommand(project.value.root, validateInvocation.args);
	}

	if (resolution.kind === "status") {
		const { runStatusCommand } = await import("./commands/status");
		return runStatusCommand(
			project.value.root,
			resolution.args,
			undefined,
			project.value,
		);
	}

	if (resolution.kind === "new") {
		const { runNewCommand } = await import("./commands/workbench");
		return runNewCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "start") {
		const { runStartCommand } = await import("./commands/workbench");
		return runStartCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "evidence") {
		const { runEvidenceCommand } = await import("./commands/workbench");
		return runEvidenceCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "legacy") {
		const { runLegacyCommand } = await import("./commands/legacy");
		return runLegacyCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "done") {
		const { runDoneCommand } = await import("./commands/workbench");
		return runDoneCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "transition") {
		const { runTransitionCommand } = await import("./commands/workbench");
		return runTransitionCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "log") {
		const { runLogCommand } = await import("./commands/workbench");
		return runLogCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "quickTask") {
		const { runQuickTaskCommand } = await import("./commands/quick-task");
		return runQuickTaskCommand(
			resolution.args,
			project.value.root,
			operationCtx,
		);
	}

	if (resolution.kind === "verifyTasks") {
		const { runVerifyTasksCommand } = await import("./commands/workbench");
		return runVerifyTasksCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "hook") {
		const { runHookCommand } = await import("./commands/catalog");
		return runHookCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "rule") {
		const { runRuleCommand } = await import("./commands/catalog");
		return runRuleCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "skill") {
		const { runSkillCommand } = await import("./commands/catalog");
		return runSkillCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "update") {
		const { runUpdateCommand } = await import("./commands/update");
		return runUpdateCommand(
			resolution.args,
			project.value.root,
			undefined,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "close") {
		const { runCloseCommand } = await import("./commands/close");
		return runCloseCommand(resolution.args, project.value.root, operationCtx);
	}

	if (resolution.kind === "file") {
		const { runFileCommand } = await import("./commands/file");
		return runFileCommand(
			resolution.args,
			project.value.root,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "localState") {
		const { runLocalStateCommand } = await import("./commands/local-state");
		return runLocalStateCommand(
			resolution.args,
			project.value.root,
			undefined,
			operationCtx,
		);
	}

	if (resolution.kind === "catchup") {
		const { runCatchupCommand } = await import("./commands/catchup");
		return runCatchupCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "preflight") {
		const { runPreflightCommand } = await import("./commands/preflight");
		return runPreflightCommand(resolution.args, project.value.root);
	}

	if (resolution.kind === "subcommand" && resolution.group === "adm") {
		const { runAdmCommand } = await import("./commands/adm");
		return runAdmCommand(
			resolution.action,
			resolution.args,
			project.value.root,
		);
	}

	if (resolution.kind === "subcommand") {
		if (resolution.group === "health") {
			const { runHealthCommand } = await import("./commands/health");
			return runHealthCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "governance") {
			const { runGovernanceCommand } = await import("./commands/governance");
			return runGovernanceCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "db") {
			const { runDbCommand } = await import("./commands/db");
			return runDbCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "doctor") {
			const { runDoctorCommand } = await import("./commands/doctor");
			return runDoctorCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
			);
		}
		if (resolution.group === "maintenance") {
			const { runMaintenanceCommand } = await import("./commands/maintenance");
			return runMaintenanceCommand(
				[resolution.action, ...resolution.args].filter(Boolean),
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "pstr") {
			const { runPstrCommand } = await import("./commands/pstr");
			return runPstrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "schema") {
			const { runSchemaCommand } = await import("./commands/schema-cmd");
			return runSchemaCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "session") {
			const { runSessionCommand } = await import("./commands/session");
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
				const { runValidationCommand } = await import("./validate/command");
				return runValidationCommand(project.value.root, [
					"bench",
					...resolution.args,
				]);
			}
			const { runBenchCommand } = await import("./commands/bench");
			return runBenchCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "projectBenchmark") {
			const { runProjectBenchmarkCommand } = await import(
				"./commands/project-benchmark"
			);
			return runProjectBenchmarkCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "sweep") {
			const { runSweepCommand } = await import("./commands/sweep");
			return runSweepCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "spec") {
			const { runSpecCommand } = await import("./commands/spec");
			return runSpecCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "ux") {
			const { runUxCommand } = await import("./commands/ux");
			return runUxCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "adr") {
			const { runAdrCommand } = await import("./commands/adr");
			return runAdrCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "changelog") {
			const { runChangelogCommand } = await import("./commands/changelog");
			return runChangelogCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "ctx") {
			const { runContextCommand } = await import("./commands/context");
			return runContextCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "library") {
			const { runLibraryCommand } = await import("./commands/library");
			return runLibraryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "memory") {
			const { runMemoryCommand } = await import("./commands/memory");
			return runMemoryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "evolve") {
			const { runEvolveCommand } = await import("./commands/evolve");
			return runEvolveCommand(
				resolution.action,
				resolution.args,
				project.value.root,
				undefined,
				operationCtx,
			);
		}
		if (resolution.group === "state") {
			const { runStateCommand } = await import("./commands/state");
			return runStateCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "adapter") {
			const { runAdapterCommand } = await import("./commands/adapter");
			return runAdapterCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "telemetry") {
			const { runTelemetryCommand } = await import("./commands/telemetry");
			return runTelemetryCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "receipt") {
			const { runReceiptCommand } = await import("./commands/receipt");
			return runReceiptCommand(
				resolution.action,
				resolution.args,
				project.value.root,
			);
		}
		if (resolution.group === "hydrate") {
			const { runHydrateCommand } = await import("./commands/hydrate");
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

export async function runWithDiagnostics(
	argv: string[],
	invoke: (argv: string[]) => Promise<number> = main,
): Promise<number> {
	try {
		return await invoke(argv);
	} catch (error) {
		const { captureDiagnostic } = await import("./core/diagnostic");
		const diagnostic = captureDiagnostic(error);
		const integrity = diagnostic.kind === "integrity";
		const code = integrity ? "INTEGRITY_ERROR" : "UNEXPECTED_ERROR";
		const message = integrity
			? "Integrity check failed."
			: "Unexpected command failure.";
		const commandArgs = argv.slice(2);
		const delimiter = commandArgs.indexOf("--");
		const boundaryArgs =
			delimiter === -1 ? commandArgs : commandArgs.slice(0, delimiter);
		const json = boundaryArgs.some((arg) => arg === "--json" || arg === "-j");
		if (json) {
			console.log(
				stringifyEnvelope({
					schema: "afol.result/v1",
					ok: false,
					exit_code: 1,
					error: { code, message },
					diagnostic: {
						kind: diagnostic.kind,
						report_id: diagnostic.report_id,
						persisted: diagnostic.persisted,
					},
				}),
			);
		} else {
			console.error(
				`err ${code} ${message} report_id=${diagnostic.report_id} persisted=${diagnostic.persisted ? "yes" : "no"}`,
			);
		}
		return 1;
	}
}

if (import.meta.main) {
	exit(await runWithDiagnostics(process.argv));
}
