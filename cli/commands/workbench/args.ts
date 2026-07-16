import { resolveProjectPaths } from "../../services/project/paths";
import type { NewWorkstreamMetadata } from "../../services/workbench/lifecycle";
import { selectSingleOpenTask } from "../../services/workbench/lifecycle";
import type {
	CloseArgs,
	DoneArgs,
	EvidenceArgs,
	LogArgs,
	NewCommandArgs,
	SessionTaskJsonArgs,
	VerificationSpec,
	VerifyArgs,
} from "./types";
import {
	resolveSession,
	resolveVerifySessionPath,
	resolveVerifyTargetPath,
	splitCommandLine,
} from "./verify";

export function hasJsonFlag(args: readonly string[]): boolean {
	return args.includes("--json") || args.includes("-j");
}

export function parseNewArgs(args: string[]): NewCommandArgs {
	let theme = "";
	const rest: string[] = [];
	const metadata: NewWorkstreamMetadata = {};
	let json = false;
	let noSpecRequired = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const value = args[index + 1];
		if (!arg) {
			continue;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--research" || arg === "--no-plan") {
			throw new Error(
				"`afol new` does not support research-only or no-plan sessions; use a normal workstream instead.",
			);
		}
		if (!theme && arg && !arg.startsWith("-")) {
			theme = arg;
			continue;
		}
		if (arg === "--intent") {
			if (!value) {
				throw new Error("Missing value for --intent in new.");
			}
			metadata.intent = value;
			index += 1;
			continue;
		}
		if (arg === "--feature-id") {
			if (!value) {
				throw new Error("Missing value for --feature-id in new.");
			}
			metadata.featureId = value;
			index += 1;
			continue;
		}
		if (arg === "--parent-spec") {
			if (!value) {
				throw new Error("Missing value for --parent-spec in new.");
			}
			metadata.parentSpec = value;
			index += 1;
			continue;
		}
		if (arg === "--no-spec-required") {
			noSpecRequired = true;
			continue;
		}
		if (arg === "--reason") {
			if (!value) {
				throw new Error("Missing value for --reason in new.");
			}
			metadata.noSpecRequiredReason = value;
			index += 1;
			continue;
		}
		if (arg === "--task") {
			if (!value) {
				throw new Error("Missing value for --task in new.");
			}
			metadata.task ??= value;
			metadata.tasks ??= [];
			metadata.tasks.push(value);
			index += 1;
			continue;
		}
		rest.push(arg);
	}
	if (!theme || theme === "--help" || theme === "-h") {
		throw new Error("Missing theme for new workstream.");
	}
	if (rest.length > 0) {
		throw new Error(`Unknown new argument: ${rest[0]}`);
	}
	if (metadata.noSpecRequiredReason && !noSpecRequired) {
		throw new Error("Missing --no-spec-required for new reason.");
	}
	if (noSpecRequired && !metadata.noSpecRequiredReason?.trim()) {
		throw new Error(
			"Missing --reason for --no-spec-required in new workstream.",
		);
	}
	if (
		noSpecRequired &&
		(metadata.featureId?.trim() || metadata.parentSpec?.trim())
	) {
		throw new Error(
			"new governance binding and waiver are mutually exclusive.",
		);
	}
	return { theme, metadata, json };
}

export function parseCloseArgs(args: string[], root: string): CloseArgs {
	let session = "";
	let json = false;
	let allowNoReport = false;
	let reason = "";
	let summary = "";
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[i + 1];
			if (!value) {
				throw new Error("Missing value for --session in close.");
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--allow-no-report") {
			allowNoReport = true;
			continue;
		}
		if (arg === "--summary" || arg === "-m") {
			const value = args[i + 1];
			if (!value) {
				throw new Error("Missing value for --summary in close.");
			}
			summary = value;
			i += 1;
			continue;
		}
		if (arg === "--reason") {
			const value = args[i + 1];
			if (!value) {
				throw new Error("Missing value for --reason in close.");
			}
			reason = value;
			i += 1;
			continue;
		}
		throw new Error(`Unknown close argument: ${arg}`);
	}
	if (reason.trim() && !allowNoReport) {
		throw new Error("Missing --allow-no-report for close reason.");
	}
	if (allowNoReport && !reason.trim()) {
		throw new Error("Missing --reason for close allow-no-report.");
	}
	if (allowNoReport && summary.trim()) {
		throw new Error("Cannot combine --summary with --allow-no-report.");
	}
	return {
		session: resolveSession(root, session, "close"),
		json,
		allowNoReport,
		reason,
		summary,
	};
}

export function parseSessionTaskArgs(
	args: string[],
	commandName: string,
	root: string,
	options: { allowAutoTask?: boolean } = {},
): SessionTaskJsonArgs {
	let session = "";
	let taskId = "";
	let json = false;
	let compact = false;
	let brief = false;
	let briefMode: "compact" | "full" | null = null;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--compact") {
			compact = true;
			continue;
		}
		if (arg === "--brief") {
			const next = args[i + 1];
			if (next === "full") {
				briefMode = "full";
				i += 1;
			} else {
				briefMode = "compact";
			}
			brief = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[i + 1];
			if (!value) {
				throw new Error(`Missing value for --session in ${commandName}.`);
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--task-id") {
			const value = args[i + 1];
			if (!value) {
				throw new Error(`Missing value for --task-id in ${commandName}.`);
			}
			taskId = value;
			i += 1;
			continue;
		}
		if (arg && !arg.startsWith("-") && !taskId) {
			taskId = arg;
			continue;
		}
		throw new Error(`Unknown ${commandName} argument: ${arg}`);
	}
	const resolvedSession = resolveSession(root, session, commandName);
	if (!taskId && options.allowAutoTask) {
		taskId = selectSingleOpenTask(root, resolvedSession);
	}
	if (!taskId) {
		throw new Error(`Missing --task-id for ${commandName}.`);
	}
	return { session: resolvedSession, taskId, json, compact, brief, briefMode };
}

export function parseEvidenceArgs(args: string[], root: string): EvidenceArgs {
	let session = "";
	let taskId = "";
	let command = "";
	let result = "";
	let artifact = "";
	let note = "";
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const value = args[i + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			if (!value) {
				throw new Error("Missing value for --session in evidence.");
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--task-id") {
			if (!value) {
				throw new Error("Missing value for --task-id in evidence.");
			}
			taskId = value;
			i += 1;
			continue;
		}
		if (arg === "--command") {
			if (!value) {
				throw new Error("Missing value for --command in evidence.");
			}
			command = value;
			i += 1;
			continue;
		}
		if (arg === "--result") {
			if (!value) {
				throw new Error("Missing value for --result in evidence.");
			}
			result = value;
			i += 1;
			continue;
		}
		if (arg === "--artifact") {
			if (!value) {
				throw new Error("Missing value for --artifact in evidence.");
			}
			artifact = value;
			i += 1;
			continue;
		}
		if (arg === "--note") {
			if (!value) {
				throw new Error("Missing value for --note in evidence.");
			}
			note = value;
			i += 1;
			continue;
		}
		if (arg && !arg.startsWith("-") && !taskId) {
			taskId = arg;
			continue;
		}
		throw new Error(`Unknown evidence argument: ${arg}`);
	}

	if (!taskId) {
		throw new Error("Missing --task-id for evidence.");
	}
	if (!command) {
		throw new Error("Missing --command for evidence.");
	}
	if (!result) {
		throw new Error("Missing --result for evidence.");
	}

	return {
		session: resolveSession(root, session, "evidence"),
		taskId,
		command,
		result,
		json,
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
	};
}

export function parseDoneArgs(args: string[], root: string): DoneArgs {
	let session = "";
	let taskId = "";
	let testCommand: string | null = null;
	let testShellCommand: string | null = null;
	let verification: VerificationSpec | null = null;
	let evidenceCommand: string | null = null;
	let evidenceResult: string | null = null;
	let requireSpecCheck = false;
	let artifact = "";
	let note = "";
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const value = args[i + 1];
		if (arg === "--") {
			if (testCommand || testShellCommand) {
				throw new Error(
					"Cannot combine positional verification with --test or --test-shell in done.",
				);
			}
			const argv = args.slice(i + 1);
			if (argv.length === 0) {
				throw new Error("Missing verification command after -- in done.");
			}
			verification = {
				mode: "argv",
				executable: argv[0] ?? "",
				args: argv.slice(1),
			};
			break;
		}
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			if (!value) {
				throw new Error("Missing value for --session in done.");
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--task-id") {
			if (!value) {
				throw new Error("Missing value for --task-id in done.");
			}
			taskId = value;
			i += 1;
			continue;
		}
		if (arg === "--test") {
			if (!value) {
				throw new Error("Missing value for --test in done.");
			}
			if (testShellCommand) {
				throw new Error("Cannot use both --test and --test-shell in done.");
			}
			testCommand = value;
			const argv = splitCommandLine(value);
			verification = {
				mode: "argv",
				executable: argv[0] ?? "",
				args: argv.slice(1),
			};
			i += 1;
			continue;
		}
		if (arg === "--test-shell") {
			if (!value) {
				throw new Error("Missing value for --test-shell in done.");
			}
			if (testCommand) {
				throw new Error("Cannot use both --test and --test-shell in done.");
			}
			testShellCommand = value;
			verification = { mode: "shell", command: value };
			i += 1;
			continue;
		}
		if (arg === "--command") {
			if (!value) {
				throw new Error("Missing value for --command in done.");
			}
			evidenceCommand = value;
			i += 1;
			continue;
		}
		if (arg === "--result") {
			if (!value) {
				throw new Error("Missing value for --result in done.");
			}
			evidenceResult = value;
			i += 1;
			continue;
		}
		if (arg === "--require-spec-check") {
			requireSpecCheck = true;
			continue;
		}
		if (arg === "--artifact") {
			if (!value) {
				throw new Error("Missing value for --artifact in done.");
			}
			artifact = value;
			i += 1;
			continue;
		}
		if (arg === "--note") {
			if (!value) {
				throw new Error("Missing value for --note in done.");
			}
			note = value;
			i += 1;
			continue;
		}
		if (arg && !arg.startsWith("-") && !taskId) {
			taskId = arg;
			continue;
		}
		throw new Error(`Unknown done argument: ${arg}`);
	}
	if (!taskId) {
		throw new Error("Missing --task-id for done.");
	}
	if (
		(evidenceCommand && !evidenceResult) ||
		(!evidenceCommand && evidenceResult)
	) {
		throw new Error(
			"done requires both --command and --result when recording evidence.",
		);
	}
	return {
		session: resolveSession(root, session, "done"),
		taskId,
		testCommand,
		testShellCommand,
		verification,
		evidenceCommand,
		evidenceResult,
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
		requireSpecCheck,
		json,
	};
}

export function parseLogArgs(args: string[], root: string): LogArgs {
	let session = "";
	const messageParts: string[] = [];
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const value = args[i + 1];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--session") {
			if (!value) {
				throw new Error("Missing value for --session in log.");
			}
			session = value;
			i += 1;
			continue;
		}
		if (arg === "--message" || arg === "-m") {
			if (!value) {
				throw new Error("Missing value for --message in log.");
			}
			messageParts.push(value);
			i += 1;
			continue;
		}
		if (arg?.startsWith("-")) {
			throw new Error(`Unknown log argument: ${arg}`);
		}
		if (arg) {
			messageParts.push(arg);
		}
	}
	const message = messageParts.join(" ").trim();
	if (!message) {
		throw new Error("Missing timeline message for log.");
	}
	return { session: resolveSession(root, session, "log"), message, json };
}

export function parseVerifyArgs(args: string[], root: string): VerifyArgs {
	let strict = false;
	let sessionPath = "";
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--strict") {
			strict = true;
			continue;
		}
		if (arg === "--session") {
			const value = args[i + 1];
			if (!value) {
				throw new Error("Missing value for --session in verify.");
			}
			sessionPath = resolveVerifySessionPath(root, value);
			i += 1;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			throw new Error("Usage: afol verify-tasks [session-path] [--strict]");
		}
		if (arg?.startsWith("-")) {
			throw new Error(`Unknown verify argument: ${arg}`);
		}
		if (!sessionPath && arg) {
			sessionPath = resolveVerifyTargetPath(root, arg);
			continue;
		}
		throw new Error(`Unexpected verify argument: ${arg}`);
	}

	if (!sessionPath) {
		sessionPath = resolveProjectPaths(root).abs.wbDir;
	}

	return { sessionPath, strict, json };
}
