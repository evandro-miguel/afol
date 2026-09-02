import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	annotateFeedback,
	type FeedbackInput,
	feedbackStatus,
	getFeedback,
	lastFeedbackNote,
	listFeedback,
	previewFeedback,
	purgeFeedback,
} from "../services/feedback";
import { type CommandIo, DEFAULT_IO } from "./io";

type FeedbackAction =
	| "status"
	| "list"
	| "show"
	| "preview"
	| "annotate"
	| "purge"
	| "last";
type ParsedArgs = {
	json: boolean;
	id: string | null;
	note: string | null;
	mode: string | null;
	limit: number;
	confirm: boolean;
	all: boolean;
	input: FeedbackInput;
};

function normalizeAction(value: string): FeedbackAction {
	if (!value || value === "status") return "status";
	if (value === "list" || value === "ls") return "list";
	if (value === "show" || value === "get") return "show";
	if (value === "preview" || value === "pre") return "preview";
	if (value === "annotate" || value === "note") return "annotate";
	if (value === "purge" || value === "clear") return "purge";
	if (value === "last") return "last";
	throw new Error("Unknown feedback action.");
}

function nextValue(args: string[], index: number, flag: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("-"))
		throw new Error(`Missing value for ${flag}.`);
	return value;
}

function parseArgs(action: FeedbackAction, args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		id: null,
		note: null,
		mode: null,
		limit: 50,
		confirm: false,
		all: false,
		input: {},
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index] ?? "";
		if (value === "--json" || value === "-j") {
			parsed.json = true;
		} else if (value === "--confirm") {
			parsed.confirm = true;
		} else if (value === "--all") {
			parsed.all = true;
		} else if (value === "--id" || value === "--report-id") {
			parsed.id = nextValue(args, index, value);
			index += 1;
		} else if (value === "--note" || value === "-m") {
			parsed.note = nextValue(args, index, value);
			index += 1;
		} else if (value === "--mode") {
			parsed.mode = nextValue(args, index, value);
			index += 1;
		} else if (value === "--limit") {
			const limit = Number.parseInt(nextValue(args, index, value), 10);
			if (!Number.isFinite(limit) || limit < 1 || limit > 1000)
				throw new Error("--limit must be between 1 and 1000.");
			parsed.limit = limit;
			index += 1;
		} else if (value === "--kind") {
			parsed.input.kind = nextValue(args, index, value);
			index += 1;
		} else if (value === "--message" || value === "--error") {
			parsed.input.message = nextValue(args, index, value);
			index += 1;
		} else if (value === "--code" || value === "--error-code") {
			parsed.input.error_code = nextValue(args, index, value);
			index += 1;
		} else if (value === "--stack") {
			parsed.input.stack = nextValue(args, index, value);
			index += 1;
		} else if (value === "--metadata") {
			const rawMetadata = nextValue(args, index, value);
			let metadata: unknown;
			try {
				metadata = JSON.parse(rawMetadata);
			} catch {
				throw new Error("Invalid --metadata JSON.");
			}
			if (
				!metadata ||
				typeof metadata !== "object" ||
				Array.isArray(metadata)
			) {
				throw new Error("Invalid --metadata: must be a JSON object.");
			}
			parsed.input.metadata = metadata as Record<string, unknown>;
			index += 1;
		} else if (
			!value.startsWith("-") &&
			(action === "show" || action === "annotate" || action === "last")
		) {
			if (action === "show" || action === "annotate") parsed.id ??= value;
			else parsed.note ??= value;
		} else {
			throw new Error("Unknown feedback argument.");
		}
	}
	return parsed;
}

function emit(
	io: CommandIo,
	action: FeedbackAction,
	json: boolean,
	data: Record<string, unknown>,
): void {
	if (json) {
		io.stdout(
			stringifyEnvelope(envelopeOk(data, { action: `feedback.${action}` })),
		);
		return;
	}
	if (action === "status") {
		io.stdout(
			`feedback mode=${String(data.mode)} enabled=${String(data.enabled)} reports=${String(data.count)}`,
		);
	} else if (action === "list") {
		const reports = data.reports as Array<{
			report_id: string;
			kind: string;
			message: string;
			last_note: string | null;
		}>;
		io.stdout(
			[
				`feedback reports: ${reports.length}`,
				...reports.map(
					(report) =>
						`${report.report_id} ${report.kind} ${report.message}${report.last_note ? ` note=${report.last_note}` : ""}`,
				),
			].join("\n"),
		);
	} else {
		io.stdout(JSON.stringify(data));
	}
}

export async function runFeedbackCommand(
	action: string,
	args: string[] = [],
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	let normalized: FeedbackAction = "status";
	const effectiveArgs = action.startsWith("-") ? [action, ...args] : args;
	try {
		normalized = normalizeAction(action.startsWith("-") ? "status" : action);
		const parsed = parseArgs(normalized, effectiveArgs);
		if (parsed.mode && parsed.mode !== "off" && parsed.mode !== "local")
			throw new Error("--mode must be off or local.");
		const env = parsed.mode
			? { ...process.env, AFOL_FEEDBACK_MODE: parsed.mode }
			: process.env;
		if (normalized === "status") {
			emit(
				io,
				normalized,
				parsed.json,
				feedbackStatus(env) as unknown as Record<string, unknown>,
			);
			return 0;
		}
		if (normalized === "list") {
			emit(io, normalized, parsed.json, {
				reports: listFeedback(parsed.limit, env),
			});
			return 0;
		}
		if (normalized === "show") {
			if (!parsed.id) throw new Error("Feedback show requires --id.");
			const report = getFeedback(parsed.id, env);
			if (!report) throw new Error("Feedback report not found.");
			emit(io, normalized, parsed.json, { report });
			return 0;
		}
		if (normalized === "preview") {
			const report = previewFeedback(parsed.input);
			emit(io, normalized, parsed.json, { report, persisted: false });
			return 0;
		}
		if (normalized === "annotate" || normalized === "last") {
			if (normalized === "last" && !parsed.note) {
				emit(io, normalized, parsed.json, { note: lastFeedbackNote(env) });
				return 0;
			}
			if (!parsed.note)
				throw new Error("Feedback annotate requires --note or -m.");
			const report = annotateFeedback(parsed.id ?? "last", parsed.note, env);
			if (!report) throw new Error("No feedback report available to annotate.");
			emit(io, normalized, parsed.json, { report });
			return 0;
		}
		const purgeOptions: { all: boolean; confirm: boolean; reportId?: string } =
			{ all: parsed.all, confirm: parsed.confirm };
		if (parsed.id) purgeOptions.reportId = parsed.id;
		const purged = purgeFeedback(purgeOptions, env);
		emit(io, normalized, parsed.json, { purged });
		return 0;
	} catch (error) {
		io.stdout(
			stringifyEnvelope(
				envelopeErr(
					"feedback.command.error",
					error instanceof Error ? error.message : String(error),
					{ action: `feedback.${normalized}`, exitCode: 2 },
				),
			),
		);
		return 2;
	}
}

export const runFeedback = runFeedbackCommand;
