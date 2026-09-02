import { describe, expect, test } from "bun:test";
import templateConfig from "../../src/project-template/.afol/config.json";
import {
	resolveEvolutionConfig,
	validateEvolutionConfigExtension,
} from "../services/evolution";

describe("Evolution legacy project opt-in", () => {
	test("accepts legacy config without mutation and validates the documented explicit extension", () => {
		const legacy = {
			schema_version: 1,
			project: { name: "legacy-project" },
			paths: {
				agents_dir: ".agents",
				mutable_dir: ".afol",
			},
		};
		const before = JSON.stringify(legacy);
		const legacyResolved = resolveEvolutionConfig(legacy);
		expect(legacyResolved.configured).toBe(false);
		expect(legacyResolved.projectId).toBeNull();
		expect(JSON.stringify(legacy)).toBe(before);

		const template = templateConfig as Record<string, unknown> & {
			project: { id: string; timezone: string };
			paths: Record<string, unknown>;
			evolution: Record<string, unknown>;
		};
		const migrated = {
			...legacy,
			project: {
				...legacy.project,
				id: template.project.id,
				timezone: template.project.timezone,
			},
			paths: {
				...legacy.paths,
				external_dir: template.paths.external_dir,
				evolution_db: template.paths.evolution_db,
				evolution_data_dir: template.paths.evolution_data_dir,
				evolution_events_dir: template.paths.evolution_events_dir,
			},
			evolution: structuredClone(template.evolution),
		};

		expect(validateEvolutionConfigExtension(migrated)).toEqual([]);
		const resolved = resolveEvolutionConfig(migrated);
		expect(resolved.configured).toBe(true);
		expect(resolved.projectId).toBe(template.project.id);
		expect(resolved.timezone).toBe(template.project.timezone);
	});
});
