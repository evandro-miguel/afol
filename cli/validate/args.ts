import { type PackId, REQUIRED_PACKS, type ValidationScope } from "./types";

export interface ParsedValidationArgs {
	mode: "run" | "select" | "bench";
	scope: ValidationScope;
	changedPaths: string[];
	explicitPacks: PackId[];
	save: boolean;
	outputPath?: string;
}

export type ValidateInvocation =
	| {
			kind: "project";
			args: string[];
	  }
	| {
			kind: "benchmark";
			args: string[];
	  };

export function resolveValidateInvocation(args: string[]): ValidateInvocation {
	const explicitProject = args[0] === "project" || args.includes("--project");
	if (explicitProject) {
		return {
			kind: "project",
			args: args.filter((arg) => arg !== "project" && arg !== "--project"),
		};
	}

	const modeArg = args[0];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		return {
			kind: "benchmark",
			args,
		};
	}

	return {
		kind: "project",
		args,
	};
}

function consumeValidationArg(
	state: ParsedValidationArgs,
	token: string,
	nextArg: string | undefined,
): number | undefined {
	switch (token) {
		case "--changed-path":
			if (!nextArg) {
				throw new Error("Missing value for --changed-path");
			}
			state.changedPaths.push(nextArg);
			return 2;
		case "--pack":
			if (!nextArg) {
				throw new Error("Missing value for --pack");
			}
			if (!REQUIRED_PACKS.includes(nextArg as PackId)) {
				throw new Error(`Unknown --pack value: ${nextArg}`);
			}
			state.explicitPacks.push(nextArg as PackId);
			return 2;
		case "--save":
			state.save = true;
			return 1;
		case "--output":
			if (!nextArg) {
				throw new Error("Missing value for --output");
			}
			state.outputPath = nextArg;
			return 2;
		default:
			return undefined;
	}
}

export function parseValidationArgs(args: string[]): ParsedValidationArgs {
	const parsed: ParsedValidationArgs = {
		mode: "run",
		scope: "default",
		changedPaths: [],
		explicitPacks: [],
		save: false,
	};

	let index = 0;
	const modeArg = args[index];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		parsed.mode = modeArg;
		index += 1;
	}
	if (parsed.mode !== "bench") {
		const scopeArg = args[index];
		if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
			parsed.scope = scopeArg;
			index += 1;
		}
	}

	while (index < args.length) {
		const token = args[index];
		if (token === undefined) {
			break;
		}
		const nextArg = args[index + 1];
		const consumed = consumeValidationArg(parsed, token, nextArg);
		if (consumed !== undefined) {
			index += consumed;
			continue;
		}
		if (token === "--json") {
			index += 1;
			continue;
		}
		throw new Error(`Unknown validation argument: ${token}`);
	}

	return parsed;
}
