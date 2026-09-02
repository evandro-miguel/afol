import {
	abandonAdr,
	acceptAdr,
	archiveAdr,
	createAdr,
	supersedeAdr,
} from "../services/spec-gate/adr";
import { type CommandIo, DEFAULT_IO, writeLegacyJsonEnvelope } from "./io";

type AdrAction = "new" | "accept" | "supersede" | "abandon" | "archive";

function isJsonArg(value: string): boolean {
	return value === "--json" || value === "-j";
}

function stripJsonArgs(args: string[]): string[] {
	return args.filter((value) => !isJsonArg(value));
}

function normalizeAction(value: string | undefined): AdrAction {
	if (!value || value === "new" || value === "create") {
		return "new";
	}
	if (value === "accept" || value === "ac") {
		return "accept";
	}
	if (value === "supersede" || value === "sp") {
		return "supersede";
	}
	if (value === "abandon" || value === "ab") {
		return "abandon";
	}
	if (value === "archive" || value === "ar") {
		return "archive";
	}
	throw new Error(`Unknown adr action: ${value}`);
}

function parseReason(args: string[], commandName: string): string {
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--reason") {
			const next = args[index + 1];
			if (!next) {
				throw new Error(`Missing value for --reason in ${commandName}.`);
			}
			return next;
		}
	}
	throw new Error(`Missing --reason for ${commandName}.`);
}

function writeJsonEnvelope(io: CommandIo, data: Record<string, unknown>): void {
	writeLegacyJsonEnvelope(io, String(data.action ?? "adr"), data);
}

export async function runAdrCommand(
	action: string,
	args: string[],
	projectRoot: string = process.cwd(),
	io: CommandIo = DEFAULT_IO,
): Promise<number> {
	try {
		const adrAction = normalizeAction(action);
		const json = args.some(isJsonArg);
		const cleanArgs = stripJsonArgs(args);
		if (adrAction === "new") {
			const topic = cleanArgs.join(" ").trim();
			if (!topic) {
				throw new Error("Missing topic for adr new.");
			}
			const path = createAdr(projectRoot, topic);
			if (json) {
				writeJsonEnvelope(io, { action: adrAction, path });
			} else {
				io.stdout(`adr new: ${path}`);
			}
			return 0;
		}
		if (adrAction === "accept") {
			const id = cleanArgs[0];
			if (!id) {
				throw new Error("Missing id for adr accept.");
			}
			const path = acceptAdr(projectRoot, id);
			if (json) {
				writeJsonEnvelope(io, { action: adrAction, path });
			} else {
				io.stdout(`adr accept: ${path}`);
			}
			return 0;
		}
		if (adrAction === "supersede") {
			const oldId = cleanArgs[0];
			const newId = cleanArgs[1];
			if (!oldId || !newId) {
				throw new Error("Missing ids for adr supersede.");
			}
			const path = supersedeAdr(projectRoot, oldId, newId);
			if (json) {
				writeJsonEnvelope(io, { action: adrAction, path });
			} else {
				io.stdout(`adr supersede: ${path}`);
			}
			return 0;
		}
		const id = cleanArgs[0];
		if (!id) {
			throw new Error(`Missing id for adr ${adrAction}.`);
		}
		const reason = parseReason(cleanArgs, `adr ${adrAction}`);
		const path =
			adrAction === "abandon"
				? abandonAdr(projectRoot, id, reason)
				: archiveAdr(projectRoot, id, reason);
		if (json) {
			writeJsonEnvelope(io, { action: adrAction, path });
		} else {
			io.stdout(`adr ${adrAction}: ${path}`);
		}
		return 0;
	} catch (error) {
		io.stderr((error as Error).message);
		return 2;
	}
}
