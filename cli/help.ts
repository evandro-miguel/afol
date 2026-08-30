import {
	type CommandCategory,
	type CommandSpec,
	type CommandSubcommandSpec,
	kernelRegistry,
	requiresApprovalForSideEffect,
} from "./registry";

const CATEGORY_ORDER: readonly CommandCategory[] = [
	"core",
	"workflow",
	"inspect",
	"ops",
];

const HELP_LINE_LIMIT = 120;
const JSON_OUTPUT_BYTE_LIMIT = 16_000;

const CATEGORY_LABELS: Record<CommandCategory, string> = {
	core: "Core",
	workflow: "Workflow",
	inspect: "Inspect",
	ops: "Ops",
};

const COMPACT_DESCRIPTIONS: Record<string, string> = {
	status: "project status",
	feedback: "feedback reports",
	validate: "validation gates",
	init: "install scaffold",
	new: "create session",
	start: "start task",
	done: "complete task",
	log: "append log",
	"quick-task": "one-task lifecycle",
	governance: "spec gaps",
	evidence: "record/admit evidence",
	legacy: "legacy reconcile/close",
	transition: "transition task",
	close: "close session",
	bootstrap: "install elsewhere",
	verify: "verify tasks",
	"verify-tasks": "verify tasks",
	session: "manage sessions",
	rule: "inspect rules",
	skill: "inspect skills",
	"local-state": "inspect indexes",
	pstr: "structure maps",
	ctx: "context bundles",
	state: "state snapshot",
	hydrate: "hydrate state",
	render: "memory render alias",
	library: "inspect library",
	memory: "inspect memory",
	evolve: "evolution status",
	adm: "inspect adm",
	spec: "inspect specs",
	adr: "manage ADRs",
	changelog: "append entries",
	bench: "run benchmarks",
	"project-benchmark": "compare references",
	catchup: "recover context",
	preflight: "plan checks",
	telemetry: "inspect telemetry",
	file: "append/move/archive",
	fleet: "fleet state",
	update: "update scaffold",
	health: "health checks",
	db: "database state",
	doctor: "run doctor",
	maintenance: "maintenance checks",
	sweep: "repo sweep",
	schema: "review schema",
	adapter: "manage adapters",
	receipt: "ingest receipt",
};

export type HelpIntent = "planning" | "execution" | "maintenance";

const HELP_INTENT_COMMANDS: Record<HelpIntent, readonly string[]> = {
	planning: [
		"status",
		"preflight",
		"ctx",
		"pstr",
		"spec",
		"adr",
		"changelog",
		"project-benchmark",
		"library",
		"memory",
		"evolve",
		"rule",
		"skill",
		"hook",
	],
	execution: [
		"new",
		"start",
		"evidence",
		"legacy",
		"done",
		"log",
		"close",
		"quick-task",
		"verify-tasks",
		"file",
		"validate",
		"session",
	],
	maintenance: [
		"health",
		"doctor",
		"maintenance",
		"local-state",
		"validate",
		"bench",
		"sweep",
		"update",
		"schema",
		"telemetry",
	],
};

export function isHelpIntent(value: string): value is HelpIntent {
	return (
		value === "planning" || value === "execution" || value === "maintenance"
	);
}

function formatCommandName(spec: CommandSpec): string {
	const alias = spec.aliases[0];
	return alias ? `${alias}/${spec.command}` : spec.command;
}

function formatEntry(spec: CommandSpec): string {
	return `  ${formatCommandName(spec)}[${spec.sideEffect}] - ${
		COMPACT_DESCRIPTIONS[spec.command] ?? spec.description
	}`;
}

function wrapVerboseLine(prefix: string, content: string): string[] {
	const lines: string[] = [];
	let line = prefix;
	for (const word of content.split(/\s+/)) {
		const separator = line === prefix ? "" : " ";
		if (
			line !== prefix &&
			line.length + separator.length + word.length > HELP_LINE_LIMIT
		) {
			lines.push(line);
			line = `${prefix}${word}`;
			continue;
		}
		line += `${separator}${word}`;
	}
	return [...lines, line];
}

function formatVerboseEntry(spec: CommandSpec): string[] {
	const lines = [
		`  ${spec.command} [${spec.sideEffect}] - ${spec.description}`,
	];
	if (spec.aliases.length > 0)
		lines.splice(1, 0, `    aliases: ${spec.aliases.join(", ")}`);
	if (spec.guidance?.length) {
		lines.push("    guidance:");
		for (const guidance of spec.guidance) {
			lines.push(`      ${guidance}`);
		}
	}
	if (spec.subcommands?.length) {
		lines.push("    subcommands:");
		for (const subcommand of spec.subcommands) {
			lines.push(
				...wrapVerboseLine(
					"      ",
					`${subcommand.usage} [${subcommand.sideEffect}]`,
				),
			);
		}
	}
	return lines;
}

export type CommandCatalogEntry = {
	command: string;
	aliases: string[];
	kind: CommandSpec["kind"];
	sideEffect: CommandSpec["sideEffect"];
	requires_approval: boolean;
	stability: CommandSpec["stability"];
	description: string;
	capabilities?: string[];
	category: CommandCategory | "uncategorized";
	guidance?: readonly string[];
	subcommands?: (CommandSubcommandSpec & { requires_approval: boolean })[];
};

type HelpFormatOptions = {
	verbose?: boolean;
	intent?: HelpIntent;
};

function compactCatalogEntry(entry: CommandCatalogEntry): CommandCatalogEntry {
	return {
		command: entry.command,
		aliases: entry.aliases,
		kind: entry.kind,
		sideEffect: entry.sideEffect,
		requires_approval: entry.requires_approval,
		stability: entry.stability,
		description: entry.description,
		category: entry.category,
	};
}

function filterCommandsByIntent(
	commands: readonly CommandSpec[],
	intent?: HelpIntent,
): readonly CommandSpec[] {
	if (!intent) {
		return commands;
	}
	const allowed = new Set(HELP_INTENT_COMMANDS[intent]);
	return commands.filter((spec) => allowed.has(spec.command));
}

function withApprovalMetadata(spec: CommandSpec): CommandCatalogEntry & {
	subcommands?: (CommandSubcommandSpec & { requires_approval: boolean })[];
} {
	return {
		command: spec.command,
		aliases: [...spec.aliases],
		kind: spec.kind,
		sideEffect: spec.sideEffect,
		requires_approval:
			spec.requires_approval ?? requiresApprovalForSideEffect(spec.sideEffect),
		stability: spec.stability,
		description: spec.description,
		...(spec.capabilities !== undefined
			? { capabilities: [...spec.capabilities] }
			: {}),
		category: spec.category ?? "uncategorized",
		...(spec.guidance !== undefined ? { guidance: [...spec.guidance] } : {}),
		...(spec.subcommands !== undefined
			? {
					subcommands: spec.subcommands.map((entry) => ({
						...entry,
						requires_approval:
							entry.requires_approval ??
							requiresApprovalForSideEffect(entry.sideEffect),
					})),
				}
			: {}),
	};
}

export function buildCommandCatalog(
	registry = kernelRegistry,
	options: { intent?: HelpIntent } = {},
): CommandCatalogEntry[] {
	return filterCommandsByIntent(registry.commands, options.intent).map(
		withApprovalMetadata,
	);
}

export function formatCatalogJson(
	registry = kernelRegistry,
	options: HelpFormatOptions = {},
): string {
	const catalog = buildCommandCatalog(registry, options);
	if (options.verbose === undefined) {
		return `${JSON.stringify(catalog, null, 2)}\n`;
	}
	if (!options.verbose) {
		return `${JSON.stringify(catalog.map(compactCatalogEntry))}\n`;
	}
	const verbose = JSON.stringify(catalog);
	return `${Buffer.byteLength(verbose, "utf8") <= JSON_OUTPUT_BYTE_LIMIT ? verbose : JSON.stringify(catalog.map(compactCatalogEntry))}\n`;
}

export function buildCommandHelpJson(
	commandOrAlias: string,
	registry = kernelRegistry,
): CommandCatalogEntry | null {
	const canonical = registry.canonicalize(commandOrAlias);
	const spec =
		registry.commands.find((entry) => entry.command === canonical) ?? null;
	if (!spec) {
		return null;
	}

	const entry: CommandCatalogEntry = {
		command: spec.command,
		aliases: [...spec.aliases],
		kind: spec.kind,
		sideEffect: spec.sideEffect,
		requires_approval:
			spec.requires_approval ?? requiresApprovalForSideEffect(spec.sideEffect),
		stability: spec.stability,
		description: spec.description,
		category: spec.category ?? "uncategorized",
		...(spec.capabilities !== undefined
			? { capabilities: [...spec.capabilities] }
			: {}),
	};
	if (spec.guidance !== undefined) {
		entry.guidance = [...spec.guidance];
	}
	const subcommands = spec.subcommands?.map((entry) => ({
		...entry,
		requires_approval:
			entry.requires_approval ??
			requiresApprovalForSideEffect(entry.sideEffect),
	}));
	if (subcommands !== undefined) {
		entry.subcommands = subcommands;
	}
	return entry;
}

export function formatCommandHelp(
	commandOrAlias: string,
	registry = kernelRegistry,
): string | null {
	const spec = buildCommandHelpJson(commandOrAlias, registry);
	if (!spec) {
		return null;
	}

	return [
		`Command: ${spec.command}`,
		`Aliases: ${spec.aliases.length > 0 ? spec.aliases.join(", ") : "none"}`,
		`Category: ${spec.category ?? "uncategorized"}`,
		`Stability: ${spec.stability}`,
		`Side effect: ${spec.sideEffect}`,
		`Description: ${spec.description}`,
		...(spec.guidance?.length
			? ["Guidance:", ...spec.guidance.map((entry) => `  ${entry}`)]
			: []),
		...(spec.subcommands?.length
			? [
					"Subcommands:",
					...spec.subcommands.map(
						(entry) =>
							`  ${entry.usage} [${entry.sideEffect}] - ${entry.description}`,
					),
				]
			: []),
	].join("\n");
}

export function formatHelpText(
	registry = kernelRegistry,
	options: HelpFormatOptions = {},
): string {
	const grouped = new Map<CommandCategory | "uncategorized", CommandSpec[]>();
	for (const category of CATEGORY_ORDER) {
		grouped.set(category, []);
	}
	grouped.set("uncategorized", []);

	for (const spec of filterCommandsByIntent(
		registry.commands,
		options.intent,
	)) {
		const bucket = spec.category ?? "uncategorized";
		const entries = grouped.get(bucket) ?? [];
		entries.push(spec);
		grouped.set(bucket, entries);
	}

	const lines = [
		options.intent
			? `Usage: afol help --for ${options.intent}`
			: "Usage: afol [command] [options]",
		"",
		...(options.intent === undefined || options.intent === "execution"
			? [
					"Agent fast path (active session)",
					'  afol st T-01 -> afol d T-01 -x "<check>" -> afol c',
					"",
				]
			: []),
		options.intent ? `Commands for ${options.intent}` : "Commands",
	];
	for (const category of CATEGORY_ORDER) {
		const entries = grouped.get(category);
		if (!entries?.length) {
			continue;
		}

		lines.push(CATEGORY_LABELS[category]);
		for (const entry of entries) {
			lines.push(
				...(options.verbose ? formatVerboseEntry(entry) : [formatEntry(entry)]),
			);
		}
	}

	const uncategorized = grouped.get("uncategorized");
	if (uncategorized?.length) {
		lines.push("Other");
		for (const entry of uncategorized) {
			lines.push(
				...(options.verbose ? formatVerboseEntry(entry) : [formatEntry(entry)]),
			);
		}
	}

	lines.push(
		"",
		"Flags",
		"  -j, --json  JSON",
		"  --for <intent>  planning|execution|maintenance",
		"  --verbose  details",
		"  help --verbose|<command>",
		"  a=afol",
		"Side effects",
		"  read=none; generated=derived; append=rows; write=state",
	);
	return lines.join("\n");
}
