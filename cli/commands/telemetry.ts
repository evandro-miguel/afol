import { envelopeErr, envelopeOk, stringifyEnvelope } from "../core/envelope";
import {
	readTelemetryEvents,
	type TelemetryEvent,
	type TelemetryEventType,
} from "../services/events/telemetry";
import { type CommandIo, DEFAULT_IO } from "./io";

const DEFAULT_QUERY_LIMIT = 10;

type TelemetryAction = "query" | "report" | "export";

type ParsedArgs = {
	json: boolean;
	type: TelemetryEventType | null;
	session: string | null;
	limit: number;
	format: "json" | "jsonl";
};

function wantsJson(action: string, args: string[]): boolean {
	return (
		action === "--json" ||
		action === "-j" ||
		args.includes("--json") ||
		args.includes("-j")
	);
}

function normalizeInvocation(
	action: string,
	args: string[],
): { action: TelemetryAction; args: string[] } {
	if (action.startsWith("-")) {
		return { action: "query", args: [action, ...args] };
	}
	return { action: normalizeAction(action), args };
}

function normalizeAction(action: string): TelemetryAction {
	if (!action || action === "query" || action === "q") return "query";
	if (action === "report" || action === "r") return "report";
	if (action === "export" || action === "ex") return "export";
	throw new Error(`Unknown telemetry action: ${action}`);
}

function parseEventType(value: string): TelemetryEventType {
	const allowed = new Set<TelemetryEventType>([
		"session_start",
		"session_end",
		"task_start",
		"task_complete",
		"tool_exec",
		"error",
		"blocker",
	]);
	if (!allowed.has(value as TelemetryEventType)) {
		throw new Error(`Unknown telemetry event type: ${value}`);
	}
	return value as TelemetryEventType;
}

function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		json: false,
		type: null,
		session: null,
		limit: DEFAULT_QUERY_LIMIT,
		format: "json",
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		const next = args[index + 1];
		if (!value) continue;
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--type") {
			if (!next || next.startsWith("-"))
				throw new Error("Missing value for --type.");
			parsed.type = parseEventType(next);
			index += 1;
			continue;
		}
		if (value === "--session") {
			if (!next || next.startsWith("-"))
				throw new Error("Missing value for --session.");
			parsed.session = next;
			index += 1;
			continue;
		}
		if (value === "--limit") {
			if (!next || next.startsWith("-"))
				throw new Error("Missing value for --limit.");
			const limit = Number.parseInt(next, 10);
			if (!Number.isFinite(limit) || limit < 1 || limit > 1000) {
				throw new Error("--limit must be between 1 and 1000.");
			}
			parsed.limit = limit;
			index += 1;
			continue;
		}
		if (value === "--format") {
			if (next !== "json" && next !== "jsonl") {
				throw new Error("--format must be json or jsonl.");
			}
			parsed.format = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown telemetry argument: ${value}`);
	}
	return parsed;
}

function filterEvents(
	events: TelemetryEvent[],
	parsed: ParsedArgs,
): TelemetryEvent[] {
	return events
		.filter((event) => (parsed.type ? event.event_type === parsed.type : true))
		.filter((event) =>
			parsed.session ? event.session_id === parsed.session : true,
		)
		.slice(-parsed.limit);
}

function summarize(events: TelemetryEvent[]): Record<string, unknown> {
	const by_type: Record<string, number> = {};
	const by_outcome: Record<string, number> = {};
	const sessions = new Set<string>();
	for (const event of events) {
		by_type[event.event_type] = (by_type[event.event_type] ?? 0) + 1;
		if (event.outcome)
			by_outcome[event.outcome] = (by_outcome[event.outcome] ?? 0) + 1;
		sessions.add(event.session_id);
	}
	return {
		total: events.length,
		sessions: sessions.size,
		by_type,
		by_outcome,
	};
}

function emitJson(
	io: CommandIo,
	action: string,
	data: Record<string, unknown>,
): void {
	io.stdout(stringifyEnvelope(envelopeOk(data, { action })));
}

function emitJsonError(io: CommandIo, action: string, message: string): void {
	io.stdout(
		stringifyEnvelope(
			envelopeErr("telemetry.command.error", message, {
				action,
				exitCode: 2,
			}),
		),
	);
}

function formatQuery(events: TelemetryEvent[]): string {
	return [
		`telemetry query: ${events.length} latest`,
		...events.map(
			(event) =>
				`${event.ts} ${event.event_type} session=${event.session_id}${event.task_id ? ` task=${event.task_id}` : ""}${event.cmd_type ? ` cmd=${event.cmd_type}` : ""}${event.outcome ? ` outcome=${event.outcome}` : ""}`,
		),
	].join("\n");
}

export async function runTelemetryCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const invocation = normalizeInvocation(action, args);
		const telemetryAction = invocation.action;
		const parsed = parseArgs(invocation.args);
		const events = filterEvents(readTelemetryEvents(projectRoot), parsed);
		if (telemetryAction === "query") {
			if (parsed.json)
				emitJson(io, "telemetry.query", { events, count: events.length });
			else io.stdout(formatQuery(events));
			return 0;
		}
		if (telemetryAction === "report") {
			const report = summarize(events);
			if (parsed.json) emitJson(io, "telemetry.report", report);
			else
				io.stdout(
					`telemetry report: total=${report.total} sessions=${report.sessions}`,
				);
			return 0;
		}
		if (parsed.format === "jsonl") {
			io.stdout(events.map((event) => JSON.stringify(event)).join("\n"));
		} else {
			emitJson(io, "telemetry.export", { events, count: events.length });
		}
		return 0;
	} catch (error) {
		const message = (error as Error).message;
		if (wantsJson(action, args)) {
			emitJsonError(io, "telemetry", message);
		} else {
			io.stderr(message);
		}
		return 2;
	}
}
