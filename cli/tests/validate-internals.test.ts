import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_BENCH_MODEL } from "../services/benchmark/types";
import { saveBenchmarkPayload } from "../validate/benchmark-files";
import { buildResult } from "../validate/command";
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
import { validateRegistryContract } from "../validate/registry";
import {
	buildRuntimeLiveAgentResults,
	collectThresholdNotes,
} from "../validate/runtime-live";
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

function createFixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "validate-internals-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "benchmarks"), { recursive: true });
	cpSync(
		join(process.cwd(), ".agents", "config.json"),
		join(root, ".agents", "config.json"),
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
	cpSync(
		join(process.cwd(), ".afol", "data", "benchmarks", "snapshots"),
		join(root, ".afol", "data", "benchmarks", "snapshots"),
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
	return root;
}

function createBenchExecutionFixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "validate-bench-exec-"));
	mkdirSync(root, { recursive: true });
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
		["add", "tracked.txt", "mutate.js", "afol", "cli"],
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
		expect(summary).toHaveLength(15);
		expect(summary[0]).toMatchObject({
			pack_id: "cli-kernel-local",
			min_scenarios: 6,
			scenario_count: 6,
			baseline_present: true,
		});
		expect(summary.some((entry) => entry.baseline_present === false)).toBe(
			false,
		);
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

		expect(selectPacks({ scope: "default", changedPaths: [] })).toEqual({
			selected_pack_ids: [
				"cli-kernel-local",
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
	test("loads the real catalog and flags contract issues", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			expect(snapshot.schema_version).toBe("1.0.0");
			expect(snapshot.packs).toHaveLength(15);
			expect(snapshot.scenariosByPack["runtime-live-agent"]).toHaveLength(3);
			expect(snapshot.scenariosByPack["pstr-integrity"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["context-bundles"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["state-projection"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["memory-governance"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["library-knowledge"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["governance-history"]).toHaveLength(4);
			expect(snapshot.scenariosByPack["adm-governance"]).toHaveLength(4);
			expect(snapshot.baselinesByPack["cli-kernel-local"]?.timing_p50_ms).toBe(
				120,
			);
			expect(validateRegistryContract(snapshot)).toEqual([]);

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
});

describe("scenario benchmark execution", () => {
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
				sideEffect.result.notes.some((note) =>
					note.startsWith("side-effect-leak:"),
				),
			).toBe(true);

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
			writeFileSync(
				join(root, "sandbox-mutate.cjs"),
				[
					"const fs = require('node:fs');",
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

			const sandboxStatusAfter = spawnSync("git", ["status", "--porcelain"], {
				cwd: root,
				encoding: "utf8",
			});
			expect(sandboxStatusAfter.status).toBe(0);
			expect(sandboxStatusAfter.stdout).toBe(sandboxStatusBefore.stdout);
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
					min_p50_ms: 10,
					min_unknown_value: 1,
					median_latency_ms: 1,
				},
				{
					duration_ms: 120,
					timing_p50_ms: 9,
					timing_p95_ms: 60,
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
				"threshold-below-min:min_p50_ms:9<10",
				"threshold-metric-missing:min_unknown_value",
				"unsupported-threshold:median_latency_ms",
			]),
		);
	});

	test("builds runtime live results from direct evidence and fallback snapshots", () => {
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
			expect(fallback.results).toHaveLength(3);
			expect(fallback.results.every((entry) => entry.status === "passed")).toBe(
				true,
			);
			expect(fallback.notes).toContain(
				"runtime-live-agent-evidence-source:result",
			);

			unlinkSync(savedResultPath);
			const snapshotFallback = buildRuntimeLiveAgentResults(
				root,
				scenarios,
				baselinePath,
			);
			expect(snapshotFallback.results).toHaveLength(3);
			expect(
				snapshotFallback.results.every((entry) => entry.status === "passed"),
			).toBe(true);
			expect(snapshotFallback.notes).toContain(
				"runtime-live-agent-evidence-source:snapshot",
			);
			expect(
				snapshotFallback.results.every((entry) =>
					entry.notes.some((note) =>
						note.includes("live-runner-evidence-source:snapshot"),
					),
				),
			).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("profile constants align with spec child canonical values", () => {
		// Spec child 260423_2006 defines default live benchmark profile:
		//   runtime: codex, model: gpt-5.4-mini, reasoning_effort: medium
		expect(DEFAULT_BENCH_MODEL).toBe("gpt-5.4-mini/medium");
		// The validation layer in runtime-live.ts enforces medium (verified by
		// snapshot and payload checks). The live-runner.ts passes
		// model_reasoning_effort="medium" to codex exec. This test locks
		// the constant so any future drift is caught at typecheck+test time.
	});

	test("runtime-live-agent catalog scenarios map to all 3 spec child scenario IDs", () => {
		const root = createFixtureRoot();
		try {
			const snapshot = loadRegistry(root);
			const scenarios = snapshot.scenariosByPack["runtime-live-agent"] ?? [];
			expect(scenarios.length).toBe(3);

			const mappedIds = scenarios
				.map((s) => s.live_runner_scenario_id)
				.filter(Boolean);
			// Spec child "First Live Scenario Pack":
			//   live-tools-benchmark-discovery
			//   live-implement-next-governance-preflight
			//   live-implement-start-complete-evidence
			expect(mappedIds.sort()).toEqual([
				"live-implement-next-governance-preflight",
				"live-implement-start-complete-evidence",
				"live-tools-benchmark-discovery",
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
			thresholdScenario.output_tokens = 401;
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
			expect(result.results).toHaveLength(3);
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
			expect(missing.results.every((entry) => entry.status === "failed")).toBe(
				true,
			);
			expect(missing.notes).toContain(
				`runtime-live-artifact-missing:.afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json;run:afol validate bench --pack runtime-live-agent --json`,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("validation command entrypoint", () => {
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
	}, 30_000);

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
			const originalScenario = readJson(cliKernelPaths.scenarioPath);
			const skippedScenario = {
				...originalScenario,
				implementation_status: "skipped",
			};
			writeFileSync(
				cliKernelPaths.scenarioPath,
				`${JSON.stringify(skippedScenario, null, 2)}\n`,
				"utf8",
			);

			const skipped = withCapturedStdout(() =>
				runValidationCommand(root, [
					"bench",
					"--pack",
					"cli-kernel-local",
					"--json",
				]),
			);
			expect(skipped.result).toBe(0);
			const skippedPayload = JSON.parse(skipped.stdout[0] ?? "{}") as {
				results: Array<{ status: string }>;
			};
			expect(
				skippedPayload.results.some((entry) => entry.status === "skipped"),
			).toBe(true);

			writeFileSync(
				cliKernelPaths.scenarioPath,
				`${JSON.stringify(originalScenario, null, 2)}\n`,
				"utf8",
			);

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
	}, 30_000);
});
