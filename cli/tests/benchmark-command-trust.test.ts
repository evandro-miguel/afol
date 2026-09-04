import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry } from "../validate/registry";
import type { CommandInvocation } from "../validate/scenario-execution";
import {
	runScenarioCommand,
	type ScenarioSampleRun,
} from "../validate/scenario-execution";
import type { Scenario } from "../validate/types";

function sample(): ScenarioSampleRun {
	return {
		duration_ms: 1,
		exit_code: 0,
		signal: null,
		spawn_error: null,
		stdout: "",
		stderr: "",
	};
}

function makeScenario(command: string, setup?: string[][]): Scenario {
	return {
		schema_version: "1.0.0",
		scenario_id: "benchmark-command-trust",
		scenario_version: "1.0.0",
		pack_id: "cli-kernel-local",
		command,
		...(setup ? { setup } : {}),
		sandbox: Boolean(setup),
		result_schema: "1.0.0",
		oracle: "test",
		thresholds: {},
		baseline_id: "cli-kernel-local-v1",
		deterministic_metrics: { duration_ms: 1 },
		implementation_status: "implemented",
	};
}

describe("benchmark catalog command trust", () => {
	test("loadRegistry records project catalog provenance", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		try {
			const catalogDir = join(root, ".afol", "data", "benchmarks", "catalog");
			mkdirSync(catalogDir, { recursive: true });
			writeFileSync(
				join(catalogDir, "registry.json"),
				JSON.stringify({ schema_version: "1.0.0", packs: [] }),
				"utf8",
			);
			expect(loadRegistry(root).source).toBe("project");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		["command", makeScenario("/bin/sh -c 'touch escaped'")],
		[
			"setup",
			makeScenario("afol status --json", [["/bin/sh", "-c", "touch escaped"]]),
		],
	])("rejects project catalog %s executables before spawn", (_, scenario) => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		try {
			expect(() =>
				runScenarioCommand(root, scenario, {
					catalogSource: "project",
					sampleCount: 1,
					warmupCount: 0,
					seams: {
						runSample: (_, invocation) => {
							invocations.push(invocation);
							return sample();
						},
					},
				}),
			).toThrow("Project benchmark catalogs may only execute afol/a commands");
			expect(invocations).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project catalog afol commands bypass a malicious project-root afol", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const localAfol = join(root, "afol");
		const invocations: CommandInvocation[] = [];
		writeFileSync(localAfol, "#!/bin/sh\nexit 99\n", "utf8");
		chmodSync(localAfol, 0o755);
		try {
			runScenarioCommand(root, makeScenario("afol status --json"), {
				catalogSource: "project",
				sampleCount: 1,
				warmupCount: 0,
				seams: {
					runSample: (_, invocation) => {
						invocations.push(invocation);
						return sample();
					},
				},
			});
			expect(invocations).toHaveLength(1);
			expect(invocations[0]?.command).toBe("bun");
			expect(invocations[0]?.args.slice(0, 2)).toEqual([
				"run",
				join(import.meta.dir, "..", "..", "cli", "main.ts"),
			]);
			expect(invocations[0]?.command).not.toBe(localAfol);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("builtin dev commands may continue to invoke bun", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		try {
			runScenarioCommand(root, makeScenario("bun --version"), {
				catalogSource: "builtin",
				sampleCount: 1,
				warmupCount: 0,
				seams: {
					runSample: (_, invocation) => {
						invocations.push(invocation);
						return sample();
					},
				},
			});
			expect(invocations).toEqual([{ command: "bun", args: ["--version"] }]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
