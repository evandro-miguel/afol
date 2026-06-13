import { spawnSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";
import { resolveProjectPaths } from "../services/project/paths";
import { resolveProjectPath } from "../services/project/root";
import {
	checkSpecCompatibility,
	getSpecCheck,
	type SpecCheckResult,
} from "../services/spec-gate";
import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	appendTimelineEntry,
	closeSession,
	doneTask,
	type NewWorkstreamMetadata,
	newWorkstream,
	readActiveSession,
	recordEvidence,
	selectSingleOpenTask,
	startTask,
} from "../services/workbench/lifecycle";
import {
	formatVerifyReport,
	verifyWorkbenchTasks,
} from "../services/workbench/verify";

type SessionTaskArgs = {
	session: string;
	taskId: string;
};

type SessionTaskJsonArgs = SessionTaskArgs & {
	json: boolean;
};

type EvidenceArgs = SessionTaskArgs & {
	command: string;
	result: string;
	artifact?: string;
	note?: string;
};

type DoneArgs = SessionTaskArgs & {
	testCommand: string | null;
	evidenceCommand: string | null;
	evidenceResult: string | null;
	requireSpecCheck: boolean;
	artifact?: string;
	note?: string;
	json: boolean;
};

type NewCommandArgs = {
	theme: string;
	metadata: NewWorkstreamMetadata;
	json: boolean;
};

type LogArgs = {
	session: string;
	message: string;
	json: boolean;
};

type VerifyArgs = {
	sessionPath: string;
	strict: boolean;
	json: boolean;
};

type SessionArgs = {
	session: string;
	json: boolean;
};

function pathIsInside(root: string, candidate: string): boolean {
	const relativePath = relative(root, candidate);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
}

function resolveVerifyTargetPath(root: string, target: string): string {
	const result = resolveProjectPath(root, target);
	if (!result.ok) {
		throw new Error(result.error);
	}
	return result.value.path;
}

function resolveVerifySessionPath(root: string, session: string): string {
	const projectPaths = resolveProjectPaths(root);
	const normalized = session.trim().replace(/\\/g, "/").replace(/^\.\//, "");
	const sessionTarget =
		normalized === projectPaths.wbDir ||
		normalized.startsWith(`${projectPaths.wbDir}/`)
			? normalized
			: `${projectPaths.wbDir}/${normalized}`;
	const result = resolveProjectPath(root, sessionTarget);
	if (!result.ok) {
		throw new Error(result.error);
	}
	if (!pathIsInside(projectPaths.abs.wbDir, result.value.path)) {
		throw new Error(`Path escapes workbench directory: ${session}`);
	}
	return result.value.path;
}

function hasJsonFlag(args: readonly string[]): boolean {
	return args.includes("--json") || args.includes("-j");
}

function parseNewArgs(args: string[]): NewCommandArgs {
	let theme = "";
	const rest: string[] = [];
	const metadata: NewWorkstreamMetadata = {};
	let json = false;
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
		if (arg === "--task") {
			if (!value) {
				throw new Error("Missing value for --task in new.");
			}
			metadata.task = value;
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
	return { theme, metadata, json };
}

function resolveSession(
	root: string,
	session: string,
	commandName: string,
): string {
	if (session) {
		return session;
	}
	const active = readActiveSession(root);
	if (active) {
		return active;
	}
	throw new Error(
		`Missing --session for ${commandName}; no active session found.`,
	);
}

function parseSessionOnlyArgs(
	args: string[],
	commandName: string,
	root: string,
): SessionArgs {
	let session = "";
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
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
		throw new Error(`Unknown ${commandName} argument: ${arg}`);
	}
	return { session: resolveSession(root, session, commandName), json };
}

function parseSessionTaskArgs(
	args: string[],
	commandName: string,
	root: string,
	options: { allowAutoTask?: boolean } = {},
): SessionTaskJsonArgs {
	let session = "";
	let taskId = "";
	let json = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
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
	return { session: resolvedSession, taskId, json };
}

function parseEvidenceArgs(args: string[], root: string): EvidenceArgs {
	let session = "";
	let taskId = "";
	let command = "";
	let result = "";
	let artifact = "";
	let note = "";
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const value = args[i + 1];
		if (arg === "--json" || arg === "-j") {
			throw new Error("JSON output is not supported for evidence.");
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
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
	};
}

function parseDoneArgs(args: string[], root: string): DoneArgs {
	let session = "";
	let taskId = "";
	let testCommand: string | null = null;
	let evidenceCommand: string | null = null;
	let evidenceResult: string | null = null;
	let requireSpecCheck = false;
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
			testCommand = value;
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
		evidenceCommand,
		evidenceResult,
		...(artifact ? { artifact } : {}),
		...(note ? { note } : {}),
		requireSpecCheck,
		json,
	};
}

function resolveRequiredSpecCheck(
	root: string,
	session: string,
	taskId: string,
): SpecCheckResult {
	const current = getSpecCheck(root, session, taskId);
	if (current?.status === "waived") {
		return current;
	}
	return checkSpecCompatibility(root, session, taskId);
}

function parseLogArgs(args: string[], root: string): LogArgs {
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

function parseVerifyArgs(args: string[], root: string): VerifyArgs {
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

function splitCommandLine(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaping = false;
	for (const char of command) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) {
				quote = null;
				continue;
			}
			current += char;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaping) {
		current += "\\";
	}
	if (quote) {
		throw new Error("Unclosed quote in --test command.");
	}
	if (current.length > 0) {
		tokens.push(current);
	}
	return tokens;
}

function runVerification(root: string, command: string): { exitCode: number } {
	const argv = splitCommandLine(command);
	const executable = argv[0];
	if (!executable) {
		throw new Error("Empty --test command.");
	}
	const result = spawnSync(executable, argv.slice(1), {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
		timeout: 120_000,
	});
	if (result.error) {
		throw new Error(`Failed to run --test command: ${result.error.message}`);
	}
	return { exitCode: result.status ?? 1 };
}

function writeJsonError(
	action: string,
	error: unknown,
	exitCode = 2,
): void {
	const message = error instanceof Error ? error.message : String(error);
	console.log(
		stringifyEnvelope(
			envelopeErr("workbench.error", message, { action, exitCode }),
		),
	);
}

export async function runNewCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseNewArgs(args);
		const created = newWorkstream(root, parsed.theme, parsed.metadata);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk({ ...created, status: "created" }, { action: "workbench.new" }),
				),
			);
		} else {
			console.log(`session created: ${created.session}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.new", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runStartCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseSessionTaskArgs(args, "start", root, {
			allowAutoTask: true,
		});
		startTask(root, parsed);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: "in_progress",
						},
						{ action: "workbench.start" },
					),
				),
			);
		} else {
			console.log(`task started: ${parsed.taskId}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.start", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runEvidenceCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const record = recordEvidence(root, parseEvidenceArgs(args, root));
		console.log(`evidence recorded: ${record.id}`);
		return 0;
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}
}

export async function runDoneCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseDoneArgs(args, root);
		if (parsed.requireSpecCheck) {
			const specCheck = resolveRequiredSpecCheck(
				root,
				parsed.session,
				parsed.taskId,
			);
			if (specCheck.status === "conflict") {
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(`spec check failed: ${specCheck.spec_id || parsed.taskId}`),
						1,
					);
				} else {
					console.error(
						`spec check failed: ${specCheck.spec_id || parsed.taskId}`,
					);
				}
				return 1;
			}
		}
		if (parsed.testCommand) {
			const verification = runVerification(root, parsed.testCommand);
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.testCommand,
				result: verification.exitCode === 0 ? "passed" : "failed",
				exitCode: verification.exitCode,
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
			if (verification.exitCode !== 0) {
				if (parsed.json) {
					writeJsonError(
						"workbench.done",
						new Error(`--test failed with exit code ${verification.exitCode}`),
						1,
					);
				} else {
					console.error(`--test failed with exit code ${verification.exitCode}`);
				}
				return 1;
			}
		}
		if (parsed.evidenceCommand && parsed.evidenceResult) {
			recordEvidence(root, {
				session: parsed.session,
				taskId: parsed.taskId,
				command: parsed.evidenceCommand,
				result: parsed.evidenceResult,
				...(parsed.artifact ? { artifact: parsed.artifact } : {}),
				...(parsed.note ? { note: parsed.note } : {}),
			});
		}
		doneTask(root, parsed);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							task: parsed.taskId,
							status: "done",
						},
						{ action: "workbench.done" },
					),
				),
			);
		} else {
			console.log(`task done: ${parsed.taskId}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.done", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runLogCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseLogArgs(args, root);
		const result = appendTimelineEntry(root, parsed.session, parsed.message);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{
							session: parsed.session,
							status: "logged",
							logPath: result.logPath,
							message: result.message,
						},
						{ action: "workbench.log" },
					),
				),
			);
		} else {
			console.log(`log appended: ${result.logPath}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.log", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runVerifyTasksCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
			console.log("Usage: afol verify-tasks [session-path] [--strict]");
			return 0;
		}
		const parsed = parseVerifyArgs(args, root);
		const result = verifyWorkbenchTasks(parsed.sessionPath, parsed.strict);
		if (parsed.json) {
			if (result.allCompleted) {
				console.log(
					stringifyEnvelope(
						envelopeOk(
							{
								...result,
								status: "passed",
							},
							{ action: "workbench.verify" },
						),
					),
				);
			} else {
				console.log(
					stringifyEnvelope(
						envelopeErr(
							"workbench.error",
							"Verification failed.",
							{
								action: "workbench.verify",
								exitCode: 1,
								hint: `open_tasks=${result.openTasks.length}; issues=${result.issues.length}`,
							},
						),
					),
				);
			}
		} else {
			console.log(formatVerifyReport(result).trimEnd());
		}
		return result.allCompleted ? 0 : 1;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.verify", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}

export async function runCloseCommand(
	args: string[],
	root: string = process.cwd(),
): Promise<number> {
	try {
		const parsed = parseSessionOnlyArgs(args, "close", root);
		closeSession(root, parsed.session);
		if (parsed.json) {
			console.log(
				stringifyEnvelope(
					envelopeOk(
						{ session: parsed.session, status: "closed" },
						{ action: "workbench.close" },
					),
				),
			);
		} else {
			console.log(`session closed: ${parsed.session}`);
		}
		return 0;
	} catch (error) {
		if (hasJsonFlag(args)) {
			writeJsonError("workbench.close", error);
		} else {
			console.error((error as Error).message);
		}
		return 2;
	}
}
