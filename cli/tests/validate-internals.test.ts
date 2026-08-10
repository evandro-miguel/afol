import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_BENCH_MODEL } from "../services/benchmark/types";
import {
	resolveTaskCompletionLockPath,
	withTaskCompletionLock,
} from "../services/workbench/completion-lock";
import { parseValidationArgs } from "../validate/args";
import { saveBenchmarkPayload } from "../validate/benchmark-files";
import {
	buildResult,
	collectProfileCompatibilityNotes,
} from "../validate/command";
import {
	loadRegistry,
	runValidationCommand,
	selectPacks,
} from "../validate/contract";
import {
	outputJson,
	outputJsonWithStatus,
	outputTail,
	registrySummary,
} from "../validate/output";
import {
	validateBenchmarkProvenance,
	validateMutationBaselineContract,
	validateRegistryContract,
} from "../validate/registry";
import {
	buildRuntimeLiveAgentResults,
	collectThresholdNotes,
} from "../validate/runtime-live";
import {
	compiledReleaseBuildArgs,
	ensureBenchmarkTempRoot,
	executeScenarioPackWithArtifact,
	isCompiledBunRuntime,
	type PreparedCompiledReleaseArtifact,
	prepareCompiledReleaseArtifact,
	resolveAfolExecutable,
	resolveScenarioSampleCount,
	runScenarioCommand,
	type ScenarioExecutionResult,
	type ScenarioSamplePhase,
	type ScenarioSampleRun,
} from "../validate/scenario-execution";
import {
	asBoolean,
	asNumberRecord,
	asOptionalNumber,
	asOptionalObject,
	asOptionalString,
	asString,
	isObject,
	loadJsonObject,
} from "../validate/shared";
import type { Baseline, RegistrySnapshot, Scenario } from "../validate/types";

function createRepoLocalTestRoot(prefix: string): string {
	const testTempRoot = join(process.cwd(), ".afol", "tmp", "tests");
	mkdirSync(testTempRoot, { recursive: true });
	return mkdtempSync(join(testTempRoot, prefix));
}

function createFixtureRoot(): string {
	const root = createRepoLocalTestRoot("validate-internals-");
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "benchmarks"), { recursive: true });
	writeFileSync(
		join(root, ".afol", "config.json"),
		'{"schema_version":1,"project":{"name":"afol"}}\n',
		"utf8",
	);
	cpSync(
		join(process.cwd(), ".agents", "lock.json"),
		join(root, ".agents", "lock.json"),
	);
	cpSync(
		join(process.cwd(), ".afol", "data", "benchmarks", "catalog"),
		join(root, ".afol", "data", "benchmarks", "catalog"),
		{ recursive: true },
	);
	const historicalBaselinePath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"baselines",
		"evolution-core",
		"baseline-v1.json",
	);
	const baselinePath = historicalBaselinePath.replace(
		"baseline-v1.json",
		"baseline-v2.json",
	);
	const baseline = readJson(historicalBaselinePath);
	baseline.baseline_id = "evolution-core-v2";
	baseline.run_id = "bench-evolution-core-evolution-status-contract-1.1.0";
	writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
	cpSync(
		join(process.cwd(), ".afol", "data", "benchmarks", "snapshots"),
		join(root, ".afol", "data", "benchmarks", "snapshots"),
		{ recursive: true },
	);
	mkdirSync(join(root, ".afol", "adm"), { recursive: true });
	cpSync(
		join(process.cwd(), ".afol", "adm", "roadmap"),
		join(root, ".afol", "adm", "roadmap"),
		{ recursive: true },
	);
	cpSync(
		join(process.cwd(), ".afol", "adm", "specs"),
		join(root, ".afol", "adm", "specs"),
		{ recursive: true },
	);
	const runtimeLiveSnapshotPath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"snapshots",
		"runtime-flow-live-agent-v4-latest.json",
	);
	if (existsSync(runtimeLiveSnapshotPath)) {
		const runtimeLiveSnapshot = readJson(runtimeLiveSnapshotPath);
		runtimeLiveSnapshot.generated_at = new Date().toISOString();
		writeFileSync(
			runtimeLiveSnapshotPath,
			`${JSON.stringify(runtimeLiveSnapshot, null, 2)}\n`,
			"utf8",
		);
		const savedResultPath = join(
			root,
			runtimeLiveSnapshot.saved_result_path as string,
		);
		mkdirSync(dirname(savedResultPath), { recursive: true });
		writeFileSync(
			savedResultPath,
			`${JSON.stringify(runtimeLiveSnapshot, null, 2)}\n`,
			"utf8",
		);
	}
	const benchmarkResultsSource = join(
		process.cwd(),
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"results",
	);
	if (existsSync(benchmarkResultsSource)) {
		cpSync(
			benchmarkResultsSource,
			join(root, ".afol", "data", "benchmarks", "catalog", "results"),
			{ recursive: true },
		);
	}
	symlinkSync(join(process.cwd(), "cli"), join(root, "cli"), "dir");
	const gitSteps = [
		["init"],
		["config", "user.email", "bench@example.com"],
		["config", "user.name", "Bench User"],
		["add", ".agents", ".afol", "cli"],
		["commit", "-m", "fixture"],
	] as const;
	for (const args of gitSteps) {
		const result = spawnSync("git", args, {
			cwd: root,
			encoding: "utf8",
		});
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")} failed`,
			);
		}
	}
	// The copied catalog may carry provenance from the source checkout. Rebind
	// measured fixtures to this disposable repository so registry validation
	// exercises the same ancestor/timestamp contract without trusting that hash.
	const fixtureCommit = gitFixtureValue(root, ["rev-parse", "HEAD"]);
	const fixtureTimestamp = gitFixtureValue(root, [
		"show",
		"-s",
		"--format=%cI",
		fixtureCommit,
	]);
	const evolutionScenarioPath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"scenarios",
		"evolution-core",
		"evolution-status-contract.json",
	);
	const historicalEvolutionBaselinePath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"baselines",
		"evolution-core",
		"baseline-v1.json",
	);
	const evolutionBaselinePath = historicalEvolutionBaselinePath.replace(
		"baseline-v1.json",
		"baseline-v2.json",
	);
	if (
		existsSync(evolutionScenarioPath) &&
		existsSync(historicalEvolutionBaselinePath)
	) {
		const evolutionScenario = readJson(evolutionScenarioPath);
		const measurement = evolutionScenario.measurement;
		if (isObject(measurement)) {
			evolutionScenario.measurement = {
				...measurement,
				git_commit: fixtureCommit,
				timestamp: fixtureTimestamp,
			};
			writeFileSync(
				evolutionScenarioPath,
				`${JSON.stringify(evolutionScenario, null, 2)}\n`,
				"utf8",
			);
			const evolutionBaseline = readJson(historicalEvolutionBaselinePath);
			evolutionBaseline.baseline_id = "evolution-core-v2";
			evolutionBaseline.run_id =
				"bench-evolution-core-evolution-status-contract-1.1.0";
			evolutionBaseline.git_commit = fixtureCommit;
			evolutionBaseline.timestamp = fixtureTimestamp;
			writeFileSync(
				evolutionBaselinePath,
				`${JSON.stringify(evolutionBaseline, null, 2)}\n`,
				"utf8",
			);
		}
	}
	return root;
}

function createBenchExecutionFixtureRoot(): string {
	const root = createRepoLocalTestRoot("validate-bench-exec-");
	mkdirSync(root, { recursive: true });
	mkdirSync(join(root, ".afol"), { recursive: true });
	writeFileSync(join(root, ".afol", ".keep"), "\n", "utf8");
	writeFileSync(
		join(root, ".gitignore"),
		`${[
			".afol/state/",
			".afol/data/events/",
			".afol/data/index/",
			".afol/data/mutations/",
			".afol/pstr/",
			".afol/wb/.active_session",
			".afol/wb/session-context.json",
		].join("\n")}\n`,
		"utf8",
	);
	writeFileSync(join(root, "tracked.txt"), "initial\n", "utf8");
	writeFileSync(
		join(root, "mutate.js"),
		'const { appendFileSync } = require("node:fs");\nappendFileSync("tracked.txt", "changed\\n", "utf8");\n',
		"utf8",
	);
	symlinkSync(join(process.cwd(), "cli"), join(root, "cli"), "dir");
	symlinkSync(join(process.cwd(), "afol"), join(root, "afol"));
	if (existsSync(join(process.cwd(), "node_modules"))) {
		symlinkSync(
			join(process.cwd(), "node_modules"),
			join(root, "node_modules"),
			"dir",
		);
	}
	const gitSteps = [
		["init"],
		["config", "user.email", "bench@example.com"],
		["config", "user.name", "Bench User"],
		[
			"add",
			".gitignore",
			".afol/.keep",
			"tracked.txt",
			"mutate.js",
			"afol",
			"cli",
		],
		["commit", "-m", "fixture"],
	] as const;
	for (const args of gitSteps) {
		const result = spawnSync("git", args, {
			cwd: root,
			encoding: "utf8",
		});
		if (result.status !== 0) {
			throw new Error(
				result.stderr || result.stdout || `git ${args.join(" ")} failed`,
			);
		}
	}
	return root;
}

function withCapturedStdout<T>(action: () => T): {
	result: T;
	stdout: string[];
} {
	const stdout: string[] = [];
	const originalWrite = process.stdout.write;
	process.stdout.write = ((chunk: string | Uint8Array) => {
		stdout.push(
			typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
		);
		return true;
	}) as typeof process.stdout.write;
	try {
		return { result: action(), stdout };
	} finally {
		process.stdout.write = originalWrite;
	}
}

function withCapturedConsoleError<T>(action: () => T): {
	result: T;
	stderr: string[];
} {
	const stderr: string[] = [];
	const originalError = console.error;
	console.error = ((...args: unknown[]) => {
		stderr.push(args.map((value) => String(value)).join(" "));
	}) as typeof console.error;
	try {
		return { result: action(), stderr };
	} finally {
		console.error = originalError;
	}
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function getRuntimeLiveSnapshotPath(root: string): string {
	return join(
		root,
		".afol",
		"data",
		"benchmarks",
		"snapshots",
		"runtime-flow-live-agent-v4-latest.json",
	);
}

function getRuntimeLiveSavedResultPath(root: string): string {
	const snapshot = readJson(getRuntimeLiveSnapshotPath(root));
	return join(root, snapshot.saved_result_path as string);
}

function getCliKernelPaths(root: string): {
	baselinePath: string;
	scenarioPath: string;
} {
	return {
		baselinePath: join(
			root,
			".afol",
			"data",
			"benchmarks",
			"catalog",
			"baselines",
			"cli-kernel-local",
			"baseline-v1.json",
		),
		scenarioPath: join(
			root,
			".afol",
			"data",
			"benchmarks",
			"catalog",
			"scenarios",
			"cli-kernel-local",
			"cli-status-json.json",
		),
	};
}

function gitFixtureValue(root: string, args: string[]): string {
	const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(result.stderr || `git ${args.join(" ")} failed`);
	}
	return result.stdout.trim();
}

function createProvenanceFixtures(root: string): {
	scenario: Scenario;
	baseline: Baseline;
	commitTime: Date;
	commit: string;
} {
	const commit = gitFixtureValue(root, ["rev-parse", "HEAD"]);
	const commitTime = new Date(
		gitFixtureValue(root, ["show", "-s", "--format=%cI", commit]),
	);
	const timestamp = commitTime.toISOString();
	return {
		scenario: {
			schema_version: "1.0.0",
			scenario_id: "provenance-fixture",
			scenario_version: "1.0.0",
			pack_id: "evolution-core",
			result_schema: "1.0.0",
			oracle: "fixture",
			thresholds: { max_duration_ms: 1000 },
			baseline_id: "provenance-fixture-v1",
			deterministic_metrics: { duration_ms: 1 },
			measurement: {
				status: "observed",
				source: "fixture",
				sample_count: 3,
				warmup_count: 1,
				git_commit: commit,
				timestamp,
			},
		},
		baseline: {
			baseline_id: "provenance-fixture-v1",
			pack_id: "evolution-core",
			schema_version: "1.0.0",
			sample_count: 3,
			warmup_count: 1,
			git_commit: commit,
			timestamp,
			provenance: "fixture",
		},
		commitTime,
		commit,
	};
}

describe("validate shared helpers", () => {
	test("validate known values and reject invalid inputs", () => {
		expect(isObject({ ok: true })).toBe(true);
		expect(isObject(null)).toBe(false);
		expect(isObject([1, 2, 3])).toBe(false);

		expect(asString("  keep spaces  ", "name")).toBe("  keep spaces  ");
		expect(() => asString("   ", "name")).toThrow(
			/Invalid or missing string field: name/,
		);
		expect(() => asString(1, "name")).toThrow(
			/Invalid or missing string field: name/,
		);

		expect(asNumberRecord({ a: 1, b: 2 }, "thresholds")).toEqual({
			a: 1,
			b: 2,
		});
		expect(() => asNumberRecord({ a: Number.NaN }, "thresholds")).toThrow(
			/Invalid numeric threshold field: thresholds.a/,
		);
		expect(() => asNumberRecord("bad", "thresholds")).toThrow(
			/Invalid or missing object field: thresholds/,
		);

		expect(asOptionalNumber(undefined, "value")).toBeUndefined();
		expect(asOptionalNumber(12, "value")).toBe(12);
		expect(() => asOptionalNumber("bad", "value")).toThrow(
			/Invalid numeric field: value/,
		);

		expect(asOptionalObject(undefined, "meta")).toBeUndefined();
		expect(asOptionalObject({ a: 1 }, "meta")).toEqual({ a: 1 });
		expect(() => asOptionalObject([], "meta")).toThrow(
			/Invalid object field: meta/,
		);

		expect(asBoolean(true, "flag")).toBe(true);
		expect(() => asBoolean("true", "flag")).toThrow(
			/Invalid boolean field: flag/,
		);

		expect(asOptionalString(undefined, "label")).toBeUndefined();
		expect(asOptionalString("alpha", "label")).toBe("alpha");
		expect(() => asOptionalString("  ", "label")).toThrow(
			/Invalid optional string field: label/,
		);

		const root = mkdtempSync(join(tmpdir(), "validate-shared-"));
		try {
			const jsonPath = join(root, "sample.json");
			writeFileSync(jsonPath, JSON.stringify({ ok: true }), "utf8");
			expect(loadJsonObject(jsonPath)).toEqual({ ok: true });
			expect(() => loadJsonObject(join(root, "missing.json"))).toThrow(
				/Missing required file:/,
			);
			writeFileSync(jsonPath, "[]", "utf8");
			expect(() => loadJsonObject(jsonPath)).toThrow(/Invalid JSON object:/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("validate output helpers", () => {
	test("emit json, trim tails, and summarize registries", () => {
		const snapshot = loadRegistry(process.cwd());
		const { result: status, stdout } = withCapturedStdout(() =>
			outputJson({ hello: "world" }),
		);
		expect(status).toBe(0);
		expect(stdout).toEqual(['{"hello":"world"}\n']);

		const jsonWithStatus = withCapturedStdout(() =>
			outputJsonWithStatus({ status: "ok" }, 7),
		);
		expect(jsonWithStatus.result).toBe(7);
		expect(jsonWithStatus.stdout).toEqual(['{"status":"ok"}\n']);

		expect(outputTail("short")).toBe("short");
		expect(outputTail("x".repeat(4100))).toHaveLength(4000);
		expect(outputTail("x".repeat(4100))).toBe("x".repeat(4000));

		const summary = registrySummary(snapshot);
		expect(summary).toHaveLength(16);
		expect(summary[0]).toMatchObject({
			pack_id: "cli-kernel-local",
			min_scenarios: 6,
			scenario_count: 8,
			baseline_present: true,
		});
		expect(
			summary.find((entry) => entry.pack_id === "evolution-core")
				?.baseline_present,
		).toBe(true);
	});
});

describe("validate selector", () => {
	test("selects packs by scope and changed paths", () => {
		expect(selectPacks({ scope: "wb", changedPaths: [] })).toEqual({
			selected_pack_ids: ["workbench-parity"],
			reasons: ["scope-wb"],
		});
		expect(selectPacks({ scope: "tpl", changedPaths: [] })).toEqual({
			selected_pack_ids: ["cli-kernel-local"],
			reasons: ["scope-tpl"],
		});
		expect(selectPacks({ scope: "update", changedPaths: [] })).toEqual({
			selected_pack_ids: ["update-safety"],
			reasons: ["scope-update"],
		});

		const selection = selectPacks({
			scope: "default",
			changedPaths: [
				".\\cli\\services\\catalog\\rules.ts",
				"cli/services/mutations/trim.ts",
				"docs/notes/prompt-context.md",
				".afol/wb/session/task.md",
				"cli/mcp/adapter.ts",
			],
		});
		expect(selection.selected_pack_ids).toEqual([
			"mcp-parity",
			"mutation-safety",
			"routing-accuracy",
			"token-economy",
			"workbench-parity",
		]);
		expect(selection.reasons).toEqual(
			expect.arrayContaining([
				"routing-change:.\\cli\\services\\catalog\\rules.ts",
				"mutation-change:cli/services/mutations/trim.ts",
				"prompt-context-doc-change:docs/notes/prompt-context.md",
				"workbench-change:.afol/wb/session/task.md",
				"mcp-change:cli/mcp/adapter.ts",
			]),
		);

		expect(
			selectPacks({
				scope: "default",
				changedPaths: ["cli/services/evolution/journal.ts"],
			}),
		).toEqual({
			selected_pack_ids: ["evolution-core"],
			reasons: ["evolution-change:cli/services/evolution/journal.ts"],
		});

		expect(selectPacks({ scope: "default", changedPaths: [] })).toEqual({
			selected_pack_ids: [
				"cli-kernel-local",
				"evolution-core",
				"routing-accuracy",
				"mutation-safety",
				"update-safety",
				"workbench-parity",
				"mcp-parity",
				"runtime-live-agent",
				"token-economy",
				"pstr-integrity",
				"context-bundles",
				"state-projection",
				"memory-governance",
				"library-knowledge",
				"governance-history",
				"adm-governance",
			],
			reasons: ["default-no-paths"],
		});
	});
});

describe("validate registry", () => {
	test("accepts an observed baseline bound to an ancestor commit", () => {
		const root = createFixtureRoot();
		try {
			const fixture = createProvenanceFixtures(root);
			expect(
				validateBenchmarkProvenance(
					root,
					fixture.scenario,
					fixture.baseline,
					new Date(fixture.commitTime.getTime() + 1_000),
				),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects missing and mismatched observed metadata", () => {
		const root = createFixtureRoot();
		try {
			const fixture = createProvenanceFixtures(root);
			const missing = {
				...fixture.scenario,
				measurement: { ...fixture.scenario.measurement, source: undefined },
			} as unknown as Scenario;
			expect(
				validateBenchmarkProvenance(
					root,
					missing,
					fixture.baseline,
					new Date(fixture.commitTime.getTime() + 1_000),
				),
			).toContain(
				"benchmark-provenance-missing:evolution-core:provenance-fixture:measurement.source",
			);
			expect(
				validateBenchmarkProvenance(
					root,
					fixture.scenario,
					{ ...fixture.baseline, sample_count: 4 },
					new Date(fixture.commitTime.getTime() + 1_000),
				),
			).toContain(
				"benchmark-provenance-mismatch:evolution-core:provenance-fixture:sample_count",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects unknown and non-ancestor commits", () => {
		const root = createFixtureRoot();
		try {
			const fixture = createProvenanceFixtures(root);
			const unknownCommit = "f".repeat(40);
			expect(
				validateBenchmarkProvenance(
					root,
					{
						...fixture.scenario,
						measurement: {
							...fixture.scenario.measurement,
							git_commit: unknownCommit,
						},
					},
					{ ...fixture.baseline, git_commit: unknownCommit },
					new Date(fixture.commitTime.getTime() + 1_000),
				),
			).toContain(
				`benchmark-provenance-commit-not-found:evolution-core:provenance-fixture:${unknownCommit}`,
			);

			const orphan = gitFixtureValue(root, ["mktree"]);
			const nonAncestor = spawnSync("git", ["commit-tree", orphan], {
				cwd: root,
				encoding: "utf8",
				input: "non-ancestor\n",
			}).stdout.trim();
			expect(nonAncestor).toMatch(/^[0-9a-f]{40}$/);
			expect(
				validateBenchmarkProvenance(
					root,
					{
						...fixture.scenario,
						measurement: {
							...fixture.scenario.measurement,
							git_commit: nonAncestor,
						},
					},
					{ ...fixture.baseline, git_commit: nonAncestor },
					new Date(fixture.commitTime.getTime() + 1_000),
				),
			).toContain(
				`benchmark-provenance-commit-not-ancestor:evolution-core:provenance-fixture:${nonAncestor}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects timestamps before the recorded commit", () => {
		const root = createFixtureRoot();
		try {
			const fixture = createProvenanceFixtures(root);
			const beforeCommit = new Date(
				fixture.commitTime.getTime() - 1_000,
			).toISOString();
			const issues = validateBenchmarkProvenance(
				root,
				{
					...fixture.scenario,
					measurement: {
						...fixture.scenario.measurement,
						timestamp: beforeCommit,
					},
				},
				{ ...fixture.baseline, timestamp: beforeCommit },
				new Date(fixture.commitTime.getTime() + 1_000),
			);
			expect(issues).toEqual(
				expect.arrayContaining([
					"benchmark-provenance-timestamp-before-commit:evolution-core:provenance-fixture:measurement.timestamp",
					"benchmark-provenance-timestamp-before-commit:evolution-core:provenance-fixture:baseline.timestamp",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects timestamps in the future", () => {
		const root = createFixtureRoot();
		try {
			const fixture = createProvenanceFixtures(root);
			const now = new Date(fixture.commitTime.getTime() + 1_000);
			const future = new Date(now.getTime() + 1_000).toISOString();
			const issues = validateBenchmarkProvenance(
				root,
				{
					...fixture.scenario,
					measurement: { ...fixture.scenario.measurement, timestamp: future },
				},
				{ ...fixture.baseline, timestamp: future },
				now,
			);
			expect(issues).toEqual(
				expect.arrayContaining([
					"benchmark-provenance-timestamp-future:evolution-core:provenance-fixture:measurement.timestamp",
					"benchmark-provenance-timestamp-future:evolution-core:provenance-fixture:baseline.timestamp",
				]),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("loads the real catalog and flags contract issues", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			expect(snapshot.schema_version).toBe("1.0.0");
			expect(snapshot.packs).toHaveLength(16);
			expect(snapshot.scenariosByPack["runtime-live-agent"]).toHaveLength(4);
			expect(
				snapshot.scenariosByPack["pstr-integrity"]
					?.map((scenario) => scenario.scenario_id)
					.sort(),
			).toEqual([
				"pstr-detect",
				"pstr-diff",
				"pstr-rebuild",
				"pstr-review",
				"pstr-review-apply",
				"pstr-section",
				"pstr-show",
				"pstr-stale",
				"pstr-suggest",
				"pstr-validate",
				"pstr-watch-once",
			]);
			expect(snapshot.scenariosByPack["context-bundles"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["state-projection"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["memory-governance"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["library-knowledge"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["governance-history"]).toHaveLength(7);
			expect(snapshot.scenariosByPack["adm-governance"]).toHaveLength(4);
			const shortWorkbenchCommands = [
				"wb-short-start",
				"wb-short-done",
				"wb-short-close",
			]
				.map((scenarioId) =>
					snapshot.scenariosByPack["workbench-parity"]?.find(
						(scenario) => scenario.scenario_id === scenarioId,
					),
				)
				.filter((scenario): scenario is Scenario => scenario !== undefined);
			expect(shortWorkbenchCommands).toHaveLength(3);
			expect(
				shortWorkbenchCommands.reduce(
					(total, scenario) =>
						total + Array.from(scenario.command ?? "").length,
					0,
				),
			).toBeLessThanOrEqual(120);
			for (const scenario of shortWorkbenchCommands) {
				expect(scenario.thresholds.max_p95_ms).toBeLessThanOrEqual(300);
				expect(scenario.thresholds.max_argv_chars).toBeDefined();
				expect(scenario.compiled_binary).toBe(true);
			}
			expect(
				snapshot.scenariosByPack["workbench-parity"]?.every(
					(scenario) => scenario.compiled_binary === true,
				),
			).toBe(true);
			const mutationScenarios =
				snapshot.scenariosByPack["mutation-safety"] ?? [];
			expect(mutationScenarios).toHaveLength(5);
			for (const scenario of mutationScenarios) {
				expect(scenario.compiled_binary).toBe(true);
				expect(scenario.thresholds.max_duration_ms).toBeLessThanOrEqual(300);
				expect(scenario.thresholds.max_p95_ms).toBeLessThanOrEqual(350);
			}
			const mutationBaseline = snapshot.baselinesByPack["mutation-safety"] as
				| (Baseline & {
						scenarios?: Record<
							string,
							{
								scenario_id?: string;
								scenario_version?: string;
								timing_p50_ms?: number;
								timing_p95_ms?: number;
								sample_count?: number;
								warmup_count?: number;
							}
						>;
				  })
				| undefined;
			expect(mutationBaseline).toMatchObject({
				calibration_status: "observed",
				source_repository: "github.com/evandro-miguel/afol",
				sample_count: 20,
				warmup_count: 1,
			});
			expect(mutationBaseline?.artifact_sha256).toMatch(/^[a-f0-9]{64}$/u);
			expect(mutationBaseline?.git_commit).toMatch(/^[a-f0-9]{40}$/u);
			expect(mutationBaseline?.timestamp).toBeDefined();
			expect(Object.keys(mutationBaseline?.scenarios ?? {}).sort()).toEqual(
				mutationScenarios.map((scenario) => scenario.scenario_id).sort(),
			);
			const sequentialDone = snapshot.scenariosByPack["workbench-parity"]?.find(
				(scenario) => scenario.scenario_id === "wb-sequential-done",
			);
			expect(sequentialDone).toBeDefined();
			const sequentialCommand = sequentialDone?.command ?? "";
			const oneStepCommand = 'afol d T-01 -x "bun --version"';
			expect(sequentialCommand.match(/(?:^| )-x /g)).toHaveLength(8);
			expect(Array.from(sequentialCommand)).toHaveLength(163);
			expect(Array.from(sequentialCommand).length).toBeLessThan(
				Array.from(oneStepCommand).length * 8,
			);
			expect(sequentialDone?.thresholds).toMatchObject({
				max_argv_chars: 239,
				max_output_tokens: 500,
			});
			expect(snapshot.coverage?.exemptions).toHaveLength(0);
			expect(snapshot.coverage?.subcommand_exemptions).toHaveLength(0);
			expect(
				snapshot.scenariosByPack["runtime-live-agent"]?.find(
					(scenario) => scenario.scenario_id === "live-governed-task",
				)?.coverage?.commands,
			).toEqual(["new", "start", "evidence", "done", "close"]);
			const featureSpecScenario = snapshot.scenariosByPack[
				"governance-history"
			]?.find(
				(scenario) => scenario.scenario_id === "feature-spec-coverage-matrix",
			);
			expect(featureSpecScenario?.coverage?.features).toContain("F-20");
			expect(featureSpecScenario?.coverage?.specs).toContain(
				"260426_1215_parallel-session-isolation_spec_01",
			);
			expect(featureSpecScenario?.coverage?.features).toContain("F-19");
			expect(featureSpecScenario?.coverage?.specs).toContain(
				"260627_1655_canonical-afol-configuration-rehome_spec_01",
			);
			expect(featureSpecScenario?.coverage?.features).toContain("F-21");
			expect(featureSpecScenario?.coverage?.specs).toContain(
				"260710_1256_typescript-7-toolchain-adoption_spec_01",
			);
			expect(featureSpecScenario?.coverage?.features).toContain("F-29");
			expect(featureSpecScenario?.coverage?.specs).toContain(
				"260726_governance-contract-reconciliation_spec-child_01",
			);
			const uxRegistryScenario = snapshot.scenariosByPack[
				"governance-history"
			]?.find((scenario) => scenario.scenario_id === "ux-registry-lifecycle");
			expect(uxRegistryScenario?.thresholds).toMatchObject({
				max_duration_ms: 300,
				max_p95_ms: 300,
				max_output_tokens: 500,
				min_tool_success_rate: 0.98,
			});
			expect(uxRegistryScenario?.coverage?.commands).toEqual(
				expect.arrayContaining(["ux", "maintenance"]),
			);
			expect(uxRegistryScenario?.coverage?.subcommands).toContain(
				"ux validate",
			);
			expect(uxRegistryScenario?.coverage?.journeys).toContain(
				"ux-journey-registry-control",
			);
			expect(snapshot.baselinesByPack["cli-kernel-local"]?.timing_p50_ms).toBe(
				200,
			);
			const contractIssues = validateRegistryContract(snapshot);
			const mutationIssues = contractIssues.filter((issue) =>
				issue.startsWith("mutation-"),
			);
			expect(mutationIssues).toEqual([]);
			expect(contractIssues).not.toContain(
				"scenario-feature-coverage-missing:F-30",
			);

			const evolutionScenarios = snapshot.scenariosByPack["evolution-core"];
			if (!evolutionScenarios?.[0]) {
				throw new Error("Expected evolution-core scenario fixture");
			}
			const evolutionBaseline = snapshot.baselinesByPack["evolution-core"];
			if (!evolutionBaseline) {
				throw new Error("Expected evolution-core baseline fixture");
			}
			expect(evolutionScenarios[0].scenario_version).toBe("1.1.0");
			expect(evolutionScenarios[0].baseline_id).toBe("evolution-core-v2");
			expect(evolutionBaseline.baseline_id).toBe("evolution-core-v2");
			const missingEvolutionScenario = { ...evolutionScenarios[0] };
			delete missingEvolutionScenario.measurement;
			const missingEvolutionMeasurement: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"evolution-core": [
						missingEvolutionScenario,
						...evolutionScenarios.slice(1),
					],
				},
			};
			expect(validateRegistryContract(missingEvolutionMeasurement)).toContain(
				`benchmark-provenance-missing:evolution-core:${evolutionScenarios[0].scenario_id}:measurement`,
			);
			const missingStatus = { ...missingEvolutionScenario };
			delete missingStatus.implementation_status;
			const skippedStatus = {
				...missingEvolutionScenario,
				implementation_status: "skipped" as const,
			};
			const invalidStatus = {
				...missingEvolutionScenario,
				implementation_status: "invalid",
			} as unknown as Scenario;
			for (const [scenario, status] of [
				[missingStatus, "missing"],
				[skippedStatus, "skipped"],
				[invalidStatus, "invalid"],
			] as const) {
				const issues = validateRegistryContract({
					...snapshot,
					scenariosByPack: {
						...snapshot.scenariosByPack,
						"evolution-core": [scenario],
					},
				});
				expect(issues).toContain(
					`scenario-implementation-status-required:evolution-core:${evolutionScenarios[0].scenario_id}:${status}`,
				);
				expect(issues).toContain(
					`benchmark-provenance-missing:evolution-core:${evolutionScenarios[0].scenario_id}:measurement`,
				);
			}
			const mismatchedPack = {
				...evolutionScenarios[0],
				pack_id: "cli-kernel-local" as const,
			};
			expect(
				validateRegistryContract({
					...snapshot,
					scenariosByPack: {
						...snapshot.scenariosByPack,
						"evolution-core": [mismatchedPack],
					},
				}),
			).toContain(
				`scenario-pack-mismatch:evolution-core:${evolutionScenarios[0].scenario_id}`,
			);
			const weakSampleScenario = {
				...evolutionScenarios[0],
				measurement: {
					...evolutionScenarios[0].measurement,
					sample_count: 1,
				},
			};
			const weakSampleIssues = validateRegistryContract({
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"evolution-core": [weakSampleScenario],
				},
				baselinesByPack: {
					...snapshot.baselinesByPack,
					"evolution-core": {
						...evolutionBaseline,
						sample_count: 1,
					},
				},
			});
			expect(weakSampleIssues).toContain(
				`benchmark-provenance-sample-count-required:evolution-core:${evolutionScenarios[0].scenario_id}:3`,
			);

			const cliKernelScenarios = snapshot.scenariosByPack["cli-kernel-local"];
			const routingScenarios = snapshot.scenariosByPack["routing-accuracy"];
			if (!cliKernelScenarios) {
				throw new Error("Expected cli-kernel-local scenarios fixture");
			}
			if (!routingScenarios) {
				throw new Error("Expected routing-accuracy scenarios fixture");
			}
			const cliKernelScenario = cliKernelScenarios[0];
			const routingScenario = routingScenarios[0];
			const cliKernelBaseline = snapshot.baselinesByPack["cli-kernel-local"];
			if (!cliKernelScenario) {
				throw new Error("Expected cli-kernel-local scenario fixture");
			}
			if (!routingScenario) {
				throw new Error("Expected routing-accuracy scenario fixture");
			}
			if (!cliKernelBaseline) {
				throw new Error("Expected cli-kernel-local baseline fixture");
			}
			const brokenBaselinesByPack = {
				...snapshot.baselinesByPack,
			} as Record<string, typeof cliKernelBaseline>;
			delete brokenBaselinesByPack["routing-accuracy"];
			brokenBaselinesByPack["cli-kernel-local"] = {
				...cliKernelBaseline,
				schema_version: "0.0.0",
			};
			const brokenSnapshot: RegistrySnapshot = {
				...snapshot,
				packs: snapshot.packs.filter(
					(entry) => entry.pack_id !== "token-economy",
				),
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							pack_id: "routing-accuracy",
							schema_version: "0.0.0",
							result_schema: "0.0.0",
							oracle: "",
							thresholds: {},
						},
					],
					"routing-accuracy": [routingScenario],
				},
				baselinesByPack: brokenBaselinesByPack,
			};
			const issues = validateRegistryContract(brokenSnapshot);
			const cliKernelScenarioId = cliKernelScenario.scenario_id;
			expect(issues).toContain("missing-pack:token-economy");
			expect(issues).toContain("insufficient-scenarios:cli-kernel-local:1<6");
			expect(issues).toContain(
				`scenario-pack-mismatch:cli-kernel-local:${cliKernelScenarioId}`,
			);
			expect(issues).toContain(
				`scenario-schema-version-mismatch:cli-kernel-local:${cliKernelScenarioId}:0.0.0`,
			);
			expect(
				issues.some((issue) =>
					issue.startsWith(
						`scenario-schema-mismatch:cli-kernel-local:${cliKernelScenarioId}`,
					),
				),
			).toBe(true);
			expect(
				issues.some((issue) =>
					issue.startsWith(
						`scenario-contract-missing:cli-kernel-local:${cliKernelScenarioId}`,
					),
				),
			).toBe(true);
			expect(issues).toContain("insufficient-scenarios:routing-accuracy:1<4");
			expect(issues).toContain("missing-baseline:routing-accuracy");
			expect(issues).toContain(
				"baseline-schema-version-mismatch:cli-kernel-local:0.0.0",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires an explicit supported implementation status", () => {
		const root = createFixtureRoot();
		try {
			const scenarioPath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"scenarios",
				"cli-kernel-local",
				"cli-status-json.json",
			);
			const scenario = readJson(scenarioPath);
			delete scenario.implementation_status;
			writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
			expect(() => loadRegistry(root)).toThrow(
				"Invalid or missing implementation_status field",
			);
			writeFileSync(
				scenarioPath,
				`${JSON.stringify({ ...scenario, implementation_status: "invented" }, null, 2)}\n`,
			);
			expect(() => loadRegistry(root)).toThrow(
				"Invalid or missing implementation_status field",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on missing or noncanonical roadmap/spec statuses", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const originalRoadmap = readFileSync(roadmapPath, "utf8");
			const f30Start = originalRoadmap.indexOf("### F-30 ");
			const f30End = originalRoadmap.indexOf("\n### ", f30Start + 1);
			const f30Section = originalRoadmap.slice(
				f30Start,
				f30End === -1 ? undefined : f30End,
			);
			for (const [statusLine, expected] of [
				["- Status:", "roadmap-feature-status-invalid:F-30:missing"],
				["- Status: Active", "roadmap-feature-status-invalid:F-30:Active"],
				["- Status: actve", "roadmap-feature-status-invalid:F-30:actve"],
			] as const) {
				writeFileSync(
					roadmapPath,
					originalRoadmap.replace(
						f30Section,
						f30Section.replace(/^- Status:.*$/m, statusLine),
					),
					"utf8",
				);
				const issues = validateRegistryContract(snapshot);
				expect(issues).toContain(expected);
				expect(issues).not.toContain("scenario-feature-coverage-missing:F-30");
			}
			writeFileSync(
				roadmapPath,
				originalRoadmap.replace(
					f30Section,
					f30Section.replace(/^- Status:.*$/m, "- Status: final"),
				),
				"utf8",
			);
			expect(validateRegistryContract(snapshot)).not.toContain(
				"scenario-feature-coverage-missing:F-30",
			);

			const specId = "260717_agent-submission-and-batch-review_spec_01";
			const specPath = join(root, ".afol", "adm", "specs", `${specId}.md`);
			const originalSpec = readFileSync(specPath, "utf8");
			for (const [status, expected] of [
				["", `spec-status-invalid:${specId}:missing`],
				["Final", `spec-status-invalid:${specId}:Final`],
				["actve", `spec-status-invalid:${specId}:actve`],
			] as const) {
				writeFileSync(
					specPath,
					originalSpec.replace(
						/^status:.*$/m,
						status ? `status: ${status}` : "status:",
					),
					"utf8",
				);
				const issues = validateRegistryContract(snapshot);
				expect(issues).toContain(expected);
				expect(issues).not.toContain(
					`scenario-spec-coverage-missing:${specId}`,
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("enforces tool and journey coverage metadata", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			if (!snapshot.coverage) {
				throw new Error("Expected benchmark coverage policy fixture");
			}
			const subcommandExemptions = snapshot.coverage.subcommand_exemptions;
			if (subcommandExemptions === undefined) {
				throw new Error("Expected benchmark subcommand coverage fixture");
			}
			const { coverage: _coverage, ...withoutCoverage } = snapshot;
			expect(validateRegistryContract(withoutCoverage)).toContain(
				"tool-coverage-policy-missing",
			);

			const withoutSurfaceCoverageFor = (
				command: string,
				subcommand: string,
			): RegistrySnapshot => {
				const governanceScenarios =
					snapshot.scenariosByPack["governance-history"];
				if (!governanceScenarios) {
					throw new Error("Expected governance-history scenarios fixture");
				}
				const surfaceScenario = governanceScenarios.find(
					(scenario) => scenario.scenario_id === "tool-surface-coverage-matrix",
				);
				if (!surfaceScenario) {
					throw new Error("Expected tool surface coverage scenario fixture");
				}
				return {
					...snapshot,
					scenariosByPack: {
						...snapshot.scenariosByPack,
						"governance-history": governanceScenarios.map((scenario) =>
							scenario.scenario_id === surfaceScenario.scenario_id
								? {
										...scenario,
										coverage: {
											commands: (scenario.coverage?.commands ?? []).filter(
												(entry) => entry !== command,
											),
											subcommands: (
												scenario.coverage?.subcommands ?? []
											).filter((entry) => entry !== subcommand),
											journeys: scenario.coverage?.journeys ?? [],
										},
									}
								: scenario,
						),
					},
				};
			};
			const withoutInitCoverage = withoutSurfaceCoverageFor(
				"init",
				"init --dry-run",
			);
			expect(validateRegistryContract(withoutInitCoverage)).toContain(
				"tool-coverage-missing:init",
			);
			const withoutSubcommandPolicy: RegistrySnapshot = {
				...snapshot,
				coverage: {
					schema_version: snapshot.coverage.schema_version,
					exemptions: snapshot.coverage.exemptions,
				},
			};
			expect(validateRegistryContract(withoutSubcommandPolicy)).toContain(
				"tool-subcommand-coverage-policy-missing",
			);
			expect(validateRegistryContract(withoutInitCoverage)).toContain(
				"tool-subcommand-coverage-missing:init --dry-run",
			);
			const governanceScenarios =
				snapshot.scenariosByPack["governance-history"];
			if (!governanceScenarios) {
				throw new Error("Expected governance-history scenarios fixture");
			}
			const featureSpecScenario = governanceScenarios.find(
				(scenario) => scenario.scenario_id === "feature-spec-coverage-matrix",
			);
			if (!featureSpecScenario?.coverage?.features?.length) {
				throw new Error("Expected feature coverage scenario fixture");
			}
			if (!featureSpecScenario.coverage.specs?.length) {
				throw new Error("Expected spec coverage scenario fixture");
			}
			const withoutF21FeatureCoverage: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"governance-history": governanceScenarios.map((scenario) =>
						scenario.scenario_id === featureSpecScenario.scenario_id
							? {
									...scenario,
									coverage: {
										commands: scenario.coverage?.commands ?? [],
										subcommands: scenario.coverage?.subcommands ?? [],
										journeys: scenario.coverage?.journeys ?? [],
										features: (scenario.coverage?.features ?? []).filter(
											(entry) => entry !== "F-21",
										),
										specs: scenario.coverage?.specs ?? [],
									},
								}
							: scenario,
					),
				},
			};
			expect(validateRegistryContract(withoutF21FeatureCoverage)).toContain(
				"scenario-feature-coverage-missing:F-21",
			);
			const f21SpecId = "260710_1256_typescript-7-toolchain-adoption_spec_01";
			const withoutF21SpecCoverage: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"governance-history": governanceScenarios.map((scenario) =>
						scenario.scenario_id === featureSpecScenario.scenario_id
							? {
									...scenario,
									coverage: {
										commands: scenario.coverage?.commands ?? [],
										subcommands: scenario.coverage?.subcommands ?? [],
										journeys: scenario.coverage?.journeys ?? [],
										features: scenario.coverage?.features ?? [],
										specs: (scenario.coverage?.specs ?? []).filter(
											(entry) => entry !== f21SpecId,
										),
									},
								}
							: scenario,
					),
				},
			};
			expect(validateRegistryContract(withoutF21SpecCoverage)).toContain(
				`scenario-spec-coverage-missing:${f21SpecId}`,
			);
			const roadmapPath = join(
				root,
				".afol",
				"adm",
				"roadmap",
				"GENERAL-ROADMAP.md",
			);
			const originalRoadmap = readFileSync(roadmapPath, "utf8");
			writeFileSync(
				roadmapPath,
				originalRoadmap.replace(
					"  .afol/adm/specs/260627_1655_canonical-afol-configuration-rehome_spec_01.md",
					"  TBD",
				),
				"utf8",
			);
			expect(validateRegistryContract(snapshot)).toContain(
				"roadmap-feature-governing-spec-missing:F-19",
			);
			writeFileSync(roadmapPath, originalRoadmap, "utf8");
			const f20SpecPath = join(
				root,
				".afol",
				"adm",
				"specs",
				"260426_1215_parallel-session-isolation_spec_01.md",
			);
			const originalF20Spec = readFileSync(f20SpecPath, "utf8");
			writeFileSync(
				f20SpecPath,
				originalF20Spec.replace(
					"roadmap_feature: F-20",
					"roadmap_feature: F-99",
				),
				"utf8",
			);
			expect(validateRegistryContract(snapshot)).toContain(
				"spec-roadmap-feature-unknown:260426_1215_parallel-session-isolation_spec_01:F-99",
			);
			writeFileSync(f20SpecPath, originalF20Spec, "utf8");

			const cliKernelScenarios = snapshot.scenariosByPack["cli-kernel-local"];
			const cliKernelScenario = cliKernelScenarios?.find(
				(scenario) => scenario.implementation_status === "implemented",
			);
			if (!cliKernelScenarios || !cliKernelScenario) {
				throw new Error("Expected cli-kernel-local scenarios fixture");
			}
			const unknownScenarioCoverage: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							coverage: { commands: ["not-a-command"] },
						},
						...cliKernelScenarios.slice(1),
					],
				},
			};
			expect(validateRegistryContract(unknownScenarioCoverage)).toContain(
				`scenario-tool-coverage-unknown:cli-kernel-local:${cliKernelScenario.scenario_id}:not-a-command`,
			);
			const plannedUnknownCoverage: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							implementation_status: "planned",
							coverage: {
								commands: ["not-a-command"],
								subcommands: ["status --definitely-nope"],
								journeys: ["fixture-journey"],
							},
						},
						...cliKernelScenarios.slice(1),
					],
				},
			};
			expect(validateRegistryContract(plannedUnknownCoverage)).toEqual(
				expect.arrayContaining([
					`scenario-tool-coverage-unknown:cli-kernel-local:${cliKernelScenario.scenario_id}:not-a-command`,
					`scenario-tool-subcommand-coverage-unknown:cli-kernel-local:${cliKernelScenario.scenario_id}:status --definitely-nope`,
				]),
			);
			const unknownScenarioSubcommandCoverage: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							coverage: { subcommands: ["status --definitely-nope"] },
						},
						...cliKernelScenarios.slice(1),
					],
				},
			};
			expect(
				validateRegistryContract(unknownScenarioSubcommandCoverage),
			).toContain(
				`scenario-tool-subcommand-coverage-unknown:cli-kernel-local:${cliKernelScenario.scenario_id}:status --definitely-nope`,
			);

			const unknownExemption: RegistrySnapshot = {
				...snapshot,
				coverage: {
					...snapshot.coverage,
					exemptions: [
						...snapshot.coverage.exemptions,
						{ command: "not-a-command", reason: "fixture" },
					],
				},
			};
			expect(validateRegistryContract(unknownExemption)).toContain(
				"tool-coverage-exemption-unknown:not-a-command",
			);
			const unknownSubcommandExemption: RegistrySnapshot = {
				...snapshot,
				coverage: {
					...snapshot.coverage,
					subcommand_exemptions: [
						...subcommandExemptions,
						{ subcommand: "status --definitely-nope", reason: "fixture" },
					],
				},
			};
			expect(validateRegistryContract(unknownSubcommandExemption)).toContain(
				"tool-subcommand-coverage-exemption-unknown:status --definitely-nope",
			);

			const skippedScenarioDoesNotCover: RegistrySnapshot = {
				...withoutInitCoverage,
				scenariosByPack: {
					...withoutInitCoverage.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							scenario_id: "skipped-init-coverage",
							coverage: {
								commands: ["init"],
								subcommands: ["init --dry-run"],
								journeys: ["fixture-journey"],
							},
							implementation_status: "skipped",
						},
						...cliKernelScenarios.slice(1),
					],
				},
			};
			const skippedCoverageIssues = validateRegistryContract(
				skippedScenarioDoesNotCover,
			);
			expect(skippedCoverageIssues).toContain("tool-coverage-missing:init");
			expect(skippedCoverageIssues).toContain(
				"tool-subcommand-coverage-missing:init --dry-run",
			);

			const implementedScenarioWithoutJourney: RegistrySnapshot = {
				...snapshot,
				scenariosByPack: {
					...snapshot.scenariosByPack,
					"cli-kernel-local": [
						{
							...cliKernelScenario,
							coverage: { commands: ["status"] },
							implementation_status: "implemented",
						},
						...cliKernelScenarios.slice(1),
					],
				},
			};
			expect(
				validateRegistryContract(implementedScenarioWithoutJourney),
			).toContain(
				`scenario-journey-coverage-missing:cli-kernel-local:${cliKernelScenario.scenario_id}`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects missing and non-finite scenario baseline numbers", () => {
		const root = createFixtureRoot();
		try {
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"mutation-safety",
				"baseline-v1.json",
			);
			const baseline = readJson(baselinePath);
			const validScenarioBaseline = {
				scenario_id: "mut-dry-run",
				scenario_version: "1.0.0",
				timing_p50_ms: 100,
				timing_p95_ms: 150,
				sample_count: 20,
				warmup_count: 1,
			};
			for (const [field, value] of [
				["timing_p50_ms", undefined],
				["timing_p95_ms", null],
				["sample_count", "20"],
			] as const) {
				const invalid = { ...validScenarioBaseline } as Record<string, unknown>;
				if (value === undefined) delete invalid[field];
				else invalid[field] = value;
				writeFileSync(
					baselinePath,
					`${JSON.stringify(
						{
							...baseline,
							scenarios: { "mut-dry-run": invalid },
						},
						null,
						2,
					)}\n`,
				);
				expect(() => loadRegistry(root)).toThrow(
					`Invalid or missing finite numeric field: ${baselinePath}.scenarios.mut-dry-run.${field}`,
				);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validates mutation baseline provenance and calibration identity", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const commit = spawnSync("git", ["rev-parse", "HEAD"], {
				cwd: root,
				encoding: "utf8",
			}).stdout.trim();
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "mutation-provenance",
				scenario_version: "1.0.0",
				pack_id: "mutation-safety",
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 300 },
				baseline_id: "mutation-safety-v1",
				deterministic_metrics: {},
				compiled_binary: true,
			};
			const baseline: Baseline = {
				baseline_id: "mutation-safety-v1",
				pack_id: "mutation-safety",
				schema_version: "1.0.0",
				host_profile_id: "linux-x64-amd-epyc",
				os: "linux",
				arch: "x64",
				cpu_class: "amd-epyc",
				bun_version: Bun.version,
				runtime_version: Bun.version,
				execution_mode: "compiled-release",
				artifact_mode: "bun-compile",
				artifact_sha256: "a".repeat(64),
				git_commit: commit,
				source_repository: "github.com/evandro-miguel/afol",
				timestamp: new Date().toISOString(),
				provenance: "observed-clean-commit",
				sample_count: 20,
				warmup_count: 1,
				scenarios: {
					[scenario.scenario_id]: {
						scenario_id: scenario.scenario_id,
						scenario_version: scenario.scenario_version,
						timing_p50_ms: 100,
						timing_p95_ms: 150,
						sample_count: 20,
						warmup_count: 1,
					},
				},
			};
			expect(
				validateMutationBaselineContract(root, [scenario], baseline),
			).toEqual([]);
			for (const [patch, expected] of [
				[
					{ git_commit: "baseline-fixture" },
					"mutation-baseline-git-commit-invalid",
				],
				[{ timestamp: "not-a-date" }, "mutation-baseline-timestamp-invalid"],
				[
					{ artifact_sha256: "abc" },
					"mutation-baseline-artifact-sha256-invalid",
				],
				[
					{ host_profile_id: "profile-placeholder" },
					"mutation-baseline-profile-placeholder:host_profile_id",
				],
				[
					{ source_repository: "placeholder" },
					"mutation-baseline-source-repository-invalid",
				],
				[{ sample_count: 19 }, "mutation-baseline-sample-count-required:20"],
			] as const) {
				expect(
					validateMutationBaselineContract(root, [scenario], {
						...baseline,
						...patch,
					}),
				).toContain(expected);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts a portable observed mutation baseline from the AFOL source repository", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "mutation-portable",
				scenario_version: "1.0.0",
				pack_id: "mutation-safety",
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 300 },
				baseline_id: "mutation-safety-v1",
				deterministic_metrics: {},
				compiled_binary: true,
			};
			const baseline = {
				baseline_id: "mutation-safety-v1",
				pack_id: "mutation-safety",
				schema_version: "1.0.0",
				calibration_status: "observed",
				source_repository: "github.com/evandro-miguel/afol",
				host_profile_id: "linux-x64-intel-r-core-tm-i9-14900k",
				os: "linux",
				arch: "x64",
				cpu_class: "intel-r-core-tm-i9-14900k",
				bun_version: Bun.version,
				runtime_version: Bun.version,
				execution_mode: "compiled-release",
				artifact_mode: "bun-compile",
				artifact_sha256: "a".repeat(64),
				git_commit: "4c70a4672b164a65d58e0b7244752bc51fd21711",
				timestamp: new Date().toISOString(),
				provenance: "controlled-local-release-calibration-20260729",
				sample_count: 20,
				warmup_count: 1,
				scenarios: {
					[scenario.scenario_id]: {
						scenario_id: scenario.scenario_id,
						scenario_version: scenario.scenario_version,
						timing_p50_ms: 33,
						timing_p95_ms: 37,
						sample_count: 20,
						warmup_count: 1,
					},
				},
			} satisfies Baseline & { source_repository: string };
			expect(
				validateMutationBaselineContract(root, [scenario], baseline),
			).toEqual([]);
			expect(
				spawnSync(
					"git",
					[
						"remote",
						"add",
						"origin",
						"https://github.com/evandro-miguel/afol.git",
					],
					{ cwd: root },
				).status,
			).toBe(0);
			expect(
				validateMutationBaselineContract(root, [scenario], baseline),
			).toContain("mutation-baseline-git-commit-not-found");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts only an honest minimal pending mutation baseline", () => {
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: "mutation-pending",
			scenario_version: "1.0.0",
			pack_id: "mutation-safety",
			result_schema: "1.0.0",
			oracle: "fixture",
			thresholds: { max_p95_ms: 300 },
			baseline_id: "mutation-safety-v1",
			deterministic_metrics: {},
			compiled_binary: true,
		};
		const pending: Baseline = {
			baseline_id: "mutation-safety-v1",
			pack_id: "mutation-safety",
			schema_version: "1.0.0",
			calibration_status: "pending",
			calibration_reason: "controlled-release-host-required",
		};
		expect(
			validateMutationBaselineContract(undefined, [scenario], pending),
		).toEqual([]);
		expect(
			validateMutationBaselineContract(undefined, [scenario], {
				baseline_id: pending.baseline_id,
				pack_id: pending.pack_id,
				schema_version: pending.schema_version,
				calibration_status: "pending",
			}),
		).toContain("mutation-baseline-calibration-reason-required");
		expect(
			validateMutationBaselineContract(undefined, [scenario], {
				...pending,
				calibration_reason: "placeholder",
			}),
		).toContain("mutation-baseline-calibration-reason-placeholder");
		expect(
			validateMutationBaselineContract(undefined, [scenario], {
				...pending,
				calibration_reason: "a".repeat(65),
			}),
		).toContain("mutation-baseline-calibration-reason-format-invalid");
		expect(
			collectProfileCompatibilityNotes(
				scenario,
				{ ...pending, calibration_reason: "a".repeat(2_000) },
				undefined,
				null,
			),
		).toEqual(["baseline-incompatible:calibration-pending:reason-invalid"]);
		expect(
			validateMutationBaselineContract(
				undefined,
				[{ ...scenario, compiled_binary: false }],
				pending,
			),
		).toContain("mutation-scenario-compiled-release-required:mutation-pending");
		expect(
			validateMutationBaselineContract(undefined, [scenario], {
				...pending,
				provenance: "observed-clean-commit",
				scenarios: {},
			}),
		).toEqual(
			expect.arrayContaining([
				"mutation-baseline-pending-observed-field:provenance",
				"mutation-baseline-pending-observed-field:scenarios",
			]),
		);
	});

	test("parses mutation calibration state strictly", () => {
		const root = createFixtureRoot();
		try {
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"mutation-safety",
				"baseline-v1.json",
			);
			const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
			writeFileSync(
				baselinePath,
				`${JSON.stringify({ ...baseline, calibration_status: "unknown" })}\n`,
			);
			expect(() => loadRegistry(root)).toThrow(
				`Invalid calibration status: ${baselinePath}.calibration_status`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("scenario benchmark execution", () => {
	test("resolves benchmark-owned temp state under .afol/tmp", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-bench-temp-root-"));
		try {
			const resolved = ensureBenchmarkTempRoot(root);
			expect(resolved).toBe(join(root, ".afol", "tmp"));
			expect(existsSync(resolved)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses the canonical release compiler flags", () => {
		expect(compiledReleaseBuildArgs("/fixture/.afol/tmp/release/afol")).toEqual(
			[
				"build",
				"--compile",
				"--bytecode",
				"--format=esm",
				"--no-compile-autoload-dotenv",
				"--no-compile-autoload-bunfig",
				join(process.cwd(), "cli", "main.ts"),
				"--outfile",
				"/fixture/.afol/tmp/release/afol",
			],
		);
	});

	test("detects Bun compiled virtual entrypoints", () => {
		expect(isCompiledBunRuntime("/$bunfs/root/cli/main.ts")).toBe(true);
		expect(isCompiledBunRuntime(join(process.cwd(), "cli", "main.ts"))).toBe(
			false,
		);
	});

	test("uses the running AFOL executable for compiled downstream benchmarks", () => {
		expect(
			resolveAfolExecutable(
				undefined,
				"/$bunfs/root/cli/main.ts",
				"/home/operator/.local/bin/afol",
			),
		).toBe("/home/operator/.local/bin/afol");
		expect(
			resolveAfolExecutable(
				"/fixture/trusted-afol",
				"/$bunfs/root/cli/main.ts",
				"/ignored/current-afol",
			),
		).toBe("/fixture/trusted-afol");
		expect(
			resolveAfolExecutable(
				undefined,
				join(process.cwd(), "cli", "main.ts"),
				process.execPath,
			),
		).toBeNull();
	});

	test("prepares a registered sidecar and executes a compiled mutation", () => {
		const fixtureRoot = createBenchExecutionFixtureRoot();
		let artifact: PreparedCompiledReleaseArtifact | undefined;
		let artifactRoot: string | undefined;
		try {
			cpSync(
				join(process.cwd(), ".afol", "config.json"),
				join(fixtureRoot, ".afol", "config.json"),
			);
			mkdirSync(join(fixtureRoot, ".agents"), { recursive: true });
			for (const metadataFile of ["lock.json", "manifest.json"]) {
				cpSync(
					join(process.cwd(), ".agents", metadataFile),
					join(fixtureRoot, ".agents", metadataFile),
				);
			}
			artifact = prepareCompiledReleaseArtifact(process.cwd());
			artifactRoot = dirname(artifact.binaryPath);
			const provenancePath = `${artifact.binaryPath}.provenance.json`;
			expect(existsSync(provenancePath)).toBe(true);
			const provenance = readJson(provenancePath);
			expect(provenance).toMatchObject({
				artifact: expect.any(String),
				package_name: "afol",
				version: expect.any(String),
				sha256: artifact.profile.artifact_sha256,
				compile_bytecode: true,
				module_format: "esm",
				compile_autoload_dotenv: false,
				compile_autoload_bunfig: false,
			});
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "compiled-mutation-sidecar",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command:
					"afol f pt --session sb-pt --task-id T-01 --reason seed --path tmp/patch-src.txt --append x --json",
				sandbox: true,
				compiled_binary: true,
				setup: [
					[
						"node",
						"-e",
						"const {mkdirSync,writeFileSync}=require('node:fs'); const {join}=require('node:path'); const root=process.cwd(); const session='sb-pt'; const dir=join(root,'.afol','wb',session); mkdirSync(dir,{recursive:true}); writeFileSync(join(root,'.afol','wb','.active_session'), session+'\\n','utf8'); writeFileSync(join(dir,session+'_task_01.md'), ['---','feature_id: F-sb','---','','# Tasks','','| Task | State | Owner | Notes |','|------|-------|-------|-------|','| T-01 | in_progress | worker | seed |',''].join('\\n'),'utf8');",
					],
				],
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 1_000,
					min_tool_success_rate: 1,
				},
				baseline_id: "fixture",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(fixtureRoot, scenario, {
				artifact,
				sampleCount: 3,
				warmupCount: 1,
			});
			expect(result.notes).toEqual([]);
			expect(result.passed).toBe(true);
			expect(result.metrics.error_count).toBe(0);
		} finally {
			artifact?.cleanup();
			rmSync(fixtureRoot, { recursive: true, force: true });
			if (artifactRoot !== undefined) {
				expect(existsSync(artifactRoot)).toBe(false);
			}
		}
	}, 30_000);

	test("prepares one compiled artifact per pack and reuses its identity", () => {
		let prepareCount = 0;
		let cleanupCount = 0;
		const artifact: PreparedCompiledReleaseArtifact = {
			binaryPath: "/fixture/.afol/tmp/afol-bench-release-1/afol",
			profile: {
				host_profile_id: "linux-x64-test",
				os: "linux",
				arch: "x64",
				cpu_class: "test-cpu",
				bun_version: Bun.version,
				runtime_version: Bun.version,
				execution_mode: "compiled-release",
				artifact_mode: "bun-compile",
				artifact_sha256: "a".repeat(64),
			},
			timestamp: "2026-07-28T00:00:00.000Z",
			git_commit: "b".repeat(40),
			source_state_sha256: "c".repeat(64),
			source_dirty: true,
			cleanup: () => {
				cleanupCount += 1;
			},
		};
		const baseScenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: "one",
			scenario_version: "1.0.0",
			pack_id: "mutation-safety",
			result_schema: "1.0.0",
			oracle: "fixture",
			thresholds: { max_p95_ms: 300 },
			baseline_id: "mutation-safety-v1",
			deterministic_metrics: {},
			compiled_binary: true,
		};
		const seenArtifacts = executeScenarioPackWithArtifact(
			"/fixture",
			[
				baseScenario,
				{ ...baseScenario, scenario_id: "two" },
				{ ...baseScenario, scenario_id: "three" },
				{
					...baseScenario,
					scenario_id: "source-only",
					compiled_binary: false,
				},
			],
			(_scenario, prepared) => prepared,
			() => {
				prepareCount += 1;
				return artifact;
			},
		);
		expect(prepareCount).toBe(1);
		expect(cleanupCount).toBe(1);
		expect(seenArtifacts).toHaveLength(4);
		expect(seenArtifacts.slice(0, 3).every((entry) => entry === artifact)).toBe(
			true,
		);
		expect(seenArtifacts[3]).toBeUndefined();
	});

	test("orchestrates cold samples with setup outside measured duration", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-bench-seams-"));
		try {
			const artifactDir = join(
				root,
				".afol",
				"tmp",
				"afol-bench-release-fixture",
			);
			mkdirSync(artifactDir, { recursive: true });
			const artifactPath = join(artifactDir, "afol");
			writeFileSync(artifactPath, "fixture\n");
			const artifact: PreparedCompiledReleaseArtifact = {
				binaryPath: artifactPath,
				profile: {
					host_profile_id: "linux-x64-test",
					os: "linux",
					arch: "x64",
					cpu_class: "test-cpu",
					bun_version: Bun.version,
					runtime_version: Bun.version,
					execution_mode: "compiled-release",
					artifact_mode: "bun-compile",
					artifact_sha256: "a".repeat(64),
				},
				timestamp: "2026-07-28T00:00:00.000Z",
				git_commit: "b".repeat(40),
				source_state_sha256: "c".repeat(64),
				source_dirty: true,
				cleanup: () => {},
			};
			const phases: ScenarioSamplePhase[] = [];
			const invocationRoots: string[] = [];
			const invocationCommands: string[] = [];
			const createdSandboxes: string[] = [];
			const cleanedSandboxes: string[] = [];
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "instrumented-release",
				scenario_version: "1.0.0",
				pack_id: "mutation-safety",
				command: "afol --version",
				sandbox: true,
				compiled_binary: true,
				setup: [["afol", "--version"]],
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 300 },
				baseline_id: "mutation-safety-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario, {
				artifact,
				sampleCount: 20,
				warmupCount: 1,
				seams: {
					createSandboxRoot: () => {
						const sandbox = join(
							root,
							".afol",
							"tmp",
							`afol-bench-sandbox-fixture-${createdSandboxes.length}`,
						);
						mkdirSync(sandbox, { recursive: true });
						createdSandboxes.push(sandbox);
						return sandbox;
					},
					cleanupSandboxRoot: (sandbox) => {
						cleanedSandboxes.push(sandbox);
						rmSync(sandbox, { recursive: true, force: true });
					},
					runSample: (sampleRoot, invocation, phase): ScenarioSampleRun => {
						phases.push(phase);
						invocationRoots.push(sampleRoot);
						invocationCommands.push(invocation.command);
						return {
							duration_ms:
								phase === "setup" ? 9_000 : phase === "warmup" ? 8_000 : 10,
							exit_code: 0,
							signal: null,
							spawn_error: null,
							stdout: "ok",
							stderr: "",
						};
					},
				},
			});
			expect(result.passed).toBe(true);
			expect(result.metrics.sample_count).toBe(20);
			expect(result.metrics.warmup_count).toBe(1);
			expect(result.metrics.timing_p50_ms).toBe(10);
			expect(result.metrics.timing_p95_ms).toBe(10);
			expect(result.source_state_sha256).toBe("c".repeat(64));
			expect(result.source_dirty).toBe(true);
			expect(phases.filter((phase) => phase === "setup")).toHaveLength(21);
			expect(phases.filter((phase) => phase === "warmup")).toHaveLength(1);
			expect(phases.filter((phase) => phase === "sample")).toHaveLength(20);
			expect(createdSandboxes).toHaveLength(21);
			expect(
				new Set(
					invocationRoots.filter((_root, index) => phases[index] === "sample"),
				).size,
			).toBe(20);
			expect(cleanedSandboxes).toEqual(createdSandboxes);
			expect(
				createdSandboxes.every((path) => path.includes("/.afol/tmp/")),
			).toBe(true);
			expect(
				invocationCommands.every((command) => command === artifactPath),
			).toBe(true);
			expect(createdSandboxes.every((path) => !existsSync(path))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps AFOL benchmark temp state out of sandbox copies and cleans sandboxes", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const sentinel = join(
				root,
				".afol",
				"tmp",
				"afol-bench-release-sentinel",
				"afol",
			);
			mkdirSync(dirname(sentinel), { recursive: true });
			writeFileSync(sentinel, "must-not-copy\n");
			for (const relativePath of [
				".tmp/sandbox-copy-sentinel",
				"coverage/sandbox-copy-sentinel",
				".gitnexus/sandbox-copy-sentinel",
			]) {
				const path = join(root, relativePath);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, "must-not-copy\n");
			}
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-temp-exclusion",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command:
					'node -e \'const fs=require("node:fs"); process.exit([".afol/tmp/afol-bench-release-sentinel/afol",".tmp/sandbox-copy-sentinel","coverage/sandbox-copy-sentinel",".gitnexus/sandbox-copy-sentinel"].some(fs.existsSync) ? 9 : 1)\'',
				sandbox: true,
				expected_exit: 1,
				setup: [
					[
						"node",
						"-e",
						"const fs=require('node:fs'); fs.mkdirSync('unreadable-fixture',{recursive:true}); fs.writeFileSync('unreadable-fixture/file','fixture'); fs.chmodSync('unreadable-fixture/file',0o000); fs.chmodSync('unreadable-fixture',0o000);",
					],
				],
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario);
			expect(result.passed).toBe(true);
			expect(readFileSync(sentinel, "utf8")).toBe("must-not-copy\n");
			expect(
				readdirSync(join(root, ".afol", "tmp")).filter((entry) =>
					entry.startsWith("afol-bench-sandbox-"),
				),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("uses identity fallback for sandbox validation outside Linux", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const sandbox = join(root, ".afol", "tmp", "non-linux-sandbox");
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "non-linux-sandbox",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: "afol --version",
				sandbox: true,
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario, {
				sampleCount: 1,
				warmupCount: 0,
				seams: {
					platform: "darwin",
					createSandboxRoot: () => {
						mkdirSync(sandbox, { recursive: true });
						return sandbox;
					},
					cleanupSandboxRoot: (path) => {
						rmSync(path, { recursive: true, force: true });
					},
					runSample: () => ({
						duration_ms: 1,
						exit_code: 0,
						signal: null,
						spawn_error: null,
						stdout: "ok",
						stderr: "",
					}),
				},
			});

			expect(result.passed).toBe(true);
			expect(result.notes).not.toContain("sandbox-root-replaced");
			expect(existsSync(sandbox)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("does not follow a sandbox symlink swap to an external target", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-symlink-swap",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command:
					"node -e \"const fs=require('node:fs'); fs.rmSync('swap-target',{recursive:true,force:true}); fs.symlinkSync('../external-target','swap-target','dir');\"",
				sandbox: true,
				setup: [
					[
						"node",
						"-e",
						"const fs=require('node:fs'); fs.mkdirSync('../external-target',{recursive:true}); fs.writeFileSync('../external-target/keep','keep'); fs.mkdirSync('swap-target',{recursive:true});",
					],
				],
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			expect(runScenarioCommand(root, scenario).passed).toBe(true);
			expect(
				readFileSync(
					join(root, ".afol", "tmp", "external-target", "keep"),
					"utf8",
				),
			).toBe("keep");
			expect(
				readdirSync(join(root, ".afol", "tmp")).filter((entry) =>
					entry.startsWith("afol-bench-sandbox-"),
				),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed when a sandbox root is replaced before cleanup", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-root-replacement",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command:
					"node -e \"require('node:fs').writeFileSync('command-ran','bad')\"",
				sandbox: true,
				setup: [
					[
						"node",
						"-e",
						"const fs=require('node:fs'); const path=require('node:path'); const root=process.cwd(); const parent=path.dirname(root); const external=path.join(parent,'external-replacement'); fs.rmSync(external,{recursive:true,force:true}); fs.renameSync(root,external); fs.mkdirSync(root); fs.writeFileSync(path.join(root,'replacement-sentinel'),'replacement'); fs.chmodSync(path.join(root,'replacement-sentinel'),0o444); fs.writeFileSync(path.join(external,'external-sentinel'),'external'); fs.chmodSync(path.join(external,'external-sentinel'),0o555);",
					],
				],
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario);
			expect(result.passed).toBe(false);
			expect(
				result.notes.every((note) => note === "sandbox-root-replaced"),
			).toBe(true);
			const externalSentinel = join(
				root,
				".afol",
				"tmp",
				"external-replacement",
				"external-sentinel",
			);
			const replacementSentinels = readdirSync(
				join(root, ".afol", "tmp"),
			).flatMap((entry) => {
				const candidate = join(
					root,
					".afol",
					"tmp",
					entry,
					"replacement-sentinel",
				);
				return existsSync(candidate) ? [candidate] : [];
			});
			expect(readFileSync(externalSentinel, "utf8")).toBe("external");
			expect(lstatSync(externalSentinel).mode & 0o777).toBe(0o555);
			expect(replacementSentinels.length).toBeGreaterThan(0);
			for (const replacementSentinel of replacementSentinels) {
				expect(readFileSync(replacementSentinel, "utf8")).toBe("replacement");
				expect(lstatSync(replacementSentinel).mode & 0o777).toBe(0o444);
				expect(
					existsSync(join(dirname(replacementSentinel), "command-ran")),
				).toBe(false);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when sandbox cleanup detects a replaced root", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-cleanup-replacement",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: 'node -e "process.exit(0)"',
				sandbox: true,
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario, {
				sampleCount: 1,
				warmupCount: 0,
				seams: {
					createSandboxRoot: () => {
						const sandbox = join(
							root,
							".afol",
							"tmp",
							"afol-bench-sandbox-cleanup-replacement",
						);
						mkdirSync(sandbox, { recursive: true });
						return sandbox;
					},
					cleanupSandboxRoot: (sandbox) => {
						const parent = dirname(sandbox);
						const external = join(parent, "cleanup-external");
						rmSync(external, { recursive: true, force: true });
						renameSync(sandbox, external);
						mkdirSync(sandbox);
						const replacementSentinel = join(sandbox, "replacement-sentinel");
						writeFileSync(replacementSentinel, "replacement");
						chmodSync(replacementSentinel, 0o444);
						const externalSentinel = join(external, "external-sentinel");
						writeFileSync(externalSentinel, "external");
						chmodSync(externalSentinel, 0o555);
					},
				},
			});
			expect(result.passed).toBe(false);
			expect(result.notes).toContain("sandbox-root-replaced");
			const externalSentinel = join(
				root,
				".afol",
				"tmp",
				"cleanup-external",
				"external-sentinel",
			);
			const replacementSentinel = join(
				root,
				".afol",
				"tmp",
				"afol-bench-sandbox-cleanup-replacement",
				"replacement-sentinel",
			);
			expect(readFileSync(externalSentinel, "utf8")).toBe("external");
			expect(lstatSync(externalSentinel).mode & 0o777).toBe(0o555);
			expect(readFileSync(replacementSentinel, "utf8")).toBe("replacement");
			expect(lstatSync(replacementSentinel).mode & 0o777).toBe(0o444);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails when a command renames the sandbox root without replacement", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-root-rename-only",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command:
					"node -e \"const fs=require('node:fs'); const path=require('node:path'); const root=process.cwd(); const target=path.join(path.dirname(root),'rename-only-target'); fs.rmSync(target,{recursive:true,force:true}); fs.renameSync(root,target); fs.writeFileSync(path.join(target,'rename-sentinel'),'renamed'); fs.chmodSync(path.join(target,'rename-sentinel'),0o555); process.exit(0)\"",
				sandbox: true,
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario, {
				sampleCount: 1,
				warmupCount: 0,
			});
			expect(result.passed).toBe(false);
			expect(result.notes).toContain("sandbox-root-replaced");
			const sentinel = join(
				root,
				".afol",
				"tmp",
				"rename-only-target",
				"rename-sentinel",
			);
			expect(readFileSync(sentinel, "utf8")).toBe("renamed");
			expect(lstatSync(sentinel).mode & 0o777).toBe(0o555);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("isolates workbench benchmarks from source and mutable runtime history", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			cpSync(
				join(process.cwd(), ".afol", "config.json"),
				join(root, ".afol", "config.json"),
			);
			for (const relativePath of [
				".afol/wb/history-sentinel",
				".afol/data/events/history-sentinel",
			]) {
				const path = join(root, relativePath);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, "must-not-copy\n");
			}
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "workbench-clean-sandbox",
				scenario_version: "1.0.0",
				pack_id: "workbench-parity",
				command:
					'node -e \'const{existsSync:e}=require("node:fs");process.exit(!e(".afol/config.json")||e(".afol/wb/history-sentinel")||e(".afol/data/events/history-sentinel")?9:0)\'',
				sandbox: true,
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: { max_p95_ms: 10_000 },
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};
			const result = runScenarioCommand(root, scenario);
			expect(result.passed).toBe(true);
			expect(result.metrics.sample_count).toBe(20);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("requires stable samples for release and workbench timing packs", () => {
		for (const packId of ["mutation-safety", "workbench-parity"] as const) {
			expect(() => resolveScenarioSampleCount({ pack_id: packId }, 19)).toThrow(
				"release-benchmark-sample-count-required:20",
			);
			expect(resolveScenarioSampleCount({ pack_id: packId })).toBe(20);
		}
		expect(resolveScenarioSampleCount({ pack_id: "token-economy" })).toBe(3);
	});

	test("does not require artifact hash equality for profile compatibility", () => {
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: "artifact-identity",
			scenario_version: "1.0.0",
			pack_id: "mutation-safety",
			result_schema: "1.0.0",
			oracle: "fixture",
			thresholds: { max_p95_ms: 300 },
			baseline_id: "mutation-safety-v1",
			deterministic_metrics: {},
			compiled_binary: true,
		};
		const baseline: Baseline = {
			baseline_id: "mutation-safety-v1",
			pack_id: "mutation-safety",
			schema_version: "1.0.0",
			host_profile_id: "linux-x64-test",
			os: "linux",
			arch: "x64",
			cpu_class: "test-cpu",
			bun_version: Bun.version,
			runtime_version: Bun.version,
			execution_mode: "compiled-release",
			artifact_mode: "bun-compile",
			artifact_sha256: "a".repeat(64),
			scenarios: {
				[scenario.scenario_id]: {
					scenario_id: scenario.scenario_id,
					scenario_version: scenario.scenario_version,
					timing_p50_ms: 100,
					timing_p95_ms: 150,
					sample_count: 20,
					warmup_count: 1,
				},
			},
		};
		const execution: ScenarioExecutionResult = {
			metrics: {
				duration_ms: 100,
				timing_p50_ms: 100,
				timing_p95_ms: 150,
				error_count: 0,
				retry_count: 0,
				context_tokens: 0,
				prompt_tokens: 0,
				output_tokens: 0,
				context_bytes: 0,
				output_bytes: 0,
				tool_call_count: 1,
				tool_success_rate: 1,
				sample_count: 20,
				warmup_count: 1,
			},
			notes: [],
			passed: true,
			profile: {
				host_profile_id: "linux-x64-test",
				os: "linux",
				arch: "x64",
				cpu_class: "test-cpu",
				bun_version: Bun.version,
				runtime_version: Bun.version,
				execution_mode: "compiled-release",
				artifact_mode: "bun-compile",
				artifact_sha256: "b".repeat(64),
			},
			timestamp: "2026-07-28T00:00:00.000Z",
			git_commit: "c".repeat(40),
		};
		expect(
			collectProfileCompatibilityNotes(
				scenario,
				baseline,
				baseline.scenarios?.[scenario.scenario_id],
				execution,
			),
		).toEqual([]);
	});

	test("keeps completion-lock ignore policy in source/example parity", () => {
		for (const file of [".gitignore", ".gitignore.example"]) {
			const lines = readFileSync(join(process.cwd(), file), "utf8").split(
				/\r?\n/,
			);
			expect(lines.filter((line) => line === ".afol/wb/.locks/")).toHaveLength(
				1,
			);
		}
	});

	test("executes commands, records failures, and blocks tracked-file leaks", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"pstr-integrity",
				"baseline-v1.json",
			);
			mkdirSync(dirname(baselinePath), { recursive: true });
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			writeFileSync(
				baselinePath,
				`${JSON.stringify(baseline, null, 2)}\n`,
				"utf8",
			);

			const successScenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "bench-success",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: "afol --version",
				result_schema: "1.0.0",
				oracle: "normalized-envelope-and-threshold-check",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 100,
					min_tool_success_rate: 1,
				},
				baseline_id: "bench-v1",
				deterministic_metrics: {
					duration_ms: 120,
					timing_p50_ms: 120,
					timing_p95_ms: 120,
					error_count: 0,
					retry_count: 0,
					context_tokens: 0,
					prompt_tokens: 0,
					output_tokens: 1,
					context_bytes: 0,
					output_bytes: 4,
					tool_call_count: 1,
					tool_success_rate: 1,
				},
			};
			const success = withCapturedConsoleError(() =>
				buildResult(root, successScenario, baselinePath, baseline),
			);
			expect(success.result.status).toBe("passed");
			expect(success.result.duration_ms).toBeGreaterThan(0);
			expect(success.result.timing_p50_ms).toBeGreaterThan(0);
			expect(success.result.output_bytes).toBeGreaterThan(0);
			expect(success.result.tool_success_rate).toBe(1);
			expect(success.result.error_count).toBe(0);
			expect(success.result.argv_chars).toBe(
				Array.from(successScenario.command?.trim() ?? "").length,
			);

			const unicodeScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-unicode-argv",
				command: `  node -e 'console.log("😀")'  `,
				thresholds: { ...successScenario.thresholds, max_argv_chars: 100 },
			};
			const unicode = withCapturedConsoleError(() =>
				buildResult(root, unicodeScenario, baselinePath, baseline),
			);
			expect(unicode.result.status).toBe("passed");
			expect(unicode.result.argv_chars).toBe(26);

			writeFileSync(join(root, "preexisting-dirty.txt"), "dirty\n", "utf8");
			const dirtySuccess = withCapturedConsoleError(() =>
				buildResult(
					root,
					{
						...successScenario,
						scenario_id: "bench-success-dirty-worktree",
					},
					baselinePath,
					baseline,
				),
			);
			expect(dirtySuccess.result.status).toBe("passed");
			expect(
				dirtySuccess.result.notes.some((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe(false);

			const dirtyMutationScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-dirty-worktree-mutation",
				command: `node -e 'require("node:fs").appendFileSync("preexisting-dirty.txt","mutated\\n")'`,
			};
			const dirtyMutation = withCapturedConsoleError(() =>
				buildResult(root, dirtyMutationScenario, baselinePath, baseline),
			);
			expect(dirtyMutation.result.status).toBe("failed");
			expect(
				dirtyMutation.result.notes.find((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe("side-effect-leak:preexisting-dirty.txt");
			writeFileSync(join(root, "preexisting-dirty.txt"), "dirty\n", "utf8");
			unlinkSync(join(root, "preexisting-dirty.txt"));

			const expectedExitScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-expected-exit",
				command: "afol __nonexistent__",
				expected_exit: 2,
			};
			const expectedExit = withCapturedConsoleError(() =>
				buildResult(root, expectedExitScenario, baselinePath, baseline),
			);
			expect(expectedExit.result.status).toBe("passed");
			expect(expectedExit.result.tool_success_rate).toBe(1);
			expect(expectedExit.result.error_count).toBe(0);

			const failureScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-failure",
				command: "afol __nonexistent__",
			};
			const failure = withCapturedConsoleError(() =>
				buildResult(root, failureScenario, baselinePath, baseline),
			);
			expect(failure.result.status).toBe("failed");
			expect(failure.result.duration_ms).toBeGreaterThan(0);
			expect(failure.result.error_count).toBe(3);
			expect(failure.result.tool_success_rate).toBe(0);
			expect(
				failure.result.notes.some((note) => note.startsWith("sample-failed:")),
			).toBe(true);

			const plannedScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-planned-no-execution",
				implementation_status: "planned",
				command: `node -e 'require("node:fs").writeFileSync("planned-ran.txt","unexpected\\n")'`,
			};
			const planned = withCapturedConsoleError(() =>
				buildResult(root, plannedScenario, baselinePath, baseline),
			);
			expect(planned.result.status).toBe("skipped");
			expect(planned.result.pass).toBe(false);
			expect(planned.result.notes).toEqual(["planned-no-execution"]);
			expect(existsSync(join(root, "planned-ran.txt"))).toBe(false);

			const sideEffectScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-side-effect",
				command: `node -e 'require("node:fs").appendFileSync("tracked.txt","changed\\n")'`,
			};
			const sideEffect = withCapturedConsoleError(() =>
				buildResult(root, sideEffectScenario, baselinePath, baseline),
			);
			expect(sideEffect.result.status).toBe("failed");
			expect(
				sideEffect.result.notes.find((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe("side-effect-leak:tracked.txt");

			const ignoredRuntimeScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-ignored-runtime-mutation",
				command: `node -e 'const fs=require("node:fs"); fs.mkdirSync(".afol/wb",{recursive:true}); fs.writeFileSync(".afol/wb/session-context.json", JSON.stringify({session:"mutated"}) + "\\n", "utf8");'`,
			};
			const ignoredRuntime = withCapturedConsoleError(() =>
				buildResult(root, ignoredRuntimeScenario, baselinePath, baseline),
			);
			expect(ignoredRuntime.result.status).toBe("failed");
			expect(
				ignoredRuntime.result.notes.find((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe("side-effect-leak:.afol/wb/session-context.json");

			const sandboxScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-sandbox",
				implementation_status: "skipped",
				sandbox: true,
				setup: [
					[
						"node",
						"-e",
						"const fs=require('node:fs'); fs.mkdirSync('.afol/memory',{recursive:true}); fs.writeFileSync('.afol/memory/memory.md','MEM-SB-1\\n','utf8');",
					],
				],
				command: "node sandbox-mutate.cjs",
			};
			mkdirSync(join(root, ".coverage"), { recursive: true });
			writeFileSync(join(root, ".coverage", "sentinel"), "derived\n", "utf8");
			writeFileSync(
				join(root, "sandbox-mutate.cjs"),
				[
					"const fs = require('node:fs');",
					"if (fs.existsSync('.coverage')) process.exit(8);",
					"const path = '.afol/memory/memory.md';",
					"const text = fs.readFileSync(path, 'utf8');",
					"if (!text.includes('MEM-SB-1')) process.exit(7);",
					"fs.appendFileSync(path, '\\n<!-- sandboxed -->\\n', 'utf8');",
				].join("\n"),
				"utf8",
			);
			const sandboxStatusBefore = spawnSync("git", ["status", "--porcelain"], {
				cwd: root,
				encoding: "utf8",
			});
			expect(sandboxStatusBefore.status).toBe(0);

			const sandbox = withCapturedConsoleError(() =>
				buildResult(root, sandboxScenario, baselinePath, baseline),
			);
			expect(sandbox.result.status).toBe("passed");
			expect(sandbox.result.tool_call_count).toBe(1);
			expect(sandbox.result.timing_p50_ms).toBeGreaterThan(0);
			expect(sandbox.result.argv_chars).toBe(
				Array.from(sandboxScenario.command?.trim() ?? "").length,
			);
			expect(
				sandbox.result.notes.some((note) => note.startsWith("sample-failed:")),
			).toBe(false);

			const sandboxFailureScenario: Scenario = {
				...sandboxScenario,
				scenario_id: "bench-sandbox-failure",
				command: "node -e 'process.exit(7)'",
			};
			const sandboxFailure = withCapturedConsoleError(() =>
				buildResult(root, sandboxFailureScenario, baselinePath, baseline),
			);
			expect(sandboxFailure.result.status).toBe("failed");
			expect(sandboxFailure.result.tool_success_rate).toBe(0);
			expect(
				sandboxFailure.result.notes.some((note) =>
					note.startsWith("sample-failed:"),
				),
			).toBe(true);

			const staleSandboxBinaryScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-sandbox-does-not-trust-project-binary",
				sandbox: true,
				setup: [
					[
						"node",
						"-e",
						"const fs=require('node:fs'); fs.mkdirSync('.afol/bin',{recursive:true}); fs.writeFileSync('.afol/bin/afol','#!/bin/sh\\nexit 7\\n','utf8'); fs.chmodSync('.afol/bin/afol',0o755);",
					],
				],
				command: "afol --version",
			};
			const staleSandboxBinary = withCapturedConsoleError(() =>
				buildResult(root, staleSandboxBinaryScenario, baselinePath, baseline),
			);
			expect(staleSandboxBinary.result.status).toBe("passed");
			expect(staleSandboxBinary.result.output_bytes).toBeGreaterThan(0);

			const compiledSandboxScenario: Scenario = {
				...successScenario,
				scenario_id: "bench-sandbox-trusts-fresh-compiled-binary",
				sandbox: true,
				compiled_binary: true,
				command: "afol --version",
			};
			const compiledSandbox = withCapturedConsoleError(() =>
				buildResult(root, compiledSandboxScenario, baselinePath, baseline),
			);
			expect(compiledSandbox.result.status).toBe("passed");
			expect(compiledSandbox.result.output_bytes).toBeGreaterThan(0);

			const sandboxStatusAfter = spawnSync("git", ["status", "--porcelain"], {
				cwd: root,
				encoding: "utf8",
			});
			expect(sandboxStatusAfter.status).toBe(0);
			expect(sandboxStatusAfter.stdout).toBe(sandboxStatusBefore.stdout);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120_000);

	test("ignores an active completion lock but still catches workbench leaks", async () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const baselinePath = join(root, "baseline-v1.json");
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "bench-held-completion-lock",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: "afol --version",
				result_schema: "1.0.0",
				oracle: "normalized-envelope-and-threshold-check",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 100,
					min_tool_success_rate: 1,
				},
				baseline_id: "bench-v1",
				deterministic_metrics: {},
			};

			const emptyOperationalRoot = withCapturedConsoleError(() =>
				buildResult(
					root,
					{
						...scenario,
						scenario_id: "bench-empty-lock-root",
						command:
							'node -e \'require("node:fs").mkdirSync(".afol/wb/.locks",{recursive:true})\'',
					},
					baselinePath,
					baseline,
				),
			);
			expect(emptyOperationalRoot.result.status).toBe("passed");
			expect(
				emptyOperationalRoot.result.notes.some((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe(false);
			expect(existsSync(join(root, ".afol", "wb", ".locks"))).toBe(false);

			await withTaskCompletionLock(
				root,
				"bench-session",
				"T-01",
				async () => {
					const ownerLockPath = resolveTaskCompletionLockPath(
						root,
						"bench-session",
						"T-01",
					);
					const safe = withCapturedConsoleError(() =>
						buildResult(root, scenario, baselinePath, baseline),
					);
					expect(safe.result.status).toBe("passed");
					expect(
						safe.result.notes.some((note) =>
							note.startsWith("side-effect-leak:"),
						),
					).toBe(false);
					expect(existsSync(ownerLockPath)).toBe(true);

					const arbitraryLockFile = join(
						root,
						".afol",
						"wb",
						".locks",
						"unexpected.txt",
					);
					const arbitrary = withCapturedConsoleError(() =>
						buildResult(
							root,
							{
								...scenario,
								scenario_id: "bench-held-lock-arbitrary-entry",
								command: `node -e 'require("node:fs").writeFileSync(".afol/wb/.locks/unexpected.txt","leak\\n","utf8")'`,
							},
							baselinePath,
							baseline,
						),
					);
					expect(arbitrary.result.status).toBe("failed");
					expect(
						arbitrary.result.notes.find((note) =>
							note.startsWith("side-effect-leak:"),
						),
					).toBe("side-effect-leak:.afol/wb/.locks/unexpected.txt");
					expect(existsSync(arbitraryLockFile)).toBe(false);
					expect(existsSync(ownerLockPath)).toBe(true);

					const symlinkTarget = join(root, "lock-symlink-target.txt");
					writeFileSync(symlinkTarget, "preserve\n", "utf8");
					const symlinkEntry = join(
						root,
						".afol",
						"wb",
						".locks",
						"unexpected-link",
					);
					const symlink = withCapturedConsoleError(() =>
						buildResult(
							root,
							{
								...scenario,
								scenario_id: "bench-held-lock-symlink-entry",
								command: `node -e 'require("node:fs").symlinkSync(${JSON.stringify(symlinkTarget)}, ".afol/wb/.locks/unexpected-link")'`,
							},
							baselinePath,
							baseline,
						),
					);
					expect(symlink.result.status).toBe("failed");
					expect(
						symlink.result.notes.find((note) =>
							note.startsWith("side-effect-leak:"),
						),
					).toBe("side-effect-leak:.afol/wb/.locks/unexpected-link");
					expect(existsSync(symlinkEntry)).toBe(false);
					expect(readFileSync(symlinkTarget, "utf8")).toBe("preserve\n");
					expect(existsSync(ownerLockPath)).toBe(true);

					const leaked = withCapturedConsoleError(() =>
						buildResult(
							root,
							{
								...scenario,
								scenario_id: "bench-held-lock-real-leak",
								command: `node -e 'const fs=require("node:fs"); fs.mkdirSync(".afol/wb/session",{recursive:true}); fs.writeFileSync(".afol/wb/session/real-leak.txt","leak\\n","utf8")'`,
							},
							baselinePath,
							baseline,
						),
					);
					expect(leaked.result.status).toBe("failed");
					expect(
						leaked.result.notes.find((note) =>
							note.startsWith("side-effect-leak:"),
						),
					).toBe("side-effect-leak:.afol/wb/session/real-leak.txt");
				},
				{ heartbeatMs: 5 },
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	test("reports hostile completion-lock metadata and fence mutations without unsafe cleanup", async () => {
		const mutations = [
			{
				id: "owner-token",
				command(lockPath: string): string {
					return `node -e 'const fs=require("node:fs"); const p=${JSON.stringify(lockPath)}; const value=JSON.parse(fs.readFileSync(p,"utf8")); value.owner_token="hostile-owner"; fs.writeFileSync(p,JSON.stringify(value)+String.fromCharCode(10),"utf8")'`;
				},
				target: "lock" as const,
			},
			{
				id: "generation",
				command(lockPath: string): string {
					return `node -e 'const fs=require("node:fs"); const p=${JSON.stringify(lockPath)}; const value=JSON.parse(fs.readFileSync(p,"utf8")); value.generation+=1000; fs.writeFileSync(p,JSON.stringify(value)+String.fromCharCode(10),"utf8")'`;
				},
				target: "lock" as const,
			},
			{
				id: "extra-field",
				command(lockPath: string): string {
					return `node -e 'const fs=require("node:fs"); const p=${JSON.stringify(lockPath)}; const value=JSON.parse(fs.readFileSync(p,"utf8")); value.untrusted="extra"; fs.writeFileSync(p,JSON.stringify(value)+String.fromCharCode(10),"utf8")'`;
				},
				target: "lock" as const,
			},
			{
				id: "malformed",
				command(lockPath: string): string {
					return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(lockPath)},"malformed"+String.fromCharCode(10),"utf8")'`;
				},
				target: "lock" as const,
			},
			{
				id: "heartbeat-regression",
				command(lockPath: string): string {
					return `node -e 'const fs=require("node:fs"); const p=${JSON.stringify(lockPath)}; const value=JSON.parse(fs.readFileSync(p,"utf8")); value.heartbeat_at="1970-01-01T00:00:00.000Z"; fs.writeFileSync(p,JSON.stringify(value)+String.fromCharCode(10),"utf8")'`;
				},
				target: "lock" as const,
			},
			{
				id: "fence",
				command(lockPath: string): string {
					return `node -e 'require("node:fs").writeFileSync(${JSON.stringify(`${lockPath}.fence`)},"999999"+String.fromCharCode(10),"utf8")'`;
				},
				target: "fence" as const,
			},
		];

		for (const mutation of mutations) {
			const root = createBenchExecutionFixtureRoot();
			try {
				const baselinePath = join(root, "baseline-v1.json");
				const baseline: Baseline = {
					baseline_id: "bench-v1",
					pack_id: "pstr-integrity",
					schema_version: "1.0.0",
					timing_p50_ms: 10_000,
					timing_p95_ms: 10_000,
				};
				await withTaskCompletionLock(
					root,
					"bench-session",
					"T-01",
					async () => {
						const ownerLockPath = resolveTaskCompletionLockPath(
							root,
							"bench-session",
							"T-01",
						);
						const fencePath = `${ownerLockPath}.fence`;
						const originalLock = readFileSync(ownerLockPath, "utf8");
						const originalFence = readFileSync(fencePath, "utf8");
						const relativeLockPath = ownerLockPath
							.slice(root.length + 1)
							.replaceAll("\\", "/");
						const expectedLeakPath =
							mutation.target === "fence"
								? `${relativeLockPath}.fence`
								: relativeLockPath;
						try {
							const result = withCapturedConsoleError(() =>
								buildResult(
									root,
									{
										schema_version: "1.0.0",
										scenario_id: `bench-hostile-lock-${mutation.id}`,
										scenario_version: "1.0.0",
										pack_id: "pstr-integrity",
										command: mutation.command(ownerLockPath),
										result_schema: "1.0.0",
										oracle: "normalized-envelope-and-threshold-check",
										thresholds: {
											max_duration_ms: 10_000,
											max_p95_ms: 10_000,
											max_output_tokens: 100,
											min_tool_success_rate: 1,
										},
										baseline_id: "bench-v1",
										deterministic_metrics: {},
									},
									baselinePath,
									baseline,
								),
							);
							expect(result.result.status).toBe("failed");
							expect(
								result.result.notes.some((note) =>
									note.includes(`side-effect-leak:${expectedLeakPath}`),
								),
							).toBe(true);
							if (mutation.target === "fence") {
								expect(readFileSync(fencePath, "utf8")).toBe("999999\n");
								expect(readFileSync(ownerLockPath, "utf8")).toBe(originalLock);
							} else {
								expect(readFileSync(ownerLockPath, "utf8")).not.toBe(
									originalLock,
								);
								expect(readFileSync(fencePath, "utf8")).toBe(originalFence);
							}
						} finally {
							writeFileSync(ownerLockPath, originalLock, "utf8");
							writeFileSync(fencePath, originalFence, "utf8");
						}
					},
					{ heartbeatMs: 60_000 },
				);
				const ownerLockPath = resolveTaskCompletionLockPath(
					root,
					"bench-session",
					"T-01",
				);
				expect(existsSync(ownerLockPath)).toBe(false);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	}, 30_000);

	test("reports atomic replacement of an owner lock and leaves the replacement for explicit recovery", async () => {
		const root = createBenchExecutionFixtureRoot();
		let ownerLockPath = "";
		try {
			const baselinePath = join(root, "baseline-v1.json");
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			await withTaskCompletionLock(
				root,
				"bench-session",
				"T-01",
				async () => {
					ownerLockPath = resolveTaskCompletionLockPath(
						root,
						"bench-session",
						"T-01",
					);
					const original = readFileSync(ownerLockPath, "utf8");
					const originalInode = lstatSync(ownerLockPath).ino;
					const replacementPath = `${ownerLockPath}.hostile-replacement`;
					const command = `node -e 'const fs=require("node:fs"); const p=${JSON.stringify(ownerLockPath)}; const replacement=${JSON.stringify(replacementPath)}; const value=fs.readFileSync(p,"utf8"); fs.writeFileSync(replacement,value,"utf8"); fs.renameSync(replacement,p)'`;
					const result = withCapturedConsoleError(() =>
						buildResult(
							root,
							{
								schema_version: "1.0.0",
								scenario_id: "bench-hostile-lock-atomic-replacement",
								scenario_version: "1.0.0",
								pack_id: "pstr-integrity",
								command,
								result_schema: "1.0.0",
								oracle: "normalized-envelope-and-threshold-check",
								thresholds: {
									max_duration_ms: 10_000,
									max_p95_ms: 10_000,
									max_output_tokens: 100,
									min_tool_success_rate: 1,
								},
								baseline_id: "bench-v1",
								deterministic_metrics: {},
							},
							baselinePath,
							baseline,
						),
					);
					const relativeLockPath = ownerLockPath
						.slice(root.length + 1)
						.replaceAll("\\", "/");
					expect(result.result.status).toBe("failed");
					expect(
						result.result.notes.some((note) =>
							note.includes(`side-effect-leak:${relativeLockPath}`),
						),
					).toBe(true);
					expect(readFileSync(ownerLockPath, "utf8")).toBe(original);
					expect(lstatSync(ownerLockPath).ino).not.toBe(originalInode);
				},
				{ heartbeatMs: 60_000 },
			);
			// The owner identity was destroyed. Neither the benchmark nor the lease
			// may unlink a same-content replacement that it does not own.
			expect(existsSync(ownerLockPath)).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	test("reports an owner lock root replaced by a symlink without touching its target", async () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const target = join(root, "lock-root-target");
			mkdirSync(target);
			writeFileSync(join(target, "preserve.txt"), "preserve\n", "utf8");
			const baselinePath = join(root, "baseline-v1.json");
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			let ownerLockPath = "";
			await withTaskCompletionLock(
				root,
				"bench-session",
				"T-01",
				async () => {
					ownerLockPath = resolveTaskCompletionLockPath(
						root,
						"bench-session",
						"T-01",
					);
					const command = `node -e 'const fs=require("node:fs"); const p=".afol/wb/.locks"; try { const stat=fs.lstatSync(p); if (stat.isSymbolicLink()) fs.unlinkSync(p); else fs.rmSync(p,{recursive:true,force:true}); } catch {} fs.symlinkSync(${JSON.stringify(target)},p,"dir")'`;
					const result = withCapturedConsoleError(() =>
						buildResult(
							root,
							{
								schema_version: "1.0.0",
								scenario_id: "bench-lock-root-symlink",
								scenario_version: "1.0.0",
								pack_id: "pstr-integrity",
								command,
								result_schema: "1.0.0",
								oracle: "normalized-envelope-and-threshold-check",
								thresholds: {
									max_duration_ms: 10_000,
									max_p95_ms: 10_000,
									max_output_tokens: 100,
									min_tool_success_rate: 1,
								},
								baseline_id: "bench-v1",
								deterministic_metrics: {},
							},
							baselinePath,
							baseline,
						),
					);
					expect(result.result.status).toBe("failed");
					expect(
						result.result.notes.some((note) =>
							note.startsWith("side-effect-leak:.afol/wb/.locks"),
						),
					).toBe(true);
					expect(existsSync(join(root, ".afol", "wb", ".locks"))).toBe(false);
					expect(readFileSync(join(target, "preserve.txt"), "utf8")).toBe(
						"preserve\n",
					);
					expect(existsSync(ownerLockPath)).toBe(false);
				},
				{ heartbeatMs: 60_000 },
			);
			// Replacing the root destroyed the owner's inode. Cleanup removes only
			// the hostile symlink and does not claim that the owner survived.
			expect(existsSync(ownerLockPath)).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	test("applies the documented timing tolerance to baseline comparisons", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const baselinePath = join(root, "baseline-v1.json");
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 200,
				timing_p95_ms: 300,
			};
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "baseline-timing-tolerance",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				result_schema: "1.0.0",
				oracle: "normalized-envelope-and-threshold-check",
				thresholds: {
					max_duration_ms: 1_000,
					max_p95_ms: 1_000,
					max_output_tokens: 100,
					min_tool_success_rate: 1,
				},
				baseline_id: "bench-v1",
				implementation_status: "implemented",
				deterministic_metrics: {
					duration_ms: 250,
					timing_p50_ms: 250,
					timing_p95_ms: 375,
					error_count: 0,
					retry_count: 0,
					context_tokens: 0,
					prompt_tokens: 0,
					output_tokens: 1,
					context_bytes: 0,
					output_bytes: 4,
					tool_call_count: 1,
					tool_success_rate: 1,
				},
			};

			const withinTolerance = buildResult(
				root,
				scenario,
				baselinePath,
				baseline,
			);
			expect(withinTolerance.status).toBe("passed");

			const p50Regression = buildResult(
				root,
				{
					...scenario,
					deterministic_metrics: {
						...scenario.deterministic_metrics,
						duration_ms: 251,
						timing_p50_ms: 251,
					},
				},
				baselinePath,
				baseline,
			);
			expect(p50Regression.status).toBe("failed");
			expect(p50Regression.notes).toContain(
				"baseline-regression:timing_p50_ms:251>250",
			);
			const observedP50Regression = buildResult(
				root,
				{
					...scenario,
					pack_id: "governance-history",
					deterministic_metrics: {
						...scenario.deterministic_metrics,
						duration_ms: 251,
						timing_p50_ms: 251,
					},
				},
				baselinePath,
				baseline,
				"observe",
			);
			expect(observedP50Regression.status).toBe("passed");
			expect(observedP50Regression.timing_p50_ms).toBe(251);
			expect(observedP50Regression.notes).toContain(
				"baseline-regression:timing_p50_ms:251>250",
			);
			const observedTimingThreshold = buildResult(
				root,
				{
					...scenario,
					pack_id: "governance-history",
					thresholds: {
						...scenario.thresholds,
						max_p95_ms: 300,
						min_duration_ms: 300,
					},
				},
				baselinePath,
				baseline,
				"observe",
			);
			expect(observedTimingThreshold.status).toBe("passed");
			expect(observedTimingThreshold.notes).toContain(
				"threshold-exceeded:max_p95_ms:375>300",
			);
			expect(observedTimingThreshold.notes).toContain(
				"threshold-below-min:min_duration_ms:250<300",
			);

			const p95Regression = buildResult(
				root,
				{
					...scenario,
					deterministic_metrics: {
						...scenario.deterministic_metrics,
						timing_p95_ms: 376,
					},
				},
				baselinePath,
				baseline,
			);
			expect(p95Regression.status).toBe("failed");
			expect(p95Regression.notes).toContain(
				"baseline-regression:timing_p95_ms:376>375",
			);

			const observedNonTimingFailure = buildResult(
				root,
				{
					...scenario,
					pack_id: "governance-history",
					thresholds: { ...scenario.thresholds, max_output_tokens: 0 },
				},
				baselinePath,
				baseline,
				"observe",
			);
			expect(observedNonTimingFailure.status).toBe("failed");
			expect(observedNonTimingFailure.notes).toContain(
				"threshold-exceeded:max_output_tokens:1>0",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("keeps mutation timing baseline regressions advisory under the hard SLO", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const baselinePath = join(root, "baseline-v1.json");
			const baseline: Baseline = {
				baseline_id: "mutation-safety-v1",
				pack_id: "mutation-safety",
				schema_version: "1.0.0",
				timing_p50_ms: 29,
				timing_p95_ms: 29,
			};
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "mutation-jitter-floor",
				scenario_version: "1.0.0",
				pack_id: "mutation-safety",
				result_schema: "1.0.0",
				oracle: "fixture",
				thresholds: {
					max_duration_ms: 300,
					max_p95_ms: 300,
					max_output_tokens: 10,
					min_tool_success_rate: 1,
				},
				baseline_id: "mutation-safety-v1",
				implementation_status: "implemented",
				deterministic_metrics: {
					duration_ms: 79,
					timing_p50_ms: 79,
					timing_p95_ms: 79,
					error_count: 0,
					retry_count: 0,
					context_tokens: 0,
					prompt_tokens: 0,
					output_tokens: 1,
					context_bytes: 0,
					output_bytes: 4,
					tool_call_count: 1,
					tool_success_rate: 1,
				},
			};
			expect(buildResult(root, scenario, baselinePath, baseline).status).toBe(
				"passed",
			);
			const regression = buildResult(
				root,
				{
					...scenario,
					deterministic_metrics: {
						...scenario.deterministic_metrics,
						duration_ms: 80,
						timing_p95_ms: 80,
					},
				},
				baselinePath,
				baseline,
			);
			expect(regression.status).toBe("passed");
			expect(regression.notes).toContain(
				"baseline-regression:timing_p95_ms:80>79",
			);
			const sloViolation = buildResult(
				root,
				{
					...scenario,
					deterministic_metrics: {
						...scenario.deterministic_metrics,
						duration_ms: 301,
						timing_p95_ms: 301,
					},
				},
				baselinePath,
				baseline,
			);
			expect(sloViolation.status).toBe("failed");
			expect(sloViolation.notes).toContain(
				"threshold-exceeded:max_p95_ms:301>300",
			);
			const functionalFailure = withCapturedConsoleError(() =>
				buildResult(
					root,
					{
						...scenario,
						scenario_id: "mutation-functional-failure",
						command: "node -e 'process.exit(1)'",
						deterministic_metrics: {},
					},
					baselinePath,
					baseline,
				),
			).result;
			expect(functionalFailure.status).toBe("failed");
			expect(
				functionalFailure.notes.some((note) =>
					note.startsWith("sample-failed:"),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("parses explicit benchmark timing modes and rejects them outside bench", () => {
		expect(
			parseValidationArgs(["bench", "--timing-mode", "observe"]).timingMode,
		).toBe("observe");
		expect(parseValidationArgs(["bench"]).timingMode).toBe("enforce");
		expect(() =>
			parseValidationArgs(["bench", "--timing-mode", "invalid"]),
		).toThrow("Unknown --timing-mode value: invalid");
		expect(() =>
			parseValidationArgs(["run", "--timing-mode", "observe"]),
		).toThrow("--timing-mode requires bench mode");
		expect(() =>
			parseValidationArgs(["run", "--timing-mode", "enforce"]),
		).toThrow("--timing-mode requires bench mode");
	});

	test("fails mutation timing closed when the execution profile is incompatible", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "mutation-profile-contract",
				scenario_version: "1.0.0",
				pack_id: "mutation-safety",
				command: "node -e 'process.stdout.write(\"ok\")'",
				result_schema: "1.0.0",
				oracle: "normalized-envelope-and-threshold-check",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 100,
					min_tool_success_rate: 1,
				},
				baseline_id: "mutation-safety-v1",
				implementation_status: "implemented",
				deterministic_metrics: {},
				compiled_binary: true,
			};
			const artifact: PreparedCompiledReleaseArtifact = {
				binaryPath: join(root, ".afol", "tmp", "release", "afol"),
				profile: {
					host_profile_id: "actual-host",
					os: process.platform,
					arch: process.arch,
					cpu_class: "actual-cpu",
					bun_version: Bun.version,
					runtime_version: Bun.version,
					execution_mode: "compiled-release",
					artifact_mode: "bun-compile",
					artifact_sha256: "d".repeat(64),
				},
				timestamp: "2026-07-28T00:00:00.000Z",
				git_commit: "e".repeat(40),
				source_state_sha256: "f".repeat(64),
				source_dirty: true,
				cleanup: () => {},
			};
			const baseline: Baseline = {
				baseline_id: "mutation-safety-v1",
				pack_id: "mutation-safety",
				schema_version: "1.0.0",
				host_profile_id: "different-host",
				os: process.platform,
				arch: process.arch,
				cpu_class: "different-cpu",
				bun_version: Bun.version,
				runtime_version: Bun.version,
				execution_mode: "source",
				artifact_mode: "source",
				artifact_sha256: "source",
				scenarios: {
					[scenario.scenario_id]: {
						scenario_id: scenario.scenario_id,
						scenario_version: scenario.scenario_version,
						timing_p50_ms: 100,
						timing_p95_ms: 100,
						sample_count: 20,
						warmup_count: 1,
					},
				},
			};
			const result = withCapturedConsoleError(() =>
				buildResult(
					root,
					scenario,
					join(root, "baseline.json"),
					baseline,
					"enforce",
					artifact,
				),
			).result;
			expect(result.status).toBe("incompatible");
			expect(result.pass).toBe(false);
			expect(result.sample_count).toBe(20);
			expect(result.warmup_count).toBe(1);
			expect(result.artifact_sha256).toBe("d".repeat(64));
			expect(
				result.notes.some((note) =>
					note.startsWith("profile-incompatible:host_profile_id:"),
				),
			).toBe(true);
			expect(
				result.notes.some((note) => note.startsWith("baseline-regression:")),
			).toBe(false);

			const pendingBaseline: Baseline = {
				baseline_id: "mutation-safety-v1",
				pack_id: "mutation-safety",
				schema_version: "1.0.0",
				calibration_status: "pending",
				calibration_reason: "controlled-release-host-required",
			};
			const pendingResult = withCapturedConsoleError(() =>
				buildResult(
					root,
					scenario,
					join(root, "baseline.json"),
					pendingBaseline,
					"enforce",
					artifact,
				),
			).result;
			expect(pendingResult.status).toBe("incompatible");
			expect(pendingResult.pass).toBe(false);
			expect(pendingResult.tool_success_rate).toBe(1);
			expect(pendingResult.error_count).toBe(0);
			expect(pendingResult.sample_count).toBe(20);
			expect(pendingResult.warmup_count).toBe(1);
			expect(
				pendingResult.notes.filter((note) =>
					note.startsWith("baseline-incompatible:calibration-pending:"),
				),
			).toEqual([
				"baseline-incompatible:calibration-pending:controlled-release-host-required",
			]);

			const failedResult = withCapturedConsoleError(() =>
				buildResult(
					root,
					{ ...scenario, command: "false" },
					join(root, "baseline.json"),
					pendingBaseline,
					"enforce",
					artifact,
				),
			).result;
			expect(failedResult.status).toBe("failed");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	test("runs sandbox benchmarks with one warmup and three measured samples", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const counterPath = join(root, "sandbox-sample-count.txt");
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			const scenario: Scenario = {
				schema_version: "1.0.0",
				scenario_id: "sandbox-sample-count",
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: `node -e 'require("node:fs").appendFileSync(${JSON.stringify(counterPath)},"x")'`,
				sandbox: true,
				result_schema: "1.0.0",
				oracle: "normalized-envelope-and-threshold-check",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 100,
					min_tool_success_rate: 1,
				},
				baseline_id: "bench-v1",
				implementation_status: "implemented",
				deterministic_metrics: {
					duration_ms: 1,
					timing_p50_ms: 1,
					timing_p95_ms: 1,
					error_count: 0,
					retry_count: 0,
					context_tokens: 0,
					prompt_tokens: 0,
					output_tokens: 0,
					context_bytes: 0,
					output_bytes: 0,
					tool_call_count: 1,
					tool_success_rate: 1,
				},
			};

			const result = buildResult(
				root,
				scenario,
				join(root, "baseline.json"),
				baseline,
			);
			expect(result.status).toBe("passed");
			expect(readFileSync(counterPath, "utf8")).toBe("xxxx");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("enforces the project token rule independent of scenario thresholds", () => {
		const root = createBenchExecutionFixtureRoot();
		try {
			const tokenRulePrefix = ["token", "-rule:"].join("");
			const tokenRuleNonIdealNote = `${tokenRulePrefix}non-ideal(>5k):6250tokens`;
			const tokenRuleProhibitiveNote = `${tokenRulePrefix}prohibitive(>10k):12500tokens`;
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"pstr-integrity",
				"baseline-v1.json",
			);
			mkdirSync(dirname(baselinePath), { recursive: true });
			const baseline: Baseline = {
				baseline_id: "bench-v1",
				pack_id: "pstr-integrity",
				schema_version: "1.0.0",
				timing_p50_ms: 10_000,
				timing_p95_ms: 10_000,
			};
			writeFileSync(
				baselinePath,
				`${JSON.stringify(baseline, null, 2)}\n`,
				"utf8",
			);

			const makeScenario = (scenarioId: string, bytes: number): Scenario => ({
				schema_version: "1.0.0",
				scenario_id: scenarioId,
				scenario_version: "1.0.0",
				pack_id: "pstr-integrity",
				command: `node -e 'require("node:fs").writeSync(1, "x".repeat(${bytes}))'`,
				result_schema: "1.0.0",
				oracle: "project-token-rule",
				thresholds: {
					max_duration_ms: 10_000,
					max_p95_ms: 10_000,
					max_output_tokens: 20_000,
					min_tool_success_rate: 1,
				},
				baseline_id: "bench-v1",
				deterministic_metrics: {
					duration_ms: 120,
					timing_p50_ms: 120,
					timing_p95_ms: 120,
					error_count: 0,
					retry_count: 0,
					context_tokens: 0,
					prompt_tokens: 0,
					output_tokens: Math.round(bytes / 4),
					context_bytes: 0,
					output_bytes: bytes,
					tool_call_count: 1,
					tool_success_rate: 1,
				},
			});

			const clean = withCapturedConsoleError(() =>
				buildResult(
					root,
					makeScenario("token-clean", 1_000),
					baselinePath,
					baseline,
				),
			);
			expect(clean.result.status).toBe("passed");
			expect(clean.result.pass).toBe(true);
			expect(
				clean.result.notes.some((note) => note.startsWith(tokenRulePrefix)),
			).toBe(false);

			const nonIdeal = withCapturedConsoleError(() =>
				buildResult(
					root,
					makeScenario("token-non-ideal", 25_000),
					baselinePath,
					baseline,
				),
			);
			expect(nonIdeal.result.status).toBe("passed");
			expect(nonIdeal.result.pass).toBe(true);
			expect(nonIdeal.result.notes).toContain(tokenRuleNonIdealNote);

			const prohibitive = withCapturedConsoleError(() =>
				buildResult(
					root,
					makeScenario("token-prohibitive", 50_000),
					baselinePath,
					baseline,
				),
			);
			expect(prohibitive.result.status).toBe("failed");
			expect(prohibitive.result.pass).toBe(false);
			expect(prohibitive.result.notes[0]).toBe(tokenRuleProhibitiveNote);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("validate benchmark files", () => {
	test("persists payloads with deterministic file naming and output paths", () => {
		const root = mkdtempSync(join(tmpdir(), "validate-benchmark-files-"));
		try {
			const defaultRelativePath = saveBenchmarkPayload(root, { ok: true }, []);
			expect(defaultRelativePath).toMatch(
				/^\.afol\/data\/benchmarks\/catalog\/results\/\d{8}_\d{6}_benchmark\.json$/,
			);

			const singleRelativePath = saveBenchmarkPayload(root, { ok: true }, [
				"cli-kernel-local",
			]);
			expect(singleRelativePath).toContain("cli-kernel-local.json");

			const multiRelativePath = saveBenchmarkPayload(root, { ok: true }, [
				"cli-kernel-local",
				"routing-accuracy",
			]);
			expect(multiRelativePath).toContain("cli-kernel-local-multi.json");

			const explicitRelativePath = saveBenchmarkPayload(
				root,
				{ ok: true },
				["cli-kernel-local"],
				"artifacts/custom/result.json",
			);
			expect(explicitRelativePath).toBe("artifacts/custom/result.json");

			const explicitAbsolutePath = join(root, "absolute-result.json");
			const absoluteRelativePath = saveBenchmarkPayload(
				root,
				{ ok: true },
				["cli-kernel-local"],
				explicitAbsolutePath,
			);
			expect(absoluteRelativePath).toBe("absolute-result.json");
			expect(existsSync(explicitAbsolutePath)).toBe(true);
			const written = JSON.parse(
				readFileSync(explicitAbsolutePath, "utf8"),
			) as {
				ok: boolean;
			};
			expect(written.ok).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("runtime live validation helpers", () => {
	test("collects threshold notes for supported and unsupported thresholds", () => {
		expect(
			collectThresholdNotes(
				{
					max_duration_ms: 100,
					max_output_tokens: 400,
					min_tool_success_rate: 0.5,
					max_p95_ms: 50,
					max_p50_ms: 8,
					min_p50_ms: 10,
					max_argv_chars: 4,
					min_unknown_value: 1,
					median_latency_ms: 1,
				},
				{
					duration_ms: 120,
					timing_p50_ms: 9,
					timing_p95_ms: 60,
					argv_chars: 5,
					output_tokens: 401,
					tool_success_rate: 0.25,
				},
			),
		).toEqual(
			expect.arrayContaining([
				"threshold-exceeded:max_duration_ms:120>100",
				"threshold-exceeded:max_output_tokens:401>400",
				"threshold-below-min:min_tool_success_rate:0.25<0.5",
				"threshold-exceeded:max_p95_ms:60>50",
				"threshold-exceeded:max_p50_ms:9>8",
				"threshold-exceeded:max_argv_chars:5>4",
				"threshold-below-min:min_p50_ms:9<10",
				"threshold-metric-missing:min_unknown_value",
				"unsupported-threshold:median_latency_ms",
			]),
		);
	});

	test("builds runtime live results from saved result evidence", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			const scenarios = snapshot.scenariosByPack["runtime-live-agent"];
			if (!scenarios) {
				throw new Error("Expected runtime-live-agent scenarios fixture");
			}
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"runtime-live-agent",
				"baseline-v1.json",
			);

			const savedResultPath = getRuntimeLiveSavedResultPath(root);
			const savedResult = readJson(savedResultPath);
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
				"utf8",
			);
			const fallback = buildRuntimeLiveAgentResults(
				root,
				scenarios,
				baselinePath,
			);
			expect(fallback.results).toHaveLength(4);
			expect(
				fallback.results.filter((entry) => entry.status === "passed"),
			).toHaveLength(4);
			expect(fallback.notes).toContain(
				"runtime-live-agent-evidence-source:result",
			);

			unlinkSync(savedResultPath);
			const snapshotPath = getRuntimeLiveSnapshotPath(root);
			const trackedSnapshot = readJson(snapshotPath);
			trackedSnapshot.schema_version = "1.0.0";
			trackedSnapshot.generated_at = new Date().toISOString();
			trackedSnapshot.stale_after_days = 7;
			delete trackedSnapshot.saved_result_path;
			writeFileSync(
				snapshotPath,
				`${JSON.stringify(trackedSnapshot, null, 2)}\n`,
			);
			const missingSavedResult = buildRuntimeLiveAgentResults(
				root,
				scenarios,
				baselinePath,
			);
			expect(missingSavedResult.results).toHaveLength(4);
			expect(
				missingSavedResult.results.filter((entry) => entry.status === "passed"),
			).toHaveLength(4);
			expect(
				missingSavedResult.results
					.filter((entry) => entry.status !== "skipped")
					.every((entry) =>
						entry.notes.includes("live-runner-evidence-source:snapshot"),
					),
			).toBe(true);
			expect(missingSavedResult.notes).toContain(
				"runtime-live-agent-evidence-source:snapshot",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("validates an externally produced receipt through its fresh snapshot", () => {
		const root = createFixtureRoot();
		try {
			const registry = loadRegistry(root);
			const scenarios = registry.scenariosByPack["runtime-live-agent"] ?? [];
			const baselinePath = join(
				root,
				".afol/data/benchmarks/catalog/baselines/runtime-live-agent/baseline-v1.json",
			);
			const valid = buildRuntimeLiveAgentResults(root, scenarios, baselinePath);
			expect(
				valid.results.filter((entry) => entry.status === "passed"),
			).toHaveLength(4);

			const snapshotPath = getRuntimeLiveSnapshotPath(root);
			const snapshot = readJson(snapshotPath);
			snapshot.generated_at = "2020-01-01T00:00:00.000Z";
			writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
			const stale = buildRuntimeLiveAgentResults(root, scenarios, baselinePath);
			expect(
				stale.results.filter((entry) => entry.status === "failed"),
			).toHaveLength(4);
			expect(stale.notes[0]).toStartWith("runtime-live-snapshot-stale:");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("profile constants align with spec child canonical values", () => {
		// Spec child 260423_2006 defines default live benchmark profile:
		//   runtime: codex, model: gpt-5.4-mini, reasoning_effort: medium
		expect(DEFAULT_BENCH_MODEL).toBe("gpt-5.4-mini/medium");
		// The validation layer enforces this fixed external-harness profile from
		// the receipt snapshot and payload; AFOL never executes that profile.
	});

	test("runtime-live-agent catalog scenarios map to all live-runner scenario IDs", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			const scenarios = snapshot.scenariosByPack["runtime-live-agent"] ?? [];
			expect(scenarios.length).toBe(4);

			const mappedIds = scenarios
				.map((s) => s.live_runner_scenario_id)
				.filter(Boolean);
			expect(mappedIds.sort()).toEqual([
				"live-implement-next-governance-preflight",
				"live-implement-start-complete-evidence",
				"live-tools-benchmark-discovery",
				"maintenance-cadence-review",
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("marks incomplete evidence, missing artifacts, and threshold failures", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			const runtimeLiveScenarios =
				snapshot.scenariosByPack["runtime-live-agent"];
			if (!runtimeLiveScenarios) {
				throw new Error("Expected runtime-live-agent scenarios fixture");
			}
			const baselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"runtime-live-agent",
				"baseline-v1.json",
			);
			const savedResultPath = getRuntimeLiveSavedResultPath(root);
			const savedResult = readJson(savedResultPath);
			const liveScenarios = savedResult.scenarios as Array<
				Record<string, unknown>
			>;
			const thresholdScenario = liveScenarios.find(
				(entry) => entry.id === "live-implement-next-governance-preflight",
			);
			if (!thresholdScenario) {
				throw new Error(
					"Expected live-implement-next-governance-preflight evidence",
				);
			}
			thresholdScenario.pass = true;
			thresholdScenario.duration_ms = 160;
			thresholdScenario.tool_call_count = 4;
			thresholdScenario.tool_success_rate = 0.75;
			thresholdScenario.error_count = 1;
			thresholdScenario.retry_count = 0;
			thresholdScenario.context_bytes = 1024;
			thresholdScenario.prompt_bytes = 240;
			thresholdScenario.output_tokens = 4001;
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
				"utf8",
			);

			const scenarios: Scenario[] = runtimeLiveScenarios.map(
				(scenario, index) => {
					if (index === 1) {
						const { live_runner_scenario_id, ...rest } = scenario;
						void live_runner_scenario_id;
						return rest as Scenario;
					}
					if (index === 0 || index === 2) {
						return {
							...scenario,
							live_runner_scenario_id:
								"live-implement-next-governance-preflight",
						};
					}
					return scenario;
				},
			);
			const result = buildRuntimeLiveAgentResults(
				root,
				scenarios,
				baselinePath,
			);
			expect(result.results).toHaveLength(4);
			expect(result.results.some((entry) => entry.status === "failed")).toBe(
				true,
			);
			expect(
				result.results.some((entry) =>
					entry.notes.some((note) =>
						note.startsWith("runtime-live-direct-evidence-reused:"),
					),
				),
			).toBe(true);
			expect(
				result.results.some((entry) =>
					entry.notes.some((note) =>
						note.startsWith("runtime-live-direct-evidence-missing:"),
					),
				),
			).toBe(true);
			expect(
				result.notes.some((note) =>
					note.startsWith("runtime-live-artifact-incomplete:"),
				),
			).toBe(true);

			unlinkSync(savedResultPath);
			unlinkSync(getRuntimeLiveSnapshotPath(root));
			const missing = buildRuntimeLiveAgentResults(
				root,
				scenarios,
				baselinePath,
			);
			expect(
				missing.results.filter((entry) => entry.status === "failed"),
			).toHaveLength(4);
			expect(missing.notes).toContain(
				"runtime-live-artifact-missing:.afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json;run:external fixed harness receipt;then:afol validate bench --pack runtime-live-agent --json",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("validation command entrypoint", () => {
	test("reports governance-history timing observation at the public entrypoint", () => {
		const observed = withCapturedStdout(() =>
			runValidationCommand(process.cwd(), [
				"bench",
				"--pack",
				"governance-history",
				"--timing-mode",
				"observe",
				"--json",
			]),
		);
		expect(observed.result).toBe(0);
		expect(JSON.parse(observed.stdout[0] ?? "{}")).toMatchObject({
			mode: "benchmark",
			timing_mode: "observe",
			status: "passed",
			pass: true,
		});
	}, 120_000);

	test("supports select, run, benchmark save, and argument failures", () => {
		const root = createFixtureRoot();
		try {
			const select = withCapturedStdout(() =>
				runValidationCommand(root, ["select", "--json"]),
			);
			expect(select.result).toBe(0);
			expect(JSON.parse(select.stdout[0] ?? "{}")).toMatchObject({
				mode: "select",
				schema_version: "1.0.0",
				command_family: "validation",
			});

			const runJson = withCapturedStdout(() =>
				runValidationCommand(root, [
					"run",
					"--pack",
					"runtime-live-agent",
					"--json",
				]),
			);
			expect(runJson.result).toBe(0);
			const runJsonPayload = JSON.parse(runJson.stdout[0] ?? "{}") as {
				mode: string;
				status: string;
				pass: boolean;
				command_results: Array<{
					reported_status?: string;
					reported_pass?: boolean;
				}>;
			};
			expect(runJsonPayload.mode).toBe("run");
			expect(runJsonPayload.pass).toBe(true);
			expect(runJsonPayload.command_results[0]?.reported_status).toBeDefined();

			const runText = withCapturedStdout(() =>
				runValidationCommand(root, ["run", "--pack", "mutation-safety"]),
			);
			expect(runText.result).toBe(0);
			const runTextPayload = JSON.parse(runText.stdout[0] ?? "{}") as {
				command_results: Array<{ reported_status?: string }>;
			};
			expect(
				runTextPayload.command_results[0]?.reported_status,
			).toBeUndefined();

			const cliKernelPaths = getCliKernelPaths(root);
			const scenarioDir = dirname(cliKernelPaths.scenarioPath);
			for (const name of readdirSync(scenarioDir)) {
				if (!name.endsWith(".json")) {
					continue;
				}
				const scenarioPath = join(scenarioDir, name);
				const scenario = readJson(scenarioPath);
				writeFileSync(
					scenarioPath,
					`${JSON.stringify(
						{
							...scenario,
							thresholds: {
								...(scenario.thresholds as Record<string, unknown>),
								max_duration_ms: 10_000,
								max_p95_ms: 10_000,
							},
						},
						null,
						2,
					)}\n`,
					"utf8",
				);
			}
			const baseline = readJson(cliKernelPaths.baselinePath);
			baseline.timing_p50_ms = 10_000;
			baseline.timing_p95_ms = 10_000;
			writeFileSync(
				cliKernelPaths.baselinePath,
				`${JSON.stringify(baseline, null, 2)}\n`,
				"utf8",
			);

			const benchmarkSave = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--save",
					"--json",
				]),
			);
			expect(benchmarkSave.result).toBe(0);
			const benchmarkPayload = JSON.parse(benchmarkSave.stdout[0] ?? "{}") as {
				saved_result_path?: string;
				saved_result_file?: string;
				mode: string;
				status: string;
			};
			expect(benchmarkPayload.mode).toBe("benchmark");
			expect(benchmarkPayload.status).toBe("passed");
			expect(benchmarkPayload.saved_result_path).toMatch(
				/^\.afol\/data\/benchmarks\/catalog\/results\//,
			);
			expect(benchmarkPayload.saved_result_file).toContain("cli-kernel-local");

			const benchmarkOutput = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--output",
					"tmp/custom-result.json",
					"--json",
				]),
			);
			expect(benchmarkOutput.result).toBe(0);
			const benchmarkOutputPayload = JSON.parse(
				benchmarkOutput.stdout[0] ?? "{}",
			) as {
				saved_result_path?: string;
			};
			expect(benchmarkOutputPayload.saved_result_path).toBe(
				"tmp/custom-result.json",
			);

			const missingOutput = withCapturedConsoleError(() =>
				runValidationCommand(root, ["bench", "--output"]),
			);
			expect(missingOutput.result).toBe(2);
			expect(missingOutput.stderr[0]).toContain("Missing value for --output");

			const unknownPack = withCapturedConsoleError(() =>
				runValidationCommand(root, ["bench", "--pack", "not-a-pack"]),
			);
			expect(unknownPack.result).toBe(2);
			expect(unknownPack.stderr[0]).toContain(
				"Unknown --pack value: not-a-pack",
			);

			const observedPerformancePack = withCapturedConsoleError(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"workbench-parity",
					"--timing-mode",
					"observe",
				]),
			);
			expect(observedPerformancePack.result).toBe(2);
			expect(observedPerformancePack.stderr[0]).toContain(
				"--timing-mode observe is limited to the governance-history pack",
			);

			const unknownArg = withCapturedConsoleError(() =>
				runValidationCommand(root, ["select", "--broken"]),
			);
			expect(unknownArg.result).toBe(2);
			expect(unknownArg.stderr[0]).toContain(
				"Unknown validation argument: --broken",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 180_000);

	test("fails JSON-reporting packs when the child emits malformed JSON", () => {
		const root = createFixtureRoot();
		try {
			unlinkSync(join(root, "cli"));
			mkdirSync(join(root, "cli"), { recursive: true });
			writeFileSync(
				join(root, "cli", "main.ts"),
				'process.stdout.write("{invalid-json\\n");\nprocess.exit(0);\n',
				"utf8",
			);

			const runJson = withCapturedStdout(() =>
				runValidationCommand(root, [
					"run",
					"--pack",
					"runtime-live-agent",
					"--json",
				]),
			);
			expect(runJson.result).toBe(2);
			const payload = JSON.parse(runJson.stdout[0] ?? "{}") as {
				status: string;
				pass: boolean;
				summary: { failed: number; passed: number };
				command_results: Array<{
					status: string;
					exit_code: number | null;
					reported_status?: string;
				}>;
			};
			expect(payload.status).toBe("failed");
			expect(payload.pass).toBe(false);
			expect(payload.summary).toMatchObject({ passed: 0, failed: 1 });
			expect(payload.command_results[0]).toMatchObject({
				status: "failed",
				exit_code: 0,
			});
			expect(payload.command_results[0]?.reported_status).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails JSON-reporting packs when the child emits empty or non-object JSON", () => {
		for (const [name, script] of [
			["empty", "process.exit(0);\n"],
			["array", 'process.stdout.write("[]");\nprocess.exit(0);\n'],
		] as const) {
			const root = createFixtureRoot();
			try {
				unlinkSync(join(root, "cli"));
				mkdirSync(join(root, "cli"), { recursive: true });
				writeFileSync(join(root, "cli", "main.ts"), script, "utf8");

				const runJson = withCapturedStdout(() =>
					runValidationCommand(root, [
						"run",
						"--pack",
						"runtime-live-agent",
						"--json",
					]),
				);
				expect(runJson.result, name).toBe(2);
				const payload = JSON.parse(runJson.stdout[0] ?? "{}") as {
					status: string;
					pass: boolean;
					summary: { failed: number; passed: number };
				};
				expect(payload.status, name).toBe("failed");
				expect(payload.pass, name).toBe(false);
				expect(payload.summary, name).toMatchObject({ passed: 0, failed: 1 });
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	test("fails JSON-reporting packs when the child reports failure", () => {
		const root = createFixtureRoot();
		try {
			unlinkSync(join(root, "cli"));
			mkdirSync(join(root, "cli"), { recursive: true });
			writeFileSync(
				join(root, "cli", "main.ts"),
				[
					"process.stdout.write(JSON.stringify({",
					'  status: "failed",',
					"  pass: false,",
					"  summary: { passed: 0, failed: 1 },",
					"}));",
					"process.exit(0);",
					"",
				].join("\n"),
				"utf8",
			);

			const runJson = withCapturedStdout(() =>
				runValidationCommand(root, [
					"run",
					"--pack",
					"runtime-live-agent",
					"--json",
				]),
			);
			expect(runJson.result).toBe(2);
			const payload = JSON.parse(runJson.stdout[0] ?? "{}") as {
				status: string;
				pass: boolean;
				summary: { failed: number; passed: number };
				command_results: Array<{
					status: string;
					exit_code: number | null;
					reported_pass?: boolean;
					reported_status?: string;
				}>;
			};
			expect(payload.status).toBe("failed");
			expect(payload.pass).toBe(false);
			expect(payload.summary).toMatchObject({ passed: 0, failed: 1 });
			expect(payload.command_results[0]).toMatchObject({
				status: "failed",
				exit_code: 0,
				reported_pass: false,
				reported_status: "failed",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("flags benchmark regressions and skipped scenarios", () => {
		const root = createFixtureRoot();
		try {
			const cliKernelPaths = getCliKernelPaths(root);
			const scenarioDir = dirname(cliKernelPaths.scenarioPath);
			const originalScenarios = new Map<string, string>();
			for (const name of readdirSync(scenarioDir)) {
				if (!name.endsWith(".json")) {
					continue;
				}
				const scenarioPath = join(scenarioDir, name);
				originalScenarios.set(scenarioPath, readFileSync(scenarioPath, "utf8"));
				const scenario = readJson(scenarioPath);
				writeFileSync(
					scenarioPath,
					`${JSON.stringify(
						{
							...scenario,
							implementation_status: "skipped",
							sandbox: false,
						},
						null,
						2,
					)}\n`,
					"utf8",
				);
			}

			const skipped = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--json",
				]),
			);
			expect(skipped.result).toBe(2);
			const skippedPayload = JSON.parse(skipped.stdout[0] ?? "{}") as {
				pass: boolean;
				status: string;
				results: Array<{ status: string }>;
			};
			expect(skippedPayload.status).toBe("skipped");
			expect(skippedPayload.pass).toBe(false);
			expect(
				skippedPayload.results.some((entry) => entry.status === "skipped"),
			).toBe(true);
			for (const [scenarioPath, originalScenario] of originalScenarios) {
				writeFileSync(scenarioPath, originalScenario, "utf8");
			}

			const baseline = readJson(cliKernelPaths.baselinePath);
			baseline.timing_p50_ms = 1;
			baseline.timing_p95_ms = 1;
			writeFileSync(
				cliKernelPaths.baselinePath,
				`${JSON.stringify(baseline, null, 2)}\n`,
				"utf8",
			);
			const failed = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--json",
				]),
			);
			expect(failed.result).toBe(2);
			const failedPayload = JSON.parse(failed.stdout[0] ?? "{}") as {
				results: Array<{ notes: string[]; status: string }>;
			};
			expect(
				failedPayload.results.some((entry) => entry.status === "failed"),
			).toBe(true);
			expect(
				failedPayload.results
					.flatMap((entry) => entry.notes)
					.some((note) =>
						note.startsWith("baseline-regression:timing_p50_ms:"),
					),
			).toBe(true);

			const missingBaselinePath = join(
				root,
				".afol",
				"data",
				"benchmarks",
				"catalog",
				"baselines",
				"cli-kernel-local",
				"baseline-v1.json",
			);
			if (existsSync(missingBaselinePath)) {
				rmSync(missingBaselinePath);
			}
			const missingBaseline = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--json",
				]),
			);
			expect(missingBaseline.result).toBe(2);
			const missingBaselinePayload = JSON.parse(
				missingBaseline.stdout[0] ?? "{}",
			) as {
				results: Array<{ status: string }>;
			};
			expect(
				missingBaselinePayload.results.some(
					(entry) => entry.status === "baseline-missing",
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120_000);
});
