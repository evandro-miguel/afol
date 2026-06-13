import { hydrateSession } from "../services/state/session-state";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
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
		const snapshot = hydrateSession(projectRoot, parsed.sessionId);
		if (parsed.json) {
			io.stdout(JSON.stringify({ ok: true, action: "hydrate", snapshot }));
		} else {
			io.stdout(formatResult(snapshot));
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
