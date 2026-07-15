import type { CommandSpec } from "../../registry";

export type ManifestCommands = Record<string, string[]>;

export function buildManifestCommands(
	commands: readonly CommandSpec[],
): ManifestCommands {
	const manifestCommands: ManifestCommands = {};

	for (const spec of commands) {
		manifestCommands[spec.command] = [...spec.aliases, spec.command];
	}

	return manifestCommands;
}
