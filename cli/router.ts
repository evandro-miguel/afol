import { kernelRegistry } from "./registry";

export type CommandResolution =
	| { kind: "help" }
	| { kind: "status"; args: string[] }
	| { kind: "validate"; args: string[] }
	| { kind: "init"; args: string[] }
	| { kind: "bootstrap"; args: string[] }
	| { kind: "new"; args: string[] }
	| { kind: "start"; args: string[] }
	| { kind: "evidence"; args: string[] }
	| { kind: "done"; args: string[] }
	| { kind: "close"; args: string[] }
	| { kind: "log"; args: string[] }
	| { kind: "verifyTasks"; args: string[] }
	| { kind: "rule"; args: string[] }
	| { kind: "skill"; args: string[] }
	| { kind: "update"; args: string[] }
	| { kind: "file"; args: string[] }
	| { kind: "localState"; args: string[] }
	| { kind: "unknown"; message: string; exitCode: number };

function removeJsonAliases(values: string[]): string[] {
	return values.filter((value) => !kernelRegistry.isJsonAlias(value));
}

function normalizeStatusInvocation(values: string[]): string[] {
	if (values.length === 0) {
		return [];
	}
	const first = values[0] as string;
	if (!first || kernelRegistry.canonicalize(first) !== "status") {
		return values;
	}
	const rest = values.slice(1);
	const hasJson = rest.some((value) => kernelRegistry.isJsonAlias(value));
	return ["status", ...removeJsonAliases(rest), ...(hasJson ? ["--json"] : [])];
}

function normalizeArguments(values: string[]): string[] {
	if (values.length === 0) {
		return ["status"];
	}

	const first = values[0] as string;
	if (first && kernelRegistry.isHelpAlias(first) && values.length === 1) {
		return ["--help"];
	}

	if (kernelRegistry.canonicalize(first) === "status") {
		return normalizeStatusInvocation(values);
	}

	if (kernelRegistry.isJsonAlias(first)) {
		if (values.length === 1) {
			return ["status", "--json"];
		}
		const second = values[1];
		if (second && kernelRegistry.canonicalize(second) === "status") {
			return ["status", ...removeJsonAliases(values.slice(2)), "--json"];
		}
	}

	return [kernelRegistry.canonicalize(first), ...values.slice(1)];
}

function normalizeTokenOptimizedFlags(values: string[]): string[] {
	const normalized: string[] = [];
	for (const value of values) {
		if (value === "-S") {
			normalized.push("--session");
			continue;
		}
		if (value === "-T") {
			normalized.push("--task-id");
			continue;
		}
		if (value === "-x") {
			normalized.push("--test");
			continue;
		}
		normalized.push(value);
	}
	return normalized;
}

function suggestionFor(command: string): string | null {
	const normalizedInput = command.toLowerCase();
	for (const candidate of kernelRegistry.knownCanonicalCommands()) {
		const normalizedCandidate = candidate.toLowerCase();
		if (
			normalizedCandidate.startsWith(normalizedInput) ||
			normalizedInput.startsWith(normalizedCandidate)
		) {
			return candidate;
		}
	}
	for (const candidate of kernelRegistry.knownTokens()) {
		const normalizedCandidate = candidate.toLowerCase();
		if (
			normalizedCandidate.startsWith(normalizedInput) ||
			normalizedInput.startsWith(normalizedCandidate)
		) {
			return kernelRegistry.canonicalize(candidate);
		}
	}
	return null;
}

function formatUnknownCommandHint(command: string): string {
	const suggestion = suggestionFor(command);
	if (suggestion) {
		return `err unknown-command command=${command} hint="run afol -h" did_you_mean=${suggestion}`;
	}
	return `err unknown-command command=${command} hint="run afol -h"`;
}

export function resolveCommand(args: string[]): CommandResolution {
	const firstArg = args[0];
	if (args.length === 1 && firstArg && kernelRegistry.isHelpAlias(firstArg)) {
		return { kind: "help" };
	}

	const normalized = normalizeArguments(args);
	const [topLevel, ...rest] = normalized;

	if (!topLevel) {
		return { kind: "status", args: ["status"] };
	}

	if (topLevel === "--help") {
		return { kind: "help" };
	}

	const topLevelKind = kernelRegistry.resolveKind(topLevel);
	if (topLevelKind === "validate") {
		return { kind: "validate", args: rest };
	}

	if (topLevelKind === "init") {
		return { kind: "init", args: rest };
	}

	if (topLevelKind === "status") {
		return { kind: "status", args: normalizeStatusInvocation(normalized) };
	}

	if (topLevelKind === "bootstrap") {
		return { kind: "bootstrap", args: rest };
	}

	if (topLevelKind === "new") {
		return { kind: "new", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "start") {
		return { kind: "start", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "evidence") {
		return { kind: "evidence", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "done") {
		return { kind: "done", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "close") {
		return { kind: "close", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "log") {
		return { kind: "log", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "verifyTasks") {
		return { kind: "verifyTasks", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "rule") {
		return { kind: "rule", args: rest };
	}

	if (topLevelKind === "skill") {
		return { kind: "skill", args: rest };
	}

	if (topLevelKind === "update") {
		return { kind: "update", args: rest };
	}

	if (topLevelKind === "file") {
		return { kind: "file", args: normalizeTokenOptimizedFlags(rest) };
	}

	if (topLevelKind === "localState") {
		return { kind: "localState", args: rest };
	}

	if (topLevel.startsWith("-")) {
		return {
			kind: "unknown",
			message: `err unknown-flag flag=${topLevel} hint="run afol -h"`,
			exitCode: 2,
		};
	}

	return {
		kind: "unknown",
		message: formatUnknownCommandHint(topLevel),
		exitCode: 2,
	};
}
