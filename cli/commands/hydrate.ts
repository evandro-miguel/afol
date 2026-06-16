import {
	envelopeErr,
	envelopeOk,
	envelopeWithLegacyKeys,
	type ResultEnvelope,
	stringifyEnvelope,
} from "../core/envelope";
import { hydrateSession } from "../services/state/session-state";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

type HydrateJsonData = {
	session?: string;
	snapshot?: ReturnType<typeof hydrateSession>;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

function parseHydrateArgs(args: string[]): {
	json: boolean;
	sessionId: string;
} {
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
				throw new Error("Missing value for --session in hydrate.");
			}
			sessionId = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown hydrate argument: ${value}`);
	}
	if (!sessionId) {
		throw new Error("Missing --session for hydrate.");
	}
	return { json, sessionId };
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

function writeHydrateError(
	io: CommandIo,
	sessionId: string,
	message: string,
): void {
	const envelope = envelopeErr("HYDRATE_FAILED", message, {
		action: "hydrate",
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
		try {
			const snapshot = hydrateSession(projectRoot, parsed.sessionId);
			if (parsed.json) {
				writeHydrateJson(io, snapshot);
			} else {
				io.stdout(formatResult(snapshot));
			}
		} catch (error) {
			if (parsed.json) {
				writeHydrateError(io, parsed.sessionId, (error as Error).message);
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
