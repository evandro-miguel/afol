import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { collectSessionIds } from "../services/local-state/workbench-index";
import { hydrateSession } from "../services/state/session-state";
import { type CommandIo, DEFAULT_IO } from "./io";

type HydrateJsonData = {
	session?: string;
	snapshot?: ReturnType<typeof hydrateSession>;
};

type HydrateAllJsonData = {
	session_count: number;
	summary: {
		source_files: number;
		task_rows: number;
		evidence_entries: number;
	};
};

function parseHydrateArgs(
	args: string[],
):
	| { json: boolean; all: true }
	| { json: boolean; all: false; sessionId: string } {
	let json = false;
	let all = false;
	let sessionId = "";
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--all") {
			all = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --session in hydrate.");
			}
			sessionId = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown hydrate argument: ${value}`);
	}
	if (all && sessionId) {
		throw new Error("Use either --all or --session for hydrate, not both.");
	}
	if (!all && !sessionId) {
		throw new Error("Missing --session or --all for hydrate.");
	}
	return all ? { json, all: true } : { json, all: false, sessionId };
}

function formatResult(snapshot: ReturnType<typeof hydrateSession>): string {
	return [
		`hydrate: ok`,
		`session: ${snapshot.sessionId}`,
		`hydrated_at: ${snapshot.hydratedAt}`,
		`source_files: ${snapshot.sourceFiles.length}`,
		`task_rows: ${snapshot.summary.taskRows}`,
		`evidence_entries: ${snapshot.summary.evidenceEntries}`,
	].join("\n");
}

function writeHydrateJson(
	io: CommandIo,
	snapshot: ReturnType<typeof hydrateSession>,
): void {
	const envelope = envelopeWithLegacyKeys(
		envelopeOk<HydrateJsonData>(
			{ session: snapshot.sessionId, snapshot },
			{ action: "hydrate" },
		),
		["snapshot", "session"],
	);
	io.stdout(stringifyEnvelope(envelope));
}

function summarizeSnapshots(
	snapshots: ReturnType<typeof hydrateSession>[],
): HydrateAllJsonData {
	return {
		session_count: snapshots.length,
		summary: {
			source_files: snapshots.reduce(
				(total, snapshot) => total + snapshot.sourceFiles.length,
				0,
			),
			task_rows: snapshots.reduce(
				(total, snapshot) => total + snapshot.summary.taskRows,
				0,
			),
			evidence_entries: snapshots.reduce(
				(total, snapshot) => total + snapshot.summary.evidenceEntries,
				0,
			),
		},
	};
}

function writeHydrateAllResult(
	io: CommandIo,
	data: HydrateAllJsonData,
	json: boolean,
): void {
	if (json) {
		io.stdout(
			stringifyEnvelope(
				envelopeWithLegacyKeys(envelopeOk(data, { action: "hydrate.all" }), [
					"session_count",
					"summary",
				]),
			),
		);
		return;
	}
	io.stdout(
		[
			"hydrate all: ok",
			`sessions: ${data.session_count}`,
			`source_files: ${data.summary.source_files}`,
			`task_rows: ${data.summary.task_rows}`,
			`evidence_entries: ${data.summary.evidence_entries}`,
		].join("\n"),
	);
}

function writeHydrateError(
	io: CommandIo,
	sessionId: string,
	message: string,
	action: "hydrate" | "hydrate.all" = "hydrate",
): void {
	const envelope = envelopeErr("HYDRATE_FAILED", message, {
		action,
		exitCode: 1,
	}) as ResultEnvelope<HydrateJsonData>;
	envelope.data = { session: sessionId };
	io.stdout(stringifyEnvelope(envelopeWithLegacyKeys(envelope, ["session"])));
}

export async function runHydrateCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const hydrateArgs = action?.startsWith("-") ? [action, ...args] : args;
		if (
			action &&
			!action.startsWith("-") &&
			action !== "hydrate" &&
			action !== "session"
		) {
			throw new Error(`Unknown hydrate action: ${action}`);
		}
		const parsed = parseHydrateArgs(hydrateArgs);
		if (parsed.all) {
			const snapshots: ReturnType<typeof hydrateSession>[] = [];
			for (const sessionId of collectSessionIds(projectRoot)) {
				try {
					snapshots.push(hydrateSession(projectRoot, sessionId));
				} catch (error) {
					if (parsed.json) {
						writeHydrateError(
							io,
							sessionId,
							(error as Error).message,
							"hydrate.all",
						);
						return 1;
					}
					throw error;
				}
			}
			writeHydrateAllResult(io, summarizeSnapshots(snapshots), parsed.json);
			return 0;
		}

		const sessionId = parsed.sessionId;
		try {
			const snapshot = hydrateSession(projectRoot, sessionId);
			if (parsed.json) {
				writeHydrateJson(io, snapshot);
			} else {
				io.stdout(formatResult(snapshot));
			}
		} catch (error) {
			if (parsed.json) {
				writeHydrateError(io, sessionId, (error as Error).message);
			} else {
				throw error;
			}
			return 1;
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
