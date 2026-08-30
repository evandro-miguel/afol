import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import {
	exportSessionState,
	hydrateSession,
	isStale,
	loadSessionState,
	validateSessionState,
} from "../services/state/session-state";
import {
	defaultAllowGlobalFallback,
	resolveSession,
} from "../services/workbench/session-context";
import { type CommandIo, DEFAULT_IO } from "./io";

type StateAction = "show" | "validate" | "sync" | "export";

type StateSnapshotJson = {
	session?: string;
	snapshot?: NonNullable<ReturnType<typeof loadSessionState>>;
	stale?: boolean;
};

type StateValidationJson = {
	session?: string;
	result?: ReturnType<typeof validateSessionState>;
};

function normalizeAction(value: string | undefined): StateAction {
	if (!value || value === "show" || value === "sh") {
		return "show";
	}
	if (value === "validate" || value === "v") {
		return "validate";
	}
	if (value === "sync" || value === "sy") {
		return "sync";
	}
	if (value === "export" || value === "ex") {
		return "export";
	}
	throw new Error(`Unknown state action: ${value}`);
}

function parseStateArgs(args: string[]): { json: boolean; sessionId?: string } {
	let json = false;
	let sessionId = "";
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--session" || value === "-S") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --session in state.");
			}
			sessionId = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown state argument: ${value}`);
	}
	return { json, ...(sessionId ? { sessionId } : {}) };
}

function resolveSessionId(projectRoot: string, parsed: { sessionId?: string }) {
	const resolved = resolveSession(projectRoot, {
		...(parsed.sessionId ? { explicit: parsed.sessionId } : {}),
		allowGlobalFallback: defaultAllowGlobalFallback(),
	});
	if (!resolved) {
		throw new Error(
			"Missing usable session for state. Run afol ss list, switch an open session, or pass -S <session>.",
		);
	}
	return resolved.session;
}

function formatSnapshot(
	snapshot: NonNullable<ReturnType<typeof loadSessionState>>,
	stale = false,
): string {
	return [
		`state: ${snapshot.sessionId}`,
		`freshness: ${stale ? "stale" : "current"}`,
		`hydrated_at: ${snapshot.hydratedAt}`,
		`sources: ${snapshot.sourceFiles.length}`,
		`plan_files: ${snapshot.summary.planFiles}`,
		`task_files: ${snapshot.summary.taskFiles}`,
		`log_files: ${snapshot.summary.logFiles}`,
		`task_rows: ${snapshot.summary.taskRows}`,
		`open_tasks: ${snapshot.summary.openTasks}`,
		`done_tasks: ${snapshot.summary.doneTasks}`,
		`evidence_entries: ${snapshot.summary.evidenceEntries}`,
		`active_session: ${snapshot.summary.activeSession ?? "none"}`,
	].join("\n");
}

function formatValidation(
	result: ReturnType<typeof validateSessionState>,
): string {
	return [
		`state validate: ${result.ok ? "ok" : "fail"}`,
		`session: ${result.sessionId}`,
		`hydrated_at: ${result.hydratedAt ?? "none"}`,
		`stored_sources: ${result.storedSourceCount}`,
		`current_sources: ${result.currentSourceCount}`,
		...result.mismatches.map(
			(mismatch) =>
				`mismatch ${mismatch.path} stored=${mismatch.stored} current=${mismatch.current}`,
		),
		result.mismatches.length === 0 ? result.message : "",
	]
		.filter((line) => line.length > 0)
		.join("\n");
}

function writeSnapshotJson(
	io: CommandIo,
	action: Exclude<StateAction, "validate">,
	snapshot: NonNullable<ReturnType<typeof loadSessionState>>,
	stale?: boolean,
): void {
	const envelope = envelopeWithLegacyKeys(
		envelopeOk<StateSnapshotJson>(
			{
				session: snapshot.sessionId,
				snapshot,
				...(stale === undefined ? {} : { stale }),
			},
			{ action: `state.${action}` },
		),
		["snapshot", "session", "stale"],
	);
	io.stdout(stringifyEnvelope(envelope));
}

function writeSnapshotError(
	io: CommandIo,
	action: Exclude<StateAction, "validate">,
	sessionId: string,
	message: string,
): void {
	const envelope = envelopeErr("STATE_MISSING", message, {
		action: `state.${action}`,
		exitCode: 1,
	}) as ResultEnvelope<StateSnapshotJson>;
	envelope.data = { session: sessionId };
	io.stdout(stringifyEnvelope(envelopeWithLegacyKeys(envelope, ["session"])));
}

function writeValidationJson(
	io: CommandIo,
	result: ReturnType<typeof validateSessionState>,
): void {
	const envelope = result.ok
		? envelopeOk<StateValidationJson>(
				{ session: result.sessionId, result },
				{ action: "state.validate" },
			)
		: (envelopeErr("STATE_VALIDATE_FAILED", result.message, {
				action: "state.validate",
				exitCode: 1,
			}) as ResultEnvelope<StateValidationJson>);
	envelope.data = { session: result.sessionId, result };
	io.stdout(
		stringifyEnvelope(envelopeWithLegacyKeys(envelope, ["result", "session"])),
	);
}

export async function runStateCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const stateArgs = action?.startsWith("-") ? [action, ...args] : args;
		const stateAction =
			action && !action.startsWith("-") ? normalizeAction(action) : "show";
		const parsed = parseStateArgs(stateArgs);
		const sessionId = resolveSessionId(projectRoot, parsed);

		if (stateAction === "sync") {
			try {
				const snapshot = hydrateSession(projectRoot, sessionId);
				if (parsed.json) {
					writeSnapshotJson(io, stateAction, snapshot);
				} else {
					io.stdout(
						[
							`state sync: ok`,
							`session: ${snapshot.sessionId}`,
							`hydrated_at: ${snapshot.hydratedAt}`,
							`source_files: ${snapshot.sourceFiles.length}`,
						].join("\n"),
					);
				}
				return 0;
			} catch (error) {
				if (parsed.json) {
					writeSnapshotError(
						io,
						stateAction,
						sessionId,
						(error as Error).message,
					);
					return 1;
				}
				throw error;
			}
		}

		if (stateAction === "validate") {
			const result = validateSessionState(projectRoot, sessionId);
			if (parsed.json) {
				writeValidationJson(io, result);
			} else {
				io.stdout(formatValidation(result));
			}
			return result.ok ? 0 : 1;
		}

		if (stateAction === "export") {
			const snapshot = exportSessionState(projectRoot, sessionId);
			if (!snapshot) {
				if (parsed.json) {
					writeSnapshotError(
						io,
						stateAction,
						sessionId,
						`state export: no hydrated state for ${sessionId}. Run ` +
							"`afol hydrate -S <session>` first.",
					);
					return 1;
				}
				io.stderr(
					`state export: no hydrated state for ${sessionId}. Run ` +
						"`afol hydrate -S <session>` first.",
				);
				return 1;
			}
			if (parsed.json) {
				writeSnapshotJson(io, stateAction, snapshot);
			} else {
				io.stdout(JSON.stringify(snapshot));
			}
			return 0;
		}

		const snapshot = loadSessionState(projectRoot, sessionId);
		if (!snapshot) {
			if (parsed.json) {
				writeSnapshotError(
					io,
					stateAction,
					sessionId,
					`state show: no hydrated state for ${sessionId}. Run ` +
						"`afol hydrate -S <session>` first.",
				);
				return 1;
			}
			io.stderr(
				`state show: no hydrated state for ${sessionId}. Run ` +
					"`afol hydrate -S <session>` first.",
			);
			return 1;
		}
		if (parsed.json) {
			writeSnapshotJson(
				io,
				stateAction,
				snapshot,
				isStale(projectRoot, sessionId),
			);
		} else {
			io.stdout(formatSnapshot(snapshot, isStale(projectRoot, sessionId)));
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
