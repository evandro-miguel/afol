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
	expectedBeforeHash: string | undefined;
	expectedDestinationHash: string | undefined;
	expectedDestinationExists: boolean | undefined;
};

function readFlagValue(
	values: string[],
	index: number,
	flag: string,
): [string, number] {
	const next = values[index + 1];
	if (!next) {
		throw new Error(`Missing value for ${flag}`);
	}
	return [next, index + 1];
}

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
	let expectedBeforeHash: string | undefined;
	let expectedDestinationHash: string | undefined;
	let expectedDestinationExists: boolean | undefined;

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (!value) {
			continue;
		}
		switch (value) {
			case "--expected-before-hash": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				expectedBeforeHash = next;
				index = nextIndex;
				break;
			}
			case "--expected-destination-hash": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				expectedDestinationHash = next;
				index = nextIndex;
				break;
			}
			case "--expected-destination-exists": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				if (next !== "true" && next !== "false")
					throw new Error(`${value} requires true or false`);
				expectedDestinationExists = next === "true";
				index = nextIndex;
				break;
			}
			case "--dry-run":
				dryRun = true;
				break;
			case "--json":
			case "-j":
				json = true;
				break;
			case "--session": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				session = next;
				index = nextIndex;
				break;
			}
			case "--task-id": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				taskId = next;
				index = nextIndex;
				break;
			}
			case "--reason": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				reason = next;
				index = nextIndex;
				break;
			}
			case "--path": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				pathArg = next;
				index = nextIndex;
				break;
			}
			case "--to": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				destinationArg = next;
				index = nextIndex;
				break;
			}
			case "--id": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				mutationId = next;
				index = nextIndex;
				break;
			}
			case "--append": {
				const [next, nextIndex] = readFlagValue(values, index, value);
				appendText = `${appendText ?? ""}${next}`;
				index = nextIndex;
				break;
			}
			default:
				if (value.startsWith("-")) {
					throw new Error(`Unknown file argument ${value}`);
				}
				positional.push(value);
		}
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
		expectedBeforeHash,
		expectedDestinationHash,
		expectedDestinationExists,
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
		expectedBeforeHash: parsed.expectedBeforeHash,
		expectedDestinationHash: parsed.expectedDestinationHash,
		expectedDestinationExists: parsed.expectedDestinationExists,
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
		expectedBeforeHash: parsed.expectedBeforeHash,
		expectedDestinationHash: parsed.expectedDestinationHash,
		expectedDestinationExists: parsed.expectedDestinationExists,
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
		expectedBeforeHash: parsed.expectedBeforeHash,
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
		expectedBeforeHash: parsed.expectedBeforeHash,
	};
}
