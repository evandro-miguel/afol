import {
	addChangelogEntry,
	type ChangelogEntryType,
} from "../services/spec-gate/changelog";
import { type CommandIo, DEFAULT_IO, writeLegacyJsonEnvelope } from "./io";

function parseArgs(args: string[]): {
	type: ChangelogEntryType;
	message: string;
} {
	let type = "";
	let message = "";
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		if (value === "--json" || value === "-j") {
			continue;
		}
		if (value === "--type") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --type in changelog add.");
			}
			type = next;
			index += 1;
			continue;
		}
		if (value === "--message") {
			const next = args[index + 1];
			if (!next) {
				throw new Error("Missing value for --message in changelog add.");
			}
			message = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown changelog argument: ${value}`);
	}
	if (
		type !== "decision" &&
		type !== "behavior" &&
		type !== "breaking" &&
		type !== "fix"
	) {
		throw new Error("Missing or invalid --type for changelog add.");
	}
	if (!message.trim()) {
		throw new Error("Missing --message for changelog add.");
	}
	return { type, message };
}

function writeJsonEnvelope(io: CommandIo, data: Record<string, unknown>): void {
	writeLegacyJsonEnvelope(io, String(data.action ?? "add"), data);
}

export async function runChangelogCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		if (action !== "add" && action !== "a") {
			throw new Error(`Unknown changelog action: ${action}`);
		}
		const json = args.some((value) => value === "--json" || value === "-j");
		const parsed = parseArgs(args);
		const path = addChangelogEntry(projectRoot, parsed.type, parsed.message);
		if (json) {
			writeJsonEnvelope(io, { action: "add", path });
		} else {
			io.stdout(`changelog add: ${path}`);
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
