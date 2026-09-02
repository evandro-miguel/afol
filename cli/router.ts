import { normalizeScopedFlags, normalizeSubcommandAction } from "./aliases";
import { kernelRegistry } from "./registry";

export type CommandResolution =
	| { kind: "help" }
	| { kind: "status"; args: string[] }
	| { kind: "feedback"; args: string[] }
	| { kind: "validate"; args: string[] }
	| { kind: "init"; args: string[] }
	| { kind: "bootstrap"; args: string[] }
	| { kind: "new"; args: string[] }
	| { kind: "start"; args: string[] }
	| { kind: "evidence"; args: string[] }
	| { kind: "legacy"; args: string[] }
	| { kind: "done"; args: string[] }
	| { kind: "transition"; args: string[] }
	| { kind: "close"; args: string[] }
	| { kind: "log"; args: string[] }
	| { kind: "quickTask"; args: string[] }
	| { kind: "verifyTasks"; args: string[] }
	| { kind: "hook"; args: string[] }
	| { kind: "rule"; args: string[] }
	| { kind: "skill"; args: string[] }
	| { kind: "fleet"; args: string[] }
	| { kind: "update"; args: string[] }
	| { kind: "file"; args: string[] }
	| { kind: "localState"; args: string[] }
	| { kind: "catchup"; args: string[] }
	| { kind: "preflight"; args: string[] }
	| SubCommandResolution
	| { kind: "unknown"; message: string; exitCode: number };

export type SubCommandResolution = {
	kind: "subcommand";
	group: string;
	action: string;
	args: string[];
};

export const ROUTED_SUBCOMMAND_GROUPS = Object.freeze([
	"pstr",
	"ctx",
	"state",
	"hydrate",
	"library",
	"memory",
	"evolve",
	"adm",
	"governance",
	"spec",
	"ux",
	"adr",
	"changelog",
	"health",
	"db",
	"doctor",
	"maintenance",
	"sweep",
	"schema",
	"bench",
	"projectBenchmark",
	"adapter",
	"telemetry",
	"receipt",
	"session",
]);

const SUBCOMMAND_GROUPS = new Set(ROUTED_SUBCOMMAND_GROUPS);

function normalizeActionAndArgs(
	scope: string,
	args: readonly string[],
): { action: string; args: string[] } {
	const [rawAction, ...rest] = args;
	if (!rawAction || rawAction.startsWith("-")) {
		return {
			action: "",
			args: normalizeScopedFlags(scope, args),
		};
	}
	return {
		action: normalizeSubcommandAction(scope, rawAction),
		args: normalizeScopedFlags(scope, rest),
	};
}

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

function maybeCompactCtxAliasArgs(
	originalTopLevel: string | undefined,
	action: string,
	args: string[],
): string[] {
	if (originalTopLevel !== "cx" || action !== "bundle") {
		return args;
	}
	return args.includes("--mode") ? args : [...args, "--mode", "compact"];
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

type RouteInput = {
	firstArg: string | undefined;
	topLevel: string;
	topLevelKind: string;
	rest: string[];
	normalized: string[];
};

type KindRoute = (input: RouteInput) => CommandResolution;

function actionScopedArgs(scope: string, rest: string[]): string[] {
	const normalizedAction = normalizeActionAndArgs(scope, rest);
	return normalizedAction.action
		? [normalizedAction.action, ...normalizedAction.args]
		: normalizedAction.args;
}

/** Direct-kind routes keyed by canonical command kind; first match wins. */
const KIND_ROUTES: Record<string, KindRoute> = Object.freeze({
	status: ({ normalized }) => ({
		kind: "status",
		args: normalizeStatusInvocation(normalized),
	}),
	validate: ({ rest }) => ({ kind: "validate", args: rest }),
	init: ({ rest }) => ({ kind: "init", args: rest }),
	feedback: ({ rest }) => ({ kind: "feedback", args: rest }),
	bootstrap: ({ rest }) => ({ kind: "bootstrap", args: rest }),
	new: ({ rest }) => ({ kind: "new", args: normalizeScopedFlags("new", rest) }),
	start: ({ firstArg, rest }) => {
		const startArgs = normalizeScopedFlags("start", rest);
		return {
			kind: "start",
			args: firstArg === "st" ? ["--compact", ...startArgs] : startArgs,
		};
	},
	evidence: ({ rest }) => ({
		kind: "evidence",
		args: normalizeScopedFlags("evidence", rest),
	}),
	legacy: ({ rest }) => ({
		kind: "legacy",
		args: normalizeScopedFlags("legacy", rest),
	}),
	done: ({ rest }) => ({
		kind: "done",
		args: normalizeScopedFlags("done", rest),
	}),
	transition: ({ rest }) => ({
		kind: "transition",
		args: normalizeScopedFlags("transition", rest),
	}),
	close: ({ rest }) => ({
		kind: "close",
		args: normalizeScopedFlags("close", rest),
	}),
	log: ({ rest }) => ({ kind: "log", args: normalizeScopedFlags("log", rest) }),
	quickTask: ({ rest }) => ({
		kind: "quickTask",
		args: normalizeScopedFlags("quickTask", rest),
	}),
	verifyTasks: ({ rest }) => ({
		kind: "verifyTasks",
		args: normalizeScopedFlags("verifyTasks", rest),
	}),
	hook: ({ rest }) => ({ kind: "hook", args: rest }),
	rule: ({ rest }) => ({ kind: "rule", args: rest }),
	skill: ({ rest }) => ({ kind: "skill", args: rest }),
	update: ({ rest }) => ({
		kind: "update",
		args: actionScopedArgs("update", rest),
	}),
	file: ({ rest }) => ({ kind: "file", args: actionScopedArgs("file", rest) }),
	fleet: ({ rest }) => ({ kind: "fleet", args: rest }),
	localState: ({ rest }) => ({
		kind: "localState",
		args: actionScopedArgs("localState", rest),
	}),
	catchup: ({ rest }) => ({
		kind: "catchup",
		args: normalizeScopedFlags("catchup", rest),
	}),
	preflight: ({ rest }) => ({ kind: "preflight", args: rest }),
	adm: ({ rest }) => {
		const { action, args } = normalizeActionAndArgs("adm", rest);
		return { kind: "subcommand", group: "adm", action, args };
	},
});

const SUBCOMMAND_ROUTE: KindRoute = ({ firstArg, topLevelKind, rest }) => {
	const { action, args } = normalizeActionAndArgs(topLevelKind, rest);
	return {
		kind: "subcommand",
		group: topLevelKind,
		action,
		args: maybeCompactCtxAliasArgs(firstArg, action, args),
	};
};

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

	if (topLevel === "render" && topLevelKind === "memory") {
		return {
			kind: "subcommand",
			group: "memory",
			action: "render",
			args: normalizeScopedFlags("memory", rest),
		};
	}

	const routeInput: RouteInput = {
		firstArg,
		topLevel,
		topLevelKind: topLevelKind ?? "",
		rest,
		normalized,
	};
	const kindRoute = topLevelKind ? KIND_ROUTES[topLevelKind] : undefined;
	if (kindRoute) {
		return kindRoute(routeInput);
	}

	if (topLevelKind && SUBCOMMAND_GROUPS.has(topLevelKind)) {
		return SUBCOMMAND_ROUTE(routeInput);
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
