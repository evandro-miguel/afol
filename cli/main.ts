#!/usr/bin/env bun

import { envelopeErr, stringifyEnvelope } from "./core/envelope";
import {
	defaultOperationContext,
	isActionAllowed,
	type OperationContext,
	resolveCanonicalAction,
	resolveOperationContext,
} from "./core/operation-context";
import {
	dispatchProjectDirect,
	dispatchRootFreeDirect,
} from "./direct-dispatch";
import { dispatchSubcommand } from "./dispatch";
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

const exit = (code: number): never => {
	process.exit(code);
};

export { DIRECT_DISPATCH_KINDS } from "./direct-dispatch";

export { SUBCOMMAND_DISPATCH_GROUPS } from "./dispatch";

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

	const directHelpCommand =
		resolution.kind !== "subcommand" && hasHelpArg(resolution.args)
			? resolution.kind === "verifyTasks"
				? kernelRegistry.canonicalize(args[0] ?? "verify")
				: registryHelpCommandForGroup(resolution.kind)
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

	const rootFreeResult = dispatchRootFreeDirect(resolution, operationCtx);
	if (rootFreeResult !== undefined) return rootFreeResult;

	const project = loadProjectRoot(process.cwd());
	if (!project.ok) {
		console.error(project.error.message);
		return project.error.code;
	}

	const projectResult = dispatchProjectDirect(
		resolution,
		project.value,
		operationCtx,
	);
	if (projectResult !== undefined) return projectResult;

	if (resolution.kind === "subcommand") {
		const result = dispatchSubcommand(
			resolution,
			project.value.root,
			operationCtx,
		);
		if (result !== undefined) return result;
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
