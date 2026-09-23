import { readProjectConfig } from "../project/paths";
import {
	DEFAULT_EVOLUTION_PATHS,
	DEFAULT_EVOLUTION_SETTINGS,
	DEFAULT_EVOLUTION_TIMEZONE,
	type ResolvedEvolutionConfig,
	resolveEvolutionIdentity,
} from "./config";
import { evolutionDbPath } from "./db";
import { validateEvolutionConfigExtension } from "./validation";

export type ResolvedEvolutionRuntime = {
	projectId: string | null;
	timezone: string;
	dbPath: string;
	eventsDir: string;
};

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function resolveEvolutionConfig(
	config: unknown,
): ResolvedEvolutionConfig {
	const root = record(config) ?? {};
	const issues = validateEvolutionConfigExtension(root);
	if (issues.length > 0) throw new Error(issues.join("; "));
	const identity = resolveEvolutionIdentity(root);
	const paths = record(root.paths) ?? {};
	const evolution = record(root.evolution);
	return {
		...identity,
		configured: evolution !== null,
		enabled: evolution ? evolution.enabled === true : true,
		paths: {
			externalDir:
				typeof paths.external_dir === "string"
					? paths.external_dir
					: DEFAULT_EVOLUTION_PATHS.externalDir,
			evolutionDb:
				typeof paths.evolution_db === "string"
					? paths.evolution_db
					: DEFAULT_EVOLUTION_PATHS.evolutionDb,
			evolutionDataDir:
				typeof paths.evolution_data_dir === "string"
					? paths.evolution_data_dir
					: DEFAULT_EVOLUTION_PATHS.evolutionDataDir,
			evolutionEventsDir:
				typeof paths.evolution_events_dir === "string"
					? paths.evolution_events_dir
					: DEFAULT_EVOLUTION_PATHS.evolutionEventsDir,
		},
		settings: evolution ? { ...evolution } : { ...DEFAULT_EVOLUTION_SETTINGS },
	};
}

/**
 * Single resolution of the configured evolution paths. Ingest, repair, and
 * checkpoint writers must all derive their targets from this one helper so
 * a custom paths.evolution_db / evolution_events_dir cannot split readers
 * from writers.
 */
export function resolveEvolutionRuntime(
	root: string,
): ResolvedEvolutionRuntime {
	const config = resolveEvolutionConfig(readProjectConfig(root));
	return {
		projectId: config.projectId,
		timezone: config.timezone ?? DEFAULT_EVOLUTION_TIMEZONE,
		dbPath: evolutionDbPath(root, config.paths.evolutionDb),
		eventsDir: config.paths.evolutionEventsDir,
	};
}
