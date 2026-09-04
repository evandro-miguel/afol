import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_ASSET_FILES } from "../generated/builtin-assets";
import { TRUSTED_BUN_CONFIG_PATH } from "../services/benchmark/trusted-bun";
import { newWorkstream, startTask } from "../services/workbench/lifecycle";
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
		execution_source: "builtin",
	};
}

function makeProjectScenario(command: string, setup?: string[][]): Scenario {
	return { ...makeScenario(command, setup), execution_source: "project" };
}

function writeProjectRootFixture(root: string): void {
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		JSON.stringify({ schema_version: 1, project: { name: "benchmark" } }),
		"utf8",
	);
	mkdirSync(join(root, ".agents"), { recursive: true });
	writeFileSync(
		join(root, ".agents", "lock.json"),
		JSON.stringify({ schema_version: 1, locked: true }),
		"utf8",
	);
}

const STATUS_SCENARIO_RELATIVE_PATH =
	".afol/data/benchmarks/catalog/scenarios/cli-kernel-local/cli-status-json.json";
const STATUS_SCENARIO_ASSET_PATH =
	"benchmarks/catalog/scenarios/cli-kernel-local/cli-status-json.json";

function writeProjectCatalog(root: string, scenarioBytes: Uint8Array): string {
	const catalogDir = join(root, ".afol", "data", "benchmarks", "catalog");
	const scenarioDir = join(catalogDir, "scenarios", "cli-kernel-local");
	mkdirSync(scenarioDir, { recursive: true });
	writeFileSync(
		join(catalogDir, "registry.json"),
		JSON.stringify({
			schema_version: "1.0.0",
			packs: [
				{ pack_id: "cli-kernel-local", min_scenarios: 0, selector_tags: [] },
			],
		}),
		"utf8",
	);
	const scenarioPath = join(root, STATUS_SCENARIO_RELATIVE_PATH);
	writeFileSync(scenarioPath, scenarioBytes);
	return scenarioPath;
}

function embeddedStatusScenarioBytes(): Buffer {
	const asset = BUILTIN_ASSET_FILES[STATUS_SCENARIO_ASSET_PATH];
	if (!asset)
		throw new Error(`Missing test asset: ${STATUS_SCENARIO_ASSET_PATH}`);
	return Buffer.from(asset.contentBase64, "base64");
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

	test("classifies embedded, exact-copy, edited, new, and mismatched scenarios independently", () => {
		const builtinRoot = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		try {
			const builtinScenario = loadRegistry(builtinRoot).scenariosByPack[
				"cli-kernel-local"
			]?.find((scenario) => scenario.scenario_id === "cli-status-json");
			expect(builtinScenario?.execution_source).toBe("builtin");

			const exactRoot = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
			try {
				writeProjectCatalog(exactRoot, embeddedStatusScenarioBytes());
				expect(
					loadRegistry(exactRoot).scenariosByPack["cli-kernel-local"]?.[0]
						?.execution_source,
				).toBe("builtin-copy");
			} finally {
				rmSync(exactRoot, { recursive: true, force: true });
			}

			const editedRoot = mkdtempSync(
				join(tmpdir(), "benchmark-command-trust-"),
			);
			try {
				writeProjectCatalog(
					editedRoot,
					Buffer.concat([embeddedStatusScenarioBytes(), Buffer.from(" ")]),
				);
				expect(
					loadRegistry(editedRoot).scenariosByPack["cli-kernel-local"]?.[0]
						?.execution_source,
				).toBe("project");
			} finally {
				rmSync(editedRoot, { recursive: true, force: true });
			}

			const newRoot = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
			try {
				const scenarioPath = writeProjectCatalog(
					newRoot,
					embeddedStatusScenarioBytes(),
				);
				const renamedPath = scenarioPath.replace(
					"cli-status-json",
					"new-scenario",
				);
				const scenarioBytes = embeddedStatusScenarioBytes();
				writeFileSync(renamedPath, scenarioBytes);
				expect(
					loadRegistry(newRoot).scenariosByPack["cli-kernel-local"]?.[1]
						?.execution_source,
				).toBe("project");
			} finally {
				rmSync(newRoot, { recursive: true, force: true });
			}

			const mismatchRoot = mkdtempSync(
				join(tmpdir(), "benchmark-command-trust-"),
			);
			try {
				const scenarioPath = writeProjectCatalog(
					mismatchRoot,
					embeddedStatusScenarioBytes(),
				);
				writeFileSync(
					scenarioPath.replace("cli-status-json", "cli-help-compact"),
					embeddedStatusScenarioBytes(),
				);
				expect(
					loadRegistry(mismatchRoot).scenariosByPack["cli-kernel-local"]?.[0]
						?.execution_source,
				).toBe("project");
			} finally {
				rmSync(mismatchRoot, { recursive: true, force: true });
			}
		} finally {
			rmSync(builtinRoot, { recursive: true, force: true });
		}
	});

	test.each([
		["command", makeProjectScenario("/bin/sh -c 'touch escaped'")],
		[
			"setup",
			makeProjectScenario("afol status --json", [
				["/bin/sh", "-c", "touch escaped"],
			]),
		],
	])("rejects project catalog %s executables before spawn", (_, scenario) => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		try {
			expect(() =>
				runScenarioCommand(root, scenario, {
					sampleCount: 1,
					warmupCount: 0,
					seams: {
						runSample: (_, invocation) => {
							invocations.push(invocation);
							return sample();
						},
					},
				}),
			).toThrow(
				/may (only execute the exact afol status --json command|not define setup)/,
			);
			expect(invocations).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed when execution provenance is missing or caller-forged", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		const seams = {
			runSample: (_root: string, invocation: CommandInvocation) => {
				invocations.push(invocation);
				return sample();
			},
		};
		try {
			const missing = {
				...makeScenario("/bin/sh -c true"),
			} as Partial<Scenario>;
			delete missing.execution_source;
			expect(() =>
				runScenarioCommand(root, missing as Scenario, {
					sampleCount: 1,
					warmupCount: 0,
					seams,
				}),
			).toThrow("execution provenance is required");

			const forgedOptions = {
				catalogSource: "builtin",
				sampleCount: 1,
				warmupCount: 0,
				seams,
			};
			expect(() =>
				runScenarioCommand(
					root,
					makeProjectScenario("/bin/sh -c true"),
					forgedOptions,
				),
			).toThrow("may only execute the exact afol status --json command");
			expect(invocations).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each([
		"a status --json",
		"./afol status --json",
		"afol status",
		"afol status --health --json",
		"afol status --json --verbose",
	])("rejects non-exact project AFOL route before spawn: %s", (command) => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		try {
			expect(() =>
				runScenarioCommand(root, makeProjectScenario(command), {
					sampleCount: 1,
					warmupCount: 0,
					seams: {
						runSample: (_, invocation) => {
							invocations.push(invocation);
							return sample();
						},
					},
				}),
			).toThrow("may only execute the exact afol status --json command");
			expect(invocations).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects a project hot-path scenario before entering the runner", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const invocations: CommandInvocation[] = [];
		try {
			const scenario = {
				...makeProjectScenario("afol status --health --json"),
				runner: "hot-path" as const,
				hot_path: { operation: "status" as const, mode: "default" as const },
			};
			expect(() =>
				runScenarioCommand(root, scenario, {
					sampleCount: 1,
					warmupCount: 0,
					seams: {
						runSample: (_, invocation) => {
							invocations.push(invocation);
							return sample();
						},
					},
				}),
			).toThrow("may not define a runner");
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
			runScenarioCommand(root, makeProjectScenario("afol status --json"), {
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
			expect(invocations[0]?.command).toBe(process.execPath);
			expect(invocations[0]?.args.slice(0, 3)).toEqual([
				"--no-env-file",
				`--config=${TRUSTED_BUN_CONFIG_PATH}`,
				"run",
			]);
			expect(invocations[0]?.args.slice(3, 4)).toEqual([
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
				sampleCount: 1,
				warmupCount: 0,
				seams: {
					runSample: (_, invocation) => {
						invocations.push(invocation);
						return sample();
					},
				},
			});
			expect(invocations).toEqual([
				{
					command: process.execPath,
					args: [
						"--no-env-file",
						`--config=${TRUSTED_BUN_CONFIG_PATH}`,
						"--version",
					],
				},
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project AFOL routes cannot execute nested verification commands", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const marker = join(root, "escaped");
		writeProjectRootFixture(root);
		try {
			expect(() =>
				runScenarioCommand(
					root,
					makeProjectScenario(
						"afol quick-task exploit --task one --command 'touch escaped' --no-spec-required --reason benchmark",
					),
					{ sampleCount: 1, warmupCount: 0 },
				),
			).toThrow("may only execute the exact afol status --json command");
			expect(existsSync(marker)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project AFOL routes cannot execute shell verification commands", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const marker = join(root, "escaped-shell");
		writeProjectRootFixture(root);
		const created = newWorkstream(root, "shell");
		startTask(root, { session: created.session, taskId: "T-01" });
		try {
			expect(() =>
				runScenarioCommand(
					root,
					makeProjectScenario(
						`afol done --session ${created.session} --task-id T-01 --test-shell 'touch escaped-shell'`,
					),
					{ sampleCount: 1, warmupCount: 0 },
				),
			).toThrow("may only execute the exact afol status --json command");
			expect(existsSync(marker)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("project source fallback ignores project bunfig preloads", () => {
		const root = mkdtempSync(join(tmpdir(), "benchmark-command-trust-"));
		const marker = join(root, "preloaded");
		writeProjectRootFixture(root);
		writeFileSync(
			join(root, "evil-preload.ts"),
			`import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "preloaded");\n`,
			"utf8",
		);
		writeFileSync(
			join(root, "bunfig.toml"),
			'preload = ["./evil-preload.ts"]\n',
			"utf8",
		);
		try {
			runScenarioCommand(root, makeProjectScenario("afol status --json"), {
				sampleCount: 1,
				warmupCount: 0,
			});
			expect(existsSync(marker)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
