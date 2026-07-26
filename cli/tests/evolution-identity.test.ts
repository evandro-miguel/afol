import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import templateConfig from "../../src/project-template/.afol/config.json";
import {
	resolveEvolutionConfig,
	validateEvolutionConfigExtension,
} from "../services/evolution";
import { newWorkstream, recordEvidence } from "../services/workbench/lifecycle";

const PROJECT_ID = "6b7d91ca-496b-4f0c-8537-5c4993810d15";

describe("Evolution identity boundaries", () => {
	test("keeps legacy config unconfigured even with a non-UUID project id", () => {
		const config = { schema_version: 1, project: { id: "legacy-id" } };
		expect(resolveEvolutionConfig(config)).toMatchObject({
			configured: false,
			projectId: null,
		});
		expect(validateEvolutionConfigExtension(config)).toEqual([]);
	});

	test("requires stable UUID and timezone when evolution is explicitly enabled", () => {
		const template = structuredClone(templateConfig) as Record<string, unknown>;
		const project = template.project as Record<string, unknown>;
		project.id = "legacy-id";
		expect(() => resolveEvolutionConfig(template)).toThrow(
			"project.id must be a stable UUID",
		);
		project.id = PROJECT_ID;
		project.timezone = "not/a-timezone";
		expect(() => resolveEvolutionConfig(template)).toThrow(
			"project.timezone must be a valid IANA timezone",
		);
	});

	test("allows safe project-relative evolution storage overrides", () => {
		const config = structuredClone(templateConfig) as Record<string, unknown>;
		const paths = config.paths as Record<string, unknown>;
		paths.evolution_db = ".afol/state/custom-evolution.db";
		paths.evolution_events_dir = ".afol/custom-events";
		expect(resolveEvolutionConfig(config).paths).toMatchObject({
			evolutionDb: ".afol/state/custom-evolution.db",
			evolutionEventsDir: ".afol/custom-events",
		});
	});

	test("rejects unsafe evolution storage overrides", () => {
		for (const path of [
			"/tmp/evolution.db",
			"../evolution.db",
			"state/../evolution.db",
			".agents/runtime/evolution.db",
			"docs/evolution.db",
			"C:\\evolution.db",
			"state\\evolution.db",
			"state/",
		]) {
			const config = structuredClone(templateConfig) as Record<string, unknown>;
			const paths = config.paths as Record<string, unknown>;
			paths.evolution_db = path;
			expect(() => resolveEvolutionConfig(config)).toThrow(
				"paths.evolution_db must be an AFOL-owned project-relative path",
			);
		}
	});

	test("emits explicit project and session identity for configured observed evidence", () => {
		const root = mkdtempSync(join(tmpdir(), "evolution-identity-"));
		try {
			mkdirSync(join(root, ".afol"), { recursive: true });
			const config = structuredClone(templateConfig) as Record<string, unknown>;
			(config.project as Record<string, unknown>).id = PROJECT_ID;
			writeFileSync(
				join(root, ".afol", "config.json"),
				`${JSON.stringify(config)}\n`,
				"utf8",
			);
			const created = newWorkstream(root, "identity evidence");
			const evidence = recordEvidence(root, {
				session: created.session,
				taskId: "T-01",
				command: "bun test",
				result: "passed",
				exitCode: 0,
				provenance: "observed",
			});
			expect(evidence).toMatchObject({
				project_id: PROJECT_ID,
				session_id: created.session,
			});
			const persisted = JSON.parse(
				readFileSync(created.evidencePath, "utf8").trim(),
			) as Record<string, unknown>;
			expect(persisted.project_id).toBe(PROJECT_ID);
			expect(persisted.session_id).toBe(created.session);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
