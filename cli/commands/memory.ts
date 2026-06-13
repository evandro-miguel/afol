import {
	addEntry,
	archiveEntry,
	getEntry,
	readMemory,
	searchEntries,
	updateEntry,
} from "../services/memory";
import type { MemoryEntry } from "../services/memory";

type CommandIo = {
	stdout: (message: string) => void;
	stderr: (message: string) => void;
};

const DEFAULT_IO: CommandIo = {
	stdout: (message) => console.log(message),
	stderr: (message) => console.error(message),
};

type MemoryAction = "list" | "show" | "add" | "update" | "archive" | "search";

type ParsedArgs = {
	action: MemoryAction;
	json: boolean;
	id: string;
	title: string;
	body: string;
	tags: string[];
	query: string;
};

function normalizeAction(value: string | undefined): MemoryAction {
	if (!value || value === "list" || value === "ls") {
		return "list";
	}
	if (value === "show" || value === "get") {
		return "show";
	}
	if (value === "add") {
		return "add";
	}
	if (value === "update" || value === "set") {
		return "update";
	}
	if (value === "archive") {
		return "archive";
	}
	if (value === "search" || value === "find") {
		return "search";
	}
	throw new Error(`Unknown memory action: ${value}`);
}

function splitCsv(value: string): string[] {
	return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMemoryArgs(action: string, args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		action: normalizeAction(action),
		json: false,
		id: "",
		title: "",
		body: "",
		tags: [],
		query: "",
	};
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			parsed.json = true;
			continue;
		}
		if (value === "--id") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --id.");
			}
			parsed.id = next;
			index += 1;
			continue;
		}
		if (value === "--title") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --title.");
			}
			parsed.title = next;
			index += 1;
			continue;
		}
		if (value === "--body") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --body.");
			}
			parsed.body = next;
			index += 1;
			continue;
		}
		if (value === "--tags") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --tags.");
			}
			parsed.tags = splitCsv(next);
			index += 1;
			continue;
		}
		if (value === "--query") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --query.");
			}
			parsed.query = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown memory argument: ${value}`);
	}
	return parsed;
}

function formatEntry(entry: MemoryEntry): string {
	return [
		`${entry.id} ${entry.status} ${entry.title}`,
		entry.tags.length > 0 ? `tags: ${entry.tags.join(", ")}` : "tags: none",
		entry.body,
	].filter((line) => line.length > 0).join("\n");
}

function currentTime(): string {
	return new Date().toISOString();
}

export async function runMemoryCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const parsed = parseMemoryArgs(action, args);

		if (parsed.action === "list") {
			const memory = readMemory(projectRoot);
			const entries = memory?.entries ?? [];
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entries }));
			} else {
				io.stdout([`memory entries: ${entries.length}`, ...entries.map(formatEntry)].join("\n"));
			}
			return 0;
		}

		if (parsed.action === "show") {
			if (!parsed.id) {
				throw new Error("Missing --id for memory show.");
			}
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				io.stderr(`Memory entry not found: ${parsed.id}`);
				return 1;
			}
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entry }));
			} else {
				io.stdout(formatEntry(entry));
			}
			return 0;
		}

		if (parsed.action === "search") {
			const query = parsed.query.trim();
			if (!query) {
				throw new Error("Missing --query for memory search.");
			}
			const entries = searchEntries(projectRoot, query);
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entries }));
			} else {
				io.stdout([`memory matches: ${entries.length}`, ...entries.map(formatEntry)].join("\n"));
			}
			return 0;
		}

		if (parsed.action === "add") {
			if (!parsed.id || !parsed.title || !parsed.body) {
				throw new Error("Missing --id, --title, or --body for memory add.");
			}
			const now = currentTime();
			const entry: MemoryEntry = {
				id: parsed.id,
				title: parsed.title,
				body: parsed.body,
				status: "active",
				created_at: now,
				updated_at: now,
				tags: parsed.tags,
			};
			addEntry(projectRoot, entry);
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entry }));
			} else {
				io.stdout(`memory add: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "update") {
			if (!parsed.id) {
				throw new Error("Missing --id for memory update.");
			}
			updateEntry(projectRoot, parsed.id, {
				...(parsed.title ? { title: parsed.title } : {}),
				...(parsed.body ? { body: parsed.body } : {}),
				...(parsed.tags.length > 0 ? { tags: parsed.tags } : {}),
			});
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				io.stderr(`Memory entry not found: ${parsed.id}`);
				return 1;
			}
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entry }));
			} else {
				io.stdout(`memory update: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "archive") {
			if (!parsed.id) {
				throw new Error("Missing --id for memory archive.");
			}
			archiveEntry(projectRoot, parsed.id);
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				io.stderr(`Memory entry not found: ${parsed.id}`);
				return 1;
			}
			if (parsed.json) {
				io.stdout(JSON.stringify({ ok: true, entry }));
			} else {
				io.stdout(`memory archive: ${entry.id}`);
			}
			return 0;
		}

		throw new Error(`Unknown memory action: ${parsed.action}`);
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
