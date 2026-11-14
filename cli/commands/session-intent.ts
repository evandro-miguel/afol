import { existsSync } from "node:fs";
import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	registerTaskIntent,
	type TaskIntentRegistrationResult,
} from "../services/workbench/lifecycle";
import { sessionPaths } from "../services/workbench/session-reader";
import {
	TaskIntentError,
	type TaskIntentErrorCode,
} from "../services/workbench/task-intent";
import { type FlagDef, parseFlagSpec } from "./flag-spec";
import type { CommandIo } from "./io";

type ParsedIntentArgs = {
	json: boolean;
	session: string | null;
	taskId: string | null;
	owner: string | null;
	write: string[] | null;
	read: string[] | null;
	clearWrite: boolean;
	clearRead: boolean;
	readOnly: boolean;
	positional: string[];
};

const TASK_ID_RE = /^T-\d{2,3}$/;
const ADVISORY_NOTE =
	"owner and paths are advisory task metadata; they grant no authority, take no lock and do not verify who executes the task";

const FLAGS: readonly FlagDef<ParsedIntentArgs>[] = [
	{ names: ["--json", "-j"], kind: "flag", key: "json" },
	{
		names: ["--session", "-S"],
		kind: "value",
		key: "session",
		rejectDashValue: true,
	},
	{
		names: ["--task-id", "-T"],
		kind: "value",
		key: "taskId",
		rejectDashValue: true,
	},
	{ names: ["--owner"], kind: "value", key: "owner", rejectDashValue: true },
	{ names: ["--write"], kind: "multi", key: "write", rejectDashValue: true },
	{ names: ["--read"], kind: "multi", key: "read", rejectDashValue: true },
	{ names: ["--read-only"], kind: "flag", key: "readOnly" },
	{ names: ["--clear-write"], kind: "flag", key: "clearWrite" },
	{ names: ["--clear-read"], kind: "flag", key: "clearRead" },
];

const ERROR_CODES: Record<TaskIntentErrorCode, string> = {
	invalid: "SESSION_INTENT_INVALID",
	conflict: "SESSION_INTENT_CONFLICT",
	task_not_found: "SESSION_TASK_NOT_FOUND",
	task_not_open: "SESSION_TASK_NOT_OPEN",
	malformed_block: "SESSION_INTENT_MALFORMED",
};

class IntentInvocationError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

function parseIntentArgs(args: readonly string[]): ParsedIntentArgs {
	return parseFlagSpec<ParsedIntentArgs>(
		args,
		{
			flags: FLAGS,
			context: "session intent",
			positional(state, arg) {
				if (arg === undefined || arg.startsWith("-")) return false;
				state.positional.push(arg);
				return true;
			},
		},
		{
			json: false,
			session: null,
			taskId: null,
			owner: null,
			write: null,
			read: null,
			clearWrite: false,
			clearRead: false,
			readOnly: false,
			positional: [],
		},
	);
}

function resolveTaskId(parsed: ParsedIntentArgs): string {
	const candidates = [
		...(parsed.taskId === null ? [] : [parsed.taskId]),
		...parsed.positional,
	];
	if (candidates.length !== 1) {
		throw new IntentInvocationError(
			"SESSION_PARSE_ERROR",
			candidates.length === 0
				? "session intent needs exactly one task id, such as T-01."
				: `session intent takes exactly one task id; got ${candidates.join(", ")}.`,
		);
	}
	const taskId = candidates[0] ?? "";
	if (!TASK_ID_RE.test(taskId)) {
		throw new IntentInvocationError(
			"SESSION_PARSE_ERROR",
			`Invalid task id ${JSON.stringify(taskId)}: use one id such as T-01; ranges and lists are not supported.`,
		);
	}
	return taskId;
}

function resolveExistingSession(projectRoot: string, session: string): void {
	let sessionDir: string;
	try {
		sessionDir = sessionPaths(projectRoot, session).sessionDir;
	} catch (error) {
		throw new IntentInvocationError(
			"SESSION_PARSE_ERROR",
			`${(error as Error).message}: ${JSON.stringify(session)}`,
		);
	}
	if (!existsSync(sessionDir)) {
		throw new IntentInvocationError(
			"SESSION_NOT_FOUND",
			`session not found: ${session} (missing folder ${sessionDir})`,
		);
	}
}

function describeIntent(value: string | null): string {
	if (value === "read_only") return "read-only";
	return value ?? "undeclared";
}

function formatResult(result: TaskIntentRegistrationResult): string[] {
	const owner =
		result.owner === result.previous_owner
			? result.owner
			: `${result.owner} (was ${result.previous_owner || "(missing)"})`;
	const intent =
		result.file_intent === result.previous_file_intent
			? describeIntent(result.file_intent)
			: `${describeIntent(result.file_intent)} (was ${describeIntent(result.previous_file_intent)})`;
	return [
		`task intent ${result.changed ? "registered" : "unchanged"}: ${result.session} ${result.task_id} ${result.state}`,
		`  owner: ${owner}`,
		`  file intent: ${intent}`,
		`  write: ${result.write_paths.length > 0 ? result.write_paths.join(", ") : "(none)"}`,
		`  read: ${result.read_paths.length > 0 ? result.read_paths.join(", ") : "(none)"}`,
		...result.warnings.map((warning) => `  warn: ${warning}`),
		`  note: ${ADVISORY_NOTE}`,
	];
}

function errorCode(error: unknown): string {
	if (error instanceof TaskIntentError) return ERROR_CODES[error.code];
	if (error instanceof IntentInvocationError) return error.code;
	const message = (error as Error).message ?? "";
	if (
		message.startsWith("Unknown session intent argument") ||
		message.startsWith("Missing value for")
	) {
		return "SESSION_PARSE_ERROR";
	}
	if (/^Session .+ is closed\.$/.test(message)) return "SESSION_CLOSED";
	if (message.includes("requires local interactive approval")) {
		return "SESSION_APPROVAL_REQUIRED";
	}
	return "SESSION_ERROR";
}

/**
 * `afol session intent -S <session> <task-id> ...`: register a concrete owner
 * and write or read-only file intent for one open task. Every failure exits 2
 * before any write; the radar stays advisory either way.
 */
export function runSessionIntentCommand(
	args: readonly string[],
	projectRoot: string,
	io: CommandIo,
	ctx: OperationContext,
): number {
	const json = args.includes("--json") || args.includes("-j");
	try {
		const parsed = parseIntentArgs(args);
		if (!parsed.session) {
			throw new IntentInvocationError(
				"SESSION_MISSING_ARG",
				"Missing --session for session intent; pass -S <session-id>.",
			);
		}
		const taskId = resolveTaskId(parsed);
		resolveExistingSession(projectRoot, parsed.session);
		if (requiresApproval(ctx)) {
			throw new Error("session intent requires local interactive approval");
		}
		const result = registerTaskIntent(projectRoot, {
			session: parsed.session,
			taskId,
			...(parsed.owner === null ? {} : { owner: parsed.owner }),
			...(parsed.write === null ? {} : { write: parsed.write }),
			...(parsed.read === null ? {} : { read: parsed.read }),
			clearWrite: parsed.clearWrite,
			clearRead: parsed.clearRead,
			readOnly: parsed.readOnly,
		});
		if (json) {
			io.stdout(
				stringifyEnvelope(
					envelopeOk(
						{ action: "intent", ...result, advisory: ADVISORY_NOTE },
						{ action: "session.intent", exitCode: 0 },
					),
				),
			);
		} else {
			for (const line of formatResult(result)) io.stdout(line);
		}
		return 0;
	} catch (error) {
		const message = (error as Error).message ?? String(error);
		const code = errorCode(error);
		if (json) {
			io.stdout(
				stringifyEnvelope(
					envelopeErr(code, message, {
						action: "session.intent",
						exitCode: 2,
					}),
				),
			);
		} else {
			io.stderr(`for session intent: ${message}`);
		}
		return 2;
	}
}
