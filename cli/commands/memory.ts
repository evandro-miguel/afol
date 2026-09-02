import {
	defaultOperationContext,
	type OperationContext,
	requiresApproval,
} from "../core/operation-context";
import {
	addEntry,
	archiveEntry,
	getEntry,
	type MemoryRecallEntry,
	promoteEntry,
	proposeEntry,
	readMemory,
	recallEntries,
	rejectEntry,
	renderMemory,
	searchEntries,
	updateEntry,
} from "../services/memory/crud";
import type { MemoryEntry } from "../services/memory/types";
import { type CommandIo, createJsonWriters, DEFAULT_IO } from "./io";

const jsonOutput = createJsonWriters("memory");

type MemoryAction =
	| "list"
	| "show"
	| "add"
	| "update"
	| "archive"
	| "search"
	| "propose"
	| "promote"
	| "reject"
	| "render"
	| "recall";

type ParsedArgs = {
	action: MemoryAction;
	json: boolean;
	id: string;
	title: string;
	body: string;
	tags: string[];
	query: string;
	reason: string;
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
	if (value === "propose") {
		return "propose";
	}
	if (value === "promote") {
		return "promote";
	}
	if (value === "reject") {
		return "reject";
	}
	if (value === "render") {
		return "render";
	}
	if (value === "recall") {
		return "recall";
	}
	throw new Error(`Unknown memory action: ${value}`);
}

function splitCsv(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
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
		reason: "",
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
		if (value === "--reason") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason.");
			}
			parsed.reason = next;
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
	]
		.filter((line) => line.length > 0)
		.join("\n");
}

function formatRecallEntry(entry: MemoryRecallEntry): string {
	return [
		`${entry.id} ${entry.status} ${entry.title}`,
		entry.tags.length > 0 ? `tags: ${entry.tags.join(", ")}` : "tags: none",
	].join("\n");
}

function currentTime(): string {
	return new Date().toISOString();
}

function isMutation(action: MemoryAction): boolean {
	return ["add", "update", "archive", "propose", "promote", "reject"].includes(
		action,
	);
}

function assertMutationAllowed(
	action: MemoryAction,
	ctx: OperationContext,
): void {
	if (isMutation(action) && requiresApproval(ctx)) {
		throw new Error(`memory ${action} requires local interactive approval`);
	}
}

export async function runMemoryCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
	ctx: OperationContext = defaultOperationContext(),
): Promise<number> {
	const wantsJson = args.some((value) => value === "--json" || value === "-j");
	try {
		const parsed = parseMemoryArgs(action, args);
		assertMutationAllowed(parsed.action, ctx);

		if (parsed.action === "list") {
			const memory = readMemory(projectRoot);
			const entries = memory?.entries ?? [];
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entries }, ["entries"]);
			} else {
				const lines = [`memory entries: ${entries.length}`];
				if (entries.length === 0) {
					lines.push("path: .afol/memory/memory.md");
					lines.push(
						"hint: use afol memory add --id <id> --title <title> --body <text>",
					);
				} else {
					lines.push(...entries.map(formatEntry));
				}
				io.stdout(lines.join("\n"));
			}
			return 0;
		}

		if (parsed.action === "show") {
			if (!parsed.id) {
				throw new Error("Missing --id for memory show.");
			}
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						parsed.action,
						"memory.entry.not_found",
						`Memory entry not found: ${parsed.id}`,
						1,
					);
				} else {
					io.stderr(`Memory entry not found: ${parsed.id}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
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
				jsonOutput.ok(io, parsed.action, { entries }, ["entries"]);
			} else {
				io.stdout(
					[
						`memory matches: ${entries.length}`,
						...entries.map(formatEntry),
					].join("\n"),
				);
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
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
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
				if (parsed.json) {
					jsonOutput.err(
						io,
						parsed.action,
						"memory.entry.not_found",
						`Memory entry not found: ${parsed.id}`,
						1,
					);
				} else {
					io.stderr(`Memory entry not found: ${parsed.id}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
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
				if (parsed.json) {
					jsonOutput.err(
						io,
						parsed.action,
						"memory.entry.not_found",
						`Memory entry not found: ${parsed.id}`,
						1,
					);
				} else {
					io.stderr(`Memory entry not found: ${parsed.id}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
			} else {
				io.stdout(`memory archive: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "propose") {
			if (!parsed.id || !parsed.title || !parsed.body) {
				throw new Error("Missing --id, --title, or --body for memory propose.");
			}
			const now = currentTime();
			const entry: MemoryEntry = {
				id: parsed.id,
				title: parsed.title,
				body: parsed.body,
				status: "proposed",
				created_at: now,
				updated_at: now,
				tags: parsed.tags,
			};
			proposeEntry(projectRoot, entry);
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
			} else {
				io.stdout(`memory propose: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "promote") {
			if (!parsed.id) {
				throw new Error("Missing --id for memory promote.");
			}
			promoteEntry(projectRoot, parsed.id);
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						parsed.action,
						"memory.entry.not_found",
						`Memory entry not found: ${parsed.id}`,
						1,
					);
				} else {
					io.stderr(`Memory entry not found: ${parsed.id}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
			} else {
				io.stdout(`memory promote: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "reject") {
			if (!parsed.id || !parsed.reason) {
				throw new Error("Missing --id or --reason for memory reject.");
			}
			rejectEntry(projectRoot, parsed.id, parsed.reason);
			const entry = getEntry(projectRoot, parsed.id);
			if (!entry) {
				if (parsed.json) {
					jsonOutput.err(
						io,
						parsed.action,
						"memory.entry.not_found",
						`Memory entry not found: ${parsed.id}`,
						1,
					);
				} else {
					io.stderr(`Memory entry not found: ${parsed.id}`);
				}
				return 1;
			}
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entry }, ["entry"]);
			} else {
				io.stdout(`memory reject: ${entry.id}`);
			}
			return 0;
		}

		if (parsed.action === "render") {
			const markdown = renderMemory(projectRoot);
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { markdown }, ["markdown"]);
			} else {
				io.stdout(markdown);
			}
			return 0;
		}

		if (parsed.action === "recall") {
			const query = parsed.query.trim();
			if (!query) {
				throw new Error("Missing --query for memory recall.");
			}
			const entries = recallEntries(projectRoot, query);
			if (parsed.json) {
				jsonOutput.ok(io, parsed.action, { entries }, ["entries"]);
			} else {
				io.stdout(
					[
						`memory recall: ${entries.length}`,
						...entries.map(formatRecallEntry),
					].join("\n"),
				);
			}
			return 0;
		}

		throw new Error(`Unknown memory action: ${parsed.action}`);
	} catch (error) {
		if (wantsJson && error instanceof Error && error.message) {
			jsonOutput.err(io, action, "memory.command.error", error.message, 2);
			return 2;
		}
		io.stderr((error as Error).message);
		return 2;
	}
}
