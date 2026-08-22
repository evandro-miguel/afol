import { resolveProjectPaths } from "../../services/project/paths";
import type { NewWorkstreamMetadata } from "../../services/workbench/lifecycle";
import { selectSingleOpenTask } from "../../services/workbench/lifecycle";
import { type FlagDef, parseFlagSpec } from "../flag-spec";
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
	DEFAULT_VERIFICATION_TIMEOUT_MS,
	resolveSession,
	resolveVerificationTimeoutMs,
	resolveVerifySessionPath,
	resolveVerifyTargetPath,
	splitCommandLine,
} from "./verify";

const TASK_SELECTOR_ITEM_RE = /^T-(\d{2,3})(?:\.\.T-(\d{2,3}))?$/;
const TASK_SELECTOR_MAX_TASKS = 100;

export class DoneArgumentError extends Error {
	readonly code = "workbench.invalid_arguments";

	constructor(message: string) {
		super(message);
		this.name = "DoneArgumentError";
	}
}

function parseTaskSelector(selector: string): string[] {
	const taskIds: string[] = [];
	const seen = new Set<string>();
	for (const item of selector.split(",")) {
		const normalized = item.trim();
		const match = normalized.match(TASK_SELECTOR_ITEM_RE);
		if (!match) {
			throw new Error(`Invalid task selector: ${normalized || selector}.`);
		}
		const startText = match[1] ?? "";
		const endText = match[2];
		const start = Number.parseInt(startText, 10);
		const end = endText ? Number.parseInt(endText, 10) : start;
		if (end < start) {
			throw new Error(`Task range must be ascending: ${normalized}.`);
		}
		const fixedRangeWidth =
			endText && endText.length === startText.length
				? startText.length
				: undefined;
		for (let current = start; current <= end; current += 1) {
			const width =
				endText === undefined
					? startText.length
					: (fixedRangeWidth ?? Math.max(2, String(current).length));
			const taskId = `T-${String(current).padStart(width, "0")}`;
			if (!seen.has(taskId)) {
				seen.add(taskId);
				taskIds.push(taskId);
			}
			if (taskIds.length > TASK_SELECTOR_MAX_TASKS) {
				throw new Error(
					`Task selector supports at most ${TASK_SELECTOR_MAX_TASKS} tasks.`,
				);
			}
		}
	}
	return taskIds;
}

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
	let carryOpen = false;
	let reason = "";
	let summary = "";
	let admitLegacyBaseline = false;
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
		if (arg === "--carry-open") {
			carryOpen = true;
			continue;
		}
		if (arg === "--admit-legacy-baseline") {
			admitLegacyBaseline = true;
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
	if (reason.trim() && !allowNoReport && !carryOpen) {
		throw new Error("Missing --allow-no-report for close reason.");
	}
	if (allowNoReport && !reason.trim()) {
		throw new Error("Missing --reason for close allow-no-report.");
	}
	if (allowNoReport && summary.trim()) {
		throw new Error("Cannot combine --summary with --allow-no-report.");
	}
	if (carryOpen && !reason.trim()) {
		throw new Error("Missing --reason for close carry-open.");
	}
	if (carryOpen && allowNoReport) {
		throw new Error("Cannot combine --carry-open with --allow-no-report.");
	}
	return {
		session: resolveSession(root, session, "close"),
		json,
		allowNoReport,
		carryOpen,
		reason,
		summary,
		admitLegacyBaseline,
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
	const taskIds = parseTaskSelector(taskId);
	return {
		session: resolvedSession,
		taskId: taskIds[0] ?? taskId,
		taskIds,
		json,
		compact,
		brief,
		briefMode,
	};
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

const DONE_MAX_VERIFICATION_STEPS = 8;
const DONE_MAX_ARGV_ENTRIES = 128;
const DONE_MAX_COMMAND_SIZE = 4_096;

function assertNonEmptyVerificationCommand(
	value: string,
	route: "--test" | "--test-shell" | "positional",
	argv?: readonly string[],
): void {
	if (!value.trim() || (argv && !(argv[0] ?? "").trim())) {
		throw new Error(`Empty ${route} command in done.`);
	}
}

function assertDoneVerificationLimits(
	verifications: readonly VerificationSpec[],
): void {
	if (verifications.length > DONE_MAX_VERIFICATION_STEPS) {
		throw new Error("done supports at most 8 --test verification steps.");
	}
	let aggregateUnicodeLength = 0;
	let aggregateByteLength = 0;
	for (const verification of verifications) {
		if (verification.mode !== "argv") continue;
		const argv = [verification.executable, ...verification.args];
		if (argv.length > DONE_MAX_ARGV_ENTRIES) {
			throw new Error("done supports at most 128 argv entries per step.");
		}
		aggregateUnicodeLength += argv.reduce(
			(total, token) => total + Array.from(token).length,
			0,
		);
		aggregateByteLength += argv.reduce(
			(total, token) => total + Buffer.byteLength(token, "utf8"),
			0,
		);
	}
	if (
		aggregateUnicodeLength > DONE_MAX_COMMAND_SIZE ||
		aggregateByteLength > DONE_MAX_COMMAND_SIZE
	) {
		throw new Error(
			"done verification commands have an aggregate limit of 4,096 Unicode characters and UTF-8 bytes.",
		);
	}
}

type DoneFlagState = {
	session: string;
	taskId: string;
	testCommands: string[];
	testShellCommand: string | null;
	verifications: VerificationSpec[];
	evidenceCommand: string | null;
	evidenceResult: string | null;
	requireSpecCheck: boolean;
	artifact: string;
	note: string;
	json: boolean;
	verificationTimeoutMs: number;
};

const DONE_FLAG_SPECS: FlagDef<DoneFlagState>[] = [
	{
		names: ["--"],
		kind: "terminator",
		apply: (state, rest) => {
			if (state.testCommands.length > 0 || state.testShellCommand) {
				throw new Error(
					"Cannot combine positional verification with --test or --test-shell in done.",
				);
			}
			if (rest.length === 0) {
				throw new Error("Missing verification command after -- in done.");
			}
			assertNonEmptyVerificationCommand(rest[0] ?? "", "positional", rest);
			const verification: VerificationSpec = {
				mode: "argv",
				executable: rest[0] ?? "",
				args: rest.slice(1),
			};
			assertDoneVerificationLimits([verification]);
			state.verifications.push(verification);
		},
	},
	{ names: ["--json", "-j"], kind: "flag", key: "json" },
	{ names: ["--session"], kind: "value", key: "session" },
	{ names: ["--task-id"], kind: "value", key: "taskId" },
	{
		names: ["--test"],
		kind: "value",
		apply: (state, raw) => {
			if (state.testShellCommand) {
				throw new Error("Cannot use both --test and --test-shell in done.");
			}
			const argv = splitCommandLine(raw);
			assertNonEmptyVerificationCommand(raw, "--test", argv);
			const verification: VerificationSpec = {
				mode: "argv",
				executable: argv[0] ?? "",
				args: argv.slice(1),
			};
			state.testCommands.push(raw);
			state.verifications.push(verification);
			assertDoneVerificationLimits(state.verifications);
		},
	},
	{
		names: ["--verification-timeout-ms"],
		kind: "value",
		validate: (_state, raw) => {
			if (!Number.isFinite(Number(raw))) {
				throw new Error(
					"Invalid --verification-timeout-ms in done: expected a finite integer.",
				);
			}
		},
		apply: (state, raw) => {
			state.verificationTimeoutMs = resolveVerificationTimeoutMs(Number(raw));
		},
	},
	{
		names: ["--test-shell"],
		kind: "value",
		apply: (state, raw) => {
			if (state.testCommands.length > 0) {
				throw new Error("Cannot use both --test and --test-shell in done.");
			}
			if (state.testShellCommand) {
				throw new Error("done supports only one --test-shell value.");
			}
			assertNonEmptyVerificationCommand(raw, "--test-shell");
			state.testShellCommand = raw;
		},
	},
	{ names: ["--command"], kind: "value", key: "evidenceCommand" },
	{ names: ["--result"], kind: "value", key: "evidenceResult" },
	{ names: ["--require-spec-check"], kind: "flag", key: "requireSpecCheck" },
	{ names: ["--artifact"], kind: "value", key: "artifact" },
	{ names: ["--note"], kind: "value", key: "note" },
];

export function parseDoneArgs(args: string[], root: string): DoneArgs {
	const initialState: DoneFlagState = {
		session: "",
		taskId: "",
		testCommands: [],
		testShellCommand: null,
		verifications: [],
		evidenceCommand: null,
		evidenceResult: null,
		requireSpecCheck: false,
		artifact: "",
		note: "",
		json: false,
		verificationTimeoutMs: DEFAULT_VERIFICATION_TIMEOUT_MS,
	};
	const parsed = parseFlagSpec(
		args,
		{
			flags: DONE_FLAG_SPECS,
			context: "done",
			positional: (state, arg) => {
				if (!arg || arg.startsWith("-") || state.taskId) return false;
				state.taskId = arg;
				return true;
			},
		},
		initialState,
	);
	if (!parsed.taskId) {
		throw new Error("Missing --task-id for done.");
	}
	let taskIds: string[];
	try {
		taskIds = parseTaskSelector(parsed.taskId);
	} catch {
		throw new DoneArgumentError("Invalid done task selector.");
	}
	if (
		(parsed.evidenceCommand && !parsed.evidenceResult) ||
		(!parsed.evidenceCommand && parsed.evidenceResult)
	) {
		throw new Error(
			"done requires both --command and --result when recording evidence.",
		);
	}
	return {
		session: resolveSession(root, parsed.session, "done"),
		taskId: taskIds[0] ?? parsed.taskId,
		taskIds,
		testCommands: parsed.testCommands,
		testShellCommand: parsed.testShellCommand,
		verifications: parsed.verifications,
		verificationTimeoutMs: parsed.verificationTimeoutMs,
		evidenceCommand: parsed.evidenceCommand,
		evidenceResult: parsed.evidenceResult,
		...(parsed.artifact ? { artifact: parsed.artifact } : {}),
		...(parsed.note ? { note: parsed.note } : {}),
		requireSpecCheck: parsed.requireSpecCheck,
		json: parsed.json,
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
	let verbose = false;
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--json" || arg === "-j") {
			json = true;
			continue;
		}
		if (arg === "--verbose" || arg === "-v") {
			verbose = true;
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
			throw new Error(
				"Usage: afol verify-tasks [session-path] [--strict] [--verbose]",
			);
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

	return { sessionPath, strict, json, verbose };
}
