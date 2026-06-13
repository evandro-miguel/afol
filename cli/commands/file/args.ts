import {
	type CommandArgs,
	DEFAULT_MOVE_DESTINATION,
	DEFAULT_MOVE_SOURCE,
	DEFAULT_PATCH_PATH,
	type MoveArgs,
	type PatchArgs,
	type UndoArgs,
} from "./shared";

type ParsedArgs = {
	dryRun: boolean;
	json: boolean;
	session: string;
	taskId: string;
	reason: string;
	positional: string[];
	pathArg: string | undefined;
	destinationArg: string | undefined;
	mutationId: string | undefined;
	appendText: string | undefined;
};

function parseGenericArgs(values: string[]): ParsedArgs {
	let dryRun = false;
	let json = false;
	let session = "";
	let taskId = "";
	let reason = "";
	const positional: string[] = [];
	let pathArg: string | undefined;
	let destinationArg: string | undefined;
	let mutationId: string | undefined;
	let appendText: string | undefined;

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!value) {
			continue;
		}
		if (value === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (value === "--json" || value === "-j") {
			json = true;
			continue;
		}
		if (value === "--session") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --session");
			}
			session = next;
			index += 1;
			continue;
		}
		if (value === "--task-id") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --task-id");
			}
			taskId = next;
			index += 1;
			continue;
		}
		if (value === "--reason") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --reason");
			}
			reason = next;
			index += 1;
			continue;
		}
		if (value === "--path") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --path");
			}
			pathArg = next;
			index += 1;
			continue;
		}
		if (value === "--to") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --to");
			}
			destinationArg = next;
			index += 1;
			continue;
		}
		if (value === "--id") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --id");
			}
			mutationId = next;
			index += 1;
			continue;
		}
		if (value === "--append") {
			const next = values[index + 1];
			if (!next) {
				throw new Error("Missing value for --append");
			}
			appendText = `${appendText ?? ""}${next}`;
			index += 1;
			continue;
		}
		if (value.startsWith("-")) {
			throw new Error(`Unknown file argument ${value}`);
		}
		positional.push(value);
	}

	return {
		dryRun,
		json,
		session,
		taskId,
		reason,
		positional,
		pathArg: pathArg,
		destinationArg: destinationArg,
		mutationId: mutationId,
		appendText: appendText,
	};
}

export function parsePatchArgs(values: string[]): PatchArgs {
	const parsed = parseGenericArgs(values);
	const firstPath = parsed.positional[0];
	const path = parsed.pathArg ?? firstPath ?? DEFAULT_PATCH_PATH;
	const fallbackAppend = parsed.pathArg
		? parsed.positional.join(" ")
		: parsed.positional.slice(1).join(" ");

	return {
		command: "pt",
		path,
		appendText: parsed.appendText ?? fallbackAppend,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

export function parseMoveArgs(values: string[]): MoveArgs {
	const parsed = parseGenericArgs(values);
	const path = parsed.pathArg ?? parsed.positional[0] ?? DEFAULT_MOVE_SOURCE;
	const destination =
		parsed.destinationArg ??
		(parsed.pathArg ? parsed.positional[0] : parsed.positional[1]) ??
		DEFAULT_MOVE_DESTINATION;

	return {
		command: "mv",
		path,
		destinationPath: destination,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

export function parseUndoArgs(values: string[]): UndoArgs {
	const parsed = parseGenericArgs(values);
	const mutationId = parsed.mutationId ?? parsed.positional[0];
	return {
		command: "ud",
		path: "",
		mutationId,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}

export function parseArchiveArgs(values: string[]): CommandArgs {
	const parsed = parseGenericArgs(values);
	const path = parsed.pathArg ?? parsed.positional[0] ?? DEFAULT_PATCH_PATH;
	return {
		command: "ar",
		path,
		dryRun: parsed.dryRun,
		json: parsed.json,
		session: parsed.session,
		taskId: parsed.taskId,
		reason: parsed.reason,
	};
}
