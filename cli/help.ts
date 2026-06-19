import {
	type CommandCategory,
	type CommandSpec,
	type CommandSubcommandSpec,
	kernelRegistry,
} from "./registry";

const CATEGORY_ORDER: readonly CommandCategory[] = [
	"core",
	"workflow",
	"inspect",
	"ops",
];

const CATEGORY_LABELS: Record<CommandCategory, string> = {
	core: "Core",
	workflow: "Workflow",
	inspect: "Inspect",
	ops: "Ops",
};

const COMPACT_DESCRIPTIONS: Record<string, string> = {
	status: "project status",
	validate: "validation gates",
	init: "install scaffold",
	new: "create session",
	start: "start task",
	done: "complete task",
	log: "append log",
	"quick-task": "one-task lifecycle",
	evidence: "record evidence",
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
	adm: "inspect adm",
	spec: "inspect specs",
	adr: "inspect ADRs",
	changelog: "inspect changelog",
	bench: "run benchmarks",
	"project-benchmark": "compare references",
	catchup: "unsynced context",
	preflight: "planning preflight",
	telemetry: "inspect telemetry",
	file: "patch/move/archive",
	update: "update scaffold",
	health: "health checks",
	db: "database state",
	doctor: "doctor checks",
	maintenance: "maintenance checks",
	sweep: "repo sweep",
	schema: "schema review/apply",
	adapter: "manage adapters",
};

function formatCommandName(spec: CommandSpec): string {
	const alias = spec.aliases[0];
	return alias ? `${alias}/${spec.command}` : spec.command;
}

function formatEntry(spec: CommandSpec): string {
	return `  ${formatCommandName(spec)}[${spec.sideEffect}] - ${
		COMPACT_DESCRIPTIONS[spec.command] ?? spec.description
	}`;
}

function formatVerboseEntry(spec: CommandSpec): string[] {
	const lines = [
		`  ${spec.command}`,
		`    aliases: ${spec.aliases.length > 0 ? spec.aliases.join(", ") : "none"}`,
		`    effect: ${spec.sideEffect}`,
		`    description: ${spec.description}`,
	];
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
				`      ${subcommand.usage} [${subcommand.sideEffect}] - ${subcommand.description}`,
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
	description: string;
	category: CommandCategory | "uncategorized";
	guidance?: readonly string[];
	subcommands?: CommandSubcommandSpec[];
};

export function buildCommandCatalog(
	registry = kernelRegistry,
): CommandCatalogEntry[] {
	return registry.commands.map((spec) => {
		const entry: CommandCatalogEntry = {
			command: spec.command,
			aliases: [...spec.aliases],
			kind: spec.kind,
			sideEffect: spec.sideEffect,
			description: spec.description,
			category: spec.category ?? "uncategorized",
		};
		const subcommands = spec.subcommands?.map((entry) => ({ ...entry }));
		if (subcommands !== undefined) {
			entry.subcommands = subcommands;
		}
		return entry;
	});
}

export function formatCatalogJson(registry = kernelRegistry): string {
	return `${JSON.stringify(buildCommandCatalog(registry), null, 2)}\n`;
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
		description: spec.description,
		category: spec.category ?? "uncategorized",
	};
	if (spec.guidance !== undefined) {
		entry.guidance = [...spec.guidance];
	}
	const subcommands = spec.subcommands?.map((entry) => ({ ...entry }));
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
	options: { verbose?: boolean } = {},
): string {
	const grouped = new Map<CommandCategory | "uncategorized", CommandSpec[]>();
	for (const category of CATEGORY_ORDER) {
		grouped.set(category, []);
	}
	grouped.set("uncategorized", []);

	for (const spec of registry.commands) {
		const bucket = spec.category ?? "uncategorized";
		const entries = grouped.get(bucket) ?? [];
		entries.push(spec);
		grouped.set(bucket, entries);
	}

	const lines = ["Usage: afol [command] [options]", "", "Commands"];
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
		"  -j, --json  JSON output when supported",
		"  --verbose  Expanded human catalog with subcommands",
		"Details",
		"  afol help <command>",
		"  afol help --verbose",
		"Side effects",
		"  read=no writes; generated=refreshes derived state; append=adds rows; write=changes files/state",
		"Aliases",
		"  a=afol",
	);
	return lines.join("\n");
}
