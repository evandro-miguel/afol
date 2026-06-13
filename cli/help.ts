import { kernelRegistry, type CommandCategory, type CommandSpec } from "./registry";

const CATEGORY_ORDER: readonly CommandCategory[] = ["core", "workflow", "inspect", "ops"];

const CATEGORY_LABELS: Record<CommandCategory, string> = {
	core: "Core",
	workflow: "Workflow",
	inspect: "Inspect",
	ops: "Ops",
};

function formatEntry(spec: CommandSpec): string {
	const alias = spec.aliases[0];
	const name = alias ? `${alias}/${spec.command}` : spec.command;
	return `${name} - ${spec.description}`;
}

export type CommandCatalogEntry = {
	command: string;
	aliases: string[];
	kind: CommandSpec["kind"];
	sideEffect: CommandSpec["sideEffect"];
	description: string;
	category: CommandCategory | "uncategorized";
};

export function buildCommandCatalog(
	registry = kernelRegistry,
): CommandCatalogEntry[] {
	return registry.commands.map((spec) => ({
		command: spec.command,
		aliases: [...spec.aliases],
		kind: spec.kind,
		sideEffect: spec.sideEffect,
		description: spec.description,
		category: spec.category ?? "uncategorized",
	}));
}

export function formatCatalogJson(registry = kernelRegistry): string {
	return `${JSON.stringify(buildCommandCatalog(registry), null, 2)}\n`;
}

export function buildCommandHelpJson(
	commandOrAlias: string,
	registry = kernelRegistry,
): CommandCatalogEntry | null {
	const canonical = registry.canonicalize(commandOrAlias);
	const spec = registry.commands.find((entry) => entry.command === canonical) ?? null;
	if (!spec) {
		return null;
	}

	return {
		command: spec.command,
		aliases: [...spec.aliases],
		kind: spec.kind,
		sideEffect: spec.sideEffect,
		description: spec.description,
		category: spec.category ?? "uncategorized",
	};
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
	].join("\n");
}

export function formatHelpText(registry = kernelRegistry): string {
	const grouped = new Map<CommandCategory | "uncategorized", string[]>();
	for (const category of CATEGORY_ORDER) {
		grouped.set(category, []);
	}
	grouped.set("uncategorized", []);

	for (const spec of registry.commands) {
		const bucket = spec.category ?? "uncategorized";
		const entries = grouped.get(bucket) ?? [];
		entries.push(formatEntry(spec));
		grouped.set(bucket, entries);
	}

	const lines = ["Usage: afol [command] [options]", "", "Commands"];
	for (const category of CATEGORY_ORDER) {
		const entries = grouped.get(category);
		if (!entries?.length) {
			continue;
		}

		lines.push(CATEGORY_LABELS[category]);
		lines.push(`  ${entries.join(" | ")}`);
	}

	const uncategorized = grouped.get("uncategorized");
	if (uncategorized?.length) {
		lines.push("Other");
		lines.push(`  ${uncategorized.join(" | ")}`);
	}

	lines.push("", "Flags", "  -j, --json  JSON output for status", "Aliases", "  a=afol");
	return lines.join("\n");
}
