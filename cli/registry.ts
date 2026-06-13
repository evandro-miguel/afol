export type CommandKind =
	| "status"
	| "validate"
	| "init"
	| "bootstrap"
	| "new"
	| "start"
	| "evidence"
	| "done"
	| "close"
	| "log"
	| "verifyTasks"
	| "rule"
	| "skill"
	| "update"
	| "file"
	| "localState"
	| "pstr"
	| "ctx"
	| "state"
	| "hydrate"
	| "render"
	| "library"
	| "memory"
	| "spec"
	| "adr"
	| "changelog"
	| "health"
	| "db"
	| "doctor"
	| "maintenance"
	| "sweep"
	| "schema";
export type CommandSideEffect = "read" | "write" | "append" | "generated";

export type CommandSpec = {
	command: string;
	aliases: readonly string[];
	kind: CommandKind;
	sideEffect: CommandSideEffect;
};

const COMMAND_SPECS: readonly CommandSpec[] = Object.freeze([
	{ command: "status", aliases: ["s"], kind: "status", sideEffect: "read" },
	{
		command: "validate",
		aliases: ["v", "ck", "check"],
		kind: "validate",
		sideEffect: "read",
	},
	{ command: "init", aliases: [], kind: "init", sideEffect: "write" },
	{ command: "start", aliases: ["st"], kind: "start", sideEffect: "write" },
	{ command: "done", aliases: ["d"], kind: "done", sideEffect: "write" },
	{ command: "new", aliases: ["n"], kind: "new", sideEffect: "write" },
	{ command: "log", aliases: ["l"], kind: "log", sideEffect: "append" },
	{
		command: "evidence",
		aliases: ["e"],
		kind: "evidence",
		sideEffect: "append",
	},
	{ command: "rule", aliases: ["r"], kind: "rule", sideEffect: "read" },
	{ command: "skill", aliases: ["sk"], kind: "skill", sideEffect: "read" },
	{ command: "close", aliases: ["c"], kind: "close", sideEffect: "write" },
	{ command: "file", aliases: ["f"], kind: "file", sideEffect: "write" },
	{ command: "update", aliases: ["up"], kind: "update", sideEffect: "write" },
	{
		command: "bootstrap",
		aliases: ["b"],
		kind: "bootstrap",
		sideEffect: "write",
	},
	{
		command: "verify",
		aliases: ["vf"],
		kind: "verifyTasks",
		sideEffect: "read",
	},
	{
		command: "verify-tasks",
		aliases: [],
		kind: "verifyTasks",
		sideEffect: "read",
	},
	{
		command: "local-state",
		aliases: ["ls"],
		kind: "localState",
		sideEffect: "generated",
	},
	{ command: "pstr", aliases: ["ps"], kind: "pstr", sideEffect: "read" },
	{ command: "ctx", aliases: ["cx"], kind: "ctx", sideEffect: "read" },
	{ command: "state", aliases: [], kind: "state", sideEffect: "read" },
	{ command: "hydrate", aliases: [], kind: "hydrate", sideEffect: "generated" },
	{ command: "render", aliases: [], kind: "render", sideEffect: "generated" },
	{ command: "library", aliases: ["lb"], kind: "library", sideEffect: "read" },
	{ command: "memory", aliases: ["mm"], kind: "memory", sideEffect: "read" },
	{ command: "spec", aliases: [], kind: "spec", sideEffect: "read" },
	{ command: "adr", aliases: [], kind: "adr", sideEffect: "read" },
	{ command: "changelog", aliases: [], kind: "changelog", sideEffect: "read" },
	{ command: "health", aliases: ["ht"], kind: "health", sideEffect: "read" },
	{ command: "db", aliases: [], kind: "db", sideEffect: "read" },
	{ command: "doctor", aliases: [], kind: "doctor", sideEffect: "read" },
	{
		command: "maintenance",
		aliases: [],
		kind: "maintenance",
		sideEffect: "read",
	},
	{ command: "sweep", aliases: [], kind: "sweep", sideEffect: "read" },
	{ command: "schema", aliases: [], kind: "schema", sideEffect: "read" },
]);

const HELP_ALIASES = Object.freeze(["-h", "--help"] as const);
const JSON_ALIASES = Object.freeze(["-j", "--json"] as const);

const aliasToCommand = new Map<string, string>();
const commandToSpec = new Map<string, CommandSpec>();
const knownTokens = new Set<string>();

for (const spec of COMMAND_SPECS) {
	commandToSpec.set(spec.command, spec);
	aliasToCommand.set(spec.command, spec.command);
	knownTokens.add(spec.command);
	for (const alias of spec.aliases) {
		aliasToCommand.set(alias, spec.command);
		knownTokens.add(alias);
	}
}

function canonicalize(token: string): string {
	return aliasToCommand.get(token) ?? token;
}

export const kernelRegistry = {
	commands: COMMAND_SPECS,
	flags: {
		help: HELP_ALIASES,
		json: JSON_ALIASES,
	},
	canonicalize,
	isHelpAlias(value: string): boolean {
		return HELP_ALIASES.includes(value as (typeof HELP_ALIASES)[number]);
	},
	isJsonAlias(value: string): boolean {
		return JSON_ALIASES.includes(value as (typeof JSON_ALIASES)[number]);
	},
	resolveKind(value: string): CommandKind | null {
		const canonical = canonicalize(value);
		const spec = commandToSpec.get(canonical);
		return spec?.kind ?? null;
	},
	knownCanonicalCommands(): readonly string[] {
		return [...commandToSpec.keys()];
	},
	knownTokens(): readonly string[] {
		return [...knownTokens.values()];
	},
};
