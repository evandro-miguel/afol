import type { CommandSpec } from "../../registry";

export type ManifestCommands = Record<string, string[]>;
export type ManifestCommandStability = Record<string, CommandSpec["stability"]>;

export function buildManifestCommands(
	commands: readonly CommandSpec[],
): ManifestCommands {
	const manifestCommands: ManifestCommands = {};

	for (const spec of commands) {
		manifestCommands[spec.command] = [...spec.aliases, spec.command];
	}

	return manifestCommands;
}

export function buildManifestCommandStability(
	commands: readonly CommandSpec[],
): ManifestCommandStability {
	return Object.fromEntries(
		commands.map((spec) => [spec.command, spec.stability]),
	);
}
