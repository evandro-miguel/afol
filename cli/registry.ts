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
	| "adm"
	| "spec"
	| "adr"
	| "changelog"
	| "health"
	| "db"
	| "doctor"
	| "maintenance"
	| "sweep"
	| "schema"
	| "catchup"
	| "adapter"
	| "session";
export type CommandSideEffect = "read" | "write" | "append" | "generated";

export type CommandCategory = "core" | "workflow" | "inspect" | "ops";

export type CommandSpec = {
	command: string;
	aliases: readonly string[];
	kind: CommandKind;
	sideEffect: CommandSideEffect;
	description: string;
	category?: CommandCategory;
};

const COMMAND_SPECS: readonly CommandSpec[] = Object.freeze([
	{
		command: "status",
		aliases: ["s"],
		kind: "status",
		sideEffect: "read",
		description: "Show current project status",
		category: "core",
	},
	{
		command: "validate",
		aliases: ["v", "ck", "check"],
		kind: "validate",
		sideEffect: "read",
		description: "Run validation gates",
		category: "core",
	},
	{
		command: "init",
		aliases: [],
		kind: "init",
		sideEffect: "write",
		description: "Install the scaffold",
		category: "core",
	},
	{
		command: "start",
		aliases: ["st"],
		kind: "start",
		sideEffect: "write",
		description: "Start a workbench task",
		category: "workflow",
	},
	{
		command: "done",
		aliases: ["d"],
		kind: "done",
		sideEffect: "write",
		description: "Complete a task session",
		category: "workflow",
	},
	{
		command: "new",
		aliases: ["n"],
		kind: "new",
		sideEffect: "write",
		description: "Create a workbench session",
		category: "core",
	},
	{
		command: "log",
		aliases: ["l"],
		kind: "log",
		sideEffect: "append",
		description: "Append a session log entry",
		category: "workflow",
	},
	{
		command: "evidence",
		aliases: ["e"],
		kind: "evidence",
		sideEffect: "append",
		description: "Record task evidence",
		category: "workflow",
	},
	{
		command: "rule",
		aliases: ["r"],
		kind: "rule",
		sideEffect: "read",
		description: "Inspect rules",
		category: "inspect",
	},
	{
		command: "skill",
		aliases: ["sk"],
		kind: "skill",
		sideEffect: "read",
		description: "Inspect skills",
		category: "inspect",
	},
	{
		command: "close",
		aliases: ["c"],
		kind: "close",
		sideEffect: "write",
		description: "Close the active session",
		category: "workflow",
	},
	{
		command: "file",
		aliases: ["f"],
		kind: "file",
		sideEffect: "write",
		description: "Inspect files",
		category: "inspect",
	},
	{
		command: "update",
		aliases: ["up"],
		kind: "update",
		sideEffect: "write",
		description: "Run scaffold updates",
		category: "ops",
	},
	{
		command: "bootstrap",
		aliases: ["b"],
		kind: "bootstrap",
		sideEffect: "write",
		description: "Install scaffold into another repo",
		category: "workflow",
	},
	{
		command: "verify",
		aliases: ["vf"],
		kind: "verifyTasks",
		sideEffect: "read",
		description: "Verify workbench tasks",
		category: "workflow",
	},
	{
		command: "verify-tasks",
		aliases: [],
		kind: "verifyTasks",
		sideEffect: "read",
		description: "Verify workbench tasks",
		category: "workflow",
	},
	{
		command: "local-state",
		aliases: ["ls"],
		kind: "localState",
		sideEffect: "generated",
		description: "Inspect local project indexes",
		category: "inspect",
	},
	{
		command: "pstr",
		aliases: ["ps"],
		kind: "pstr",
		sideEffect: "read",
		description: "Inspect structure maps",
		category: "inspect",
	},
	{
		command: "ctx",
		aliases: ["cx"],
		kind: "ctx",
		sideEffect: "read",
		description: "Inspect context bundles",
		category: "inspect",
	},
	{
		command: "state",
		aliases: [],
		kind: "state",
		sideEffect: "read",
		description: "Inspect state snapshot",
		category: "inspect",
	},
	{
		command: "hydrate",
		aliases: [],
		kind: "hydrate",
		sideEffect: "generated",
		description: "Generate hydrated project state",
		category: "inspect",
	},
	{
		command: "render",
		aliases: [],
		kind: "render",
		sideEffect: "generated",
		description: "Render project artifacts",
		category: "inspect",
	},
	{
		command: "library",
		aliases: ["lb"],
		kind: "library",
		sideEffect: "read",
		description: "Inspect library entries",
		category: "inspect",
	},
	{
		command: "memory",
		aliases: ["mm"],
		kind: "memory",
		sideEffect: "read",
		description: "Inspect memory entries",
		category: "inspect",
	},
	{
		command: "adm",
		aliases: [],
		kind: "adm",
		sideEffect: "read",
		description: "Inspect adm paths and files",
		category: "inspect",
	},
	{
		command: "spec",
		aliases: [],
		kind: "spec",
		sideEffect: "read",
		description: "Inspect specs",
		category: "inspect",
	},
	{
		command: "adr",
		aliases: [],
		kind: "adr",
		sideEffect: "read",
		description: "Inspect ADRs",
		category: "inspect",
	},
	{
		command: "changelog",
		aliases: [],
		kind: "changelog",
		sideEffect: "read",
		description: "Inspect changelog entries",
		category: "inspect",
	},
	{
		command: "health",
		aliases: ["ht"],
		kind: "health",
		sideEffect: "read",
		description: "Inspect health checks",
		category: "ops",
	},
	{
		command: "db",
		aliases: [],
		kind: "db",
		sideEffect: "read",
		description: "Inspect database state",
		category: "ops",
	},
	{
		command: "doctor",
		aliases: [],
		kind: "doctor",
		sideEffect: "read",
		description: "Inspect doctor checks",
		category: "ops",
	},
	{
		command: "maintenance",
		aliases: [],
		kind: "maintenance",
		sideEffect: "read",
		description: "Run maintenance checks",
		category: "ops",
	},
	{
		command: "sweep",
		aliases: [],
		kind: "sweep",
		sideEffect: "read",
		description: "Run repository sweep checks",
		category: "ops",
	},
	{
		command: "schema",
		aliases: [],
		kind: "schema",
		sideEffect: "read",
		description: "Inspect schema state",
		category: "ops",
	},
	{
		command: "catchup",
		aliases: [],
		kind: "catchup",
		sideEffect: "read",
		description:
			"Compare active session artifacts against git state and report unsynced context",
		category: "inspect",
	},
	{
		command: "adapter",
		aliases: [],
		kind: "adapter",
		sideEffect: "write",
		description: "Enable or disable runtime adapters",
		category: "ops",
	},
	{
		command: "session",
		aliases: [],
		kind: "session",
		sideEffect: "write",
		description: "List, bind, switch, and unbind workbench sessions",
		category: "workflow",
	},
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
