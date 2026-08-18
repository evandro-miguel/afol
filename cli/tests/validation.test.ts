import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join } from "node:path";

const kernelPath = `${process.cwd()}/cli/main.ts`;
const runtimeLiveBenchmarkProfile = {
	runtime: "codex",
	model: "gpt-5.4-mini",
	reasoning_effort: "medium",
};
const runtimeLiveBenchmarkRefreshCommand = "external fixed harness receipt";
const runtimeLiveBenchmarkValidationCommand =
	"afol validate bench --pack runtime-live-agent --json";
const runtimeLiveBenchmarkRefreshGuidance = `run:${runtimeLiveBenchmarkRefreshCommand};then:${runtimeLiveBenchmarkValidationCommand}`;
const runtimeLiveBenchmarkRefreshNote = `obtain a fresh receipt from the external fixed harness, place it at .afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json, then validate with ${runtimeLiveBenchmarkValidationCommand}`;
const slowValidationTestTimeoutMs =
	process.platform === "win32" ? 360_000 : 60_000;
const cliKernelValidationTestTimeoutMs = 60_000;
const cliKernelRunTestTimeoutMs = 120_000;

function runKernel(
	args: string[],
	cwd = process.cwd(),
): ReturnType<typeof spawnSync> {
	return spawnSync("bun", [kernelPath, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
	return JSON.parse(stdout) as Record<string, unknown>;
}

const expectedMutationScenarioIds = [
	"mut-dry-run",
	"mut-move",
	"mut-patch",
	"mut-protected",
	"mut-undo",
] as const;

function relaxMutationSafetyTimingLimits(root: string): void {
	const timingLimitMs = 60_000;
	const scenariosRoot = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"scenarios",
		"mutation-safety",
	);
	for (const scenarioId of expectedMutationScenarioIds) {
		const path = join(scenariosRoot, `${scenarioId}.json`);
		const scenario = parseJsonOutput(readFileSync(path, "utf8"));
		const thresholds = scenario.thresholds as Record<string, unknown>;
		for (const key of [
			"max_duration_ms",
			"max_p50_ms",
			"max_p95_ms",
		] as const) {
			if (Object.hasOwn(thresholds, key)) thresholds[key] = timingLimitMs;
		}
		writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
	}
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
	const baseline = parseJsonOutput(readFileSync(baselinePath, "utf8"));
	const os = platform();
	const cpuClass = (cpus()[0]?.model ?? "unknown-cpu")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	baseline.host_profile_id = `${os}-${arch()}-${cpuClass}`;
	baseline.os = os;
	baseline.arch = arch();
	baseline.cpu_class = cpuClass;
	baseline.bun_version = Bun.version;
	baseline.runtime_version = Bun.version;
	const baselineScenarios = baseline.scenarios as Record<
		string,
		Record<string, unknown>
	>;
	for (const scenarioId of expectedMutationScenarioIds) {
		const scenarioBaseline = baselineScenarios[scenarioId];
		if (scenarioBaseline === undefined) {
			throw new Error(`Missing mutation baseline fixture: ${scenarioId}`);
		}
		scenarioBaseline.timing_p50_ms = timingLimitMs;
		scenarioBaseline.timing_p95_ms = timingLimitMs;
	}
	writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function relaxCliKernelTimingLimits(root: string): void {
	const timingLimitMs = 60_000;
	const scenariosRoot = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"scenarios",
		"cli-kernel-local",
	);
	for (const name of readdirSync(scenariosRoot)) {
		if (!name.endsWith(".json")) continue;
		const path = join(scenariosRoot, name);
		const scenario = parseJsonOutput(readFileSync(path, "utf8"));
		const thresholds = scenario.thresholds as Record<string, unknown>;
		for (const key of [
			"max_duration_ms",
			"max_p50_ms",
			"max_p95_ms",
		] as const) {
			if (Object.hasOwn(thresholds, key)) thresholds[key] = timingLimitMs;
		}
		writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
	}
	const baselinePath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"catalog",
		"baselines",
		"cli-kernel-local",
		"baseline-v1.json",
	);
	const baseline = parseJsonOutput(readFileSync(baselinePath, "utf8"));
	baseline.timing_p50_ms = timingLimitMs;
	baseline.timing_p95_ms = timingLimitMs;
	writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function rebindEvolutionProvenance(root: string): void {
	const commit = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).stdout.trim();
	const timestamp = new Date().toISOString();
	const historicalBaselinePath = join(
		root,
		".afol/data/benchmarks/catalog/baselines/evolution-core/baseline-v1.json",
	);
	const baselinePath = historicalBaselinePath.replace(
		"baseline-v1.json",
		"baseline-v2.json",
	);
	const scenarioPath = join(
		root,
		".afol/data/benchmarks/catalog/scenarios/evolution-core/evolution-status-contract.json",
	);
	const baseline = readJson(historicalBaselinePath);
	baseline.baseline_id = "evolution-core-v2";
	baseline.run_id = "bench-evolution-core-evolution-status-contract-1.1.0";
	baseline.git_commit = commit;
	baseline.timestamp = timestamp;
	baseline.provenance = "test-fixture-rebind";
	writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
	const scenario = readJson(scenarioPath);
	const measurement = scenario.measurement as Record<string, unknown>;
	measurement.git_commit = commit;
	measurement.timestamp = timestamp;
	measurement.source = "test-fixture-rebind";
	writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
}

function createValidationFixtureRoot(mutate?: (root: string) => void): string {
	const root = mkdtempSync(join(tmpdir(), "validation-fixture-"));
	mkdirSync(join(root, ".agents"), { recursive: true });
	mkdirSync(join(root, ".afol", "data", "benchmarks"), { recursive: true });
	cpSync(
		join(process.cwd(), ".afol", "config.json"),
		join(root, ".afol", "config.json"),
	);
	cpSync(
		join(process.cwd(), "src", "project-template", ".agents", "lock.json"),
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
	// These entries are source aliases for the fixture, not symlink-security
	// scenarios. Copying them keeps validation portable on Windows hosts where
	// symlink creation requires Developer Mode or an elevated privilege.
	cpSync(join(process.cwd(), "cli"), join(root, "cli"), { recursive: true });
	cpSync(join(process.cwd(), "afol"), join(root, "afol"));
	for (const args of [
		["init"],
		["config", "user.email", "bench@example.com"],
		["config", "user.name", "Bench User"],
		["add", ".agents", ".afol", "cli", "afol"],
		["commit", "-m", "fixture"],
	] as const) {
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
	rebindEvolutionProvenance(root);
	mutate?.(root);
	return root;
}

function readJson(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function getRuntimeLiveArtifactPaths(root: string): {
	snapshotPath: string;
	savedResultPath: string;
} {
	const snapshotPath = join(
		root,
		".afol",
		"data",
		"benchmarks",
		"snapshots",
		"runtime-flow-live-agent-v4-latest.json",
	);
	const snapshot = readJson(snapshotPath);
	snapshot.schema_version = "1.0.0";
	snapshot.generated_at = new Date().toISOString();
	snapshot.stale_after_days = 7;
	snapshot.benchmark_profile = runtimeLiveBenchmarkProfile;
	writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
	const savedResultPath = join(root, snapshot.saved_result_path as string);
	const savedResult = existsSync(savedResultPath)
		? readJson(savedResultPath)
		: { ...snapshot };
	savedResult.benchmark_profile = runtimeLiveBenchmarkProfile;
	mkdirSync(join(savedResultPath, ".."), { recursive: true });
	writeFileSync(savedResultPath, `${JSON.stringify(savedResult, null, 2)}\n`);
	return { snapshotPath, savedResultPath };
}

describe("validation command family", () => {
	test("v select emits deterministic selector JSON", () => {
		const proc = runKernel(["v", "select", "--json"]);
		expect(proc.status).toBe(0);
		expect((proc.stdout as string).trim().split("\n").length).toBe(1);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.schema_version).toBe("1.0.0");
		expect(payload.command_family).toBe("validation");
		expect(payload.mode).toBe("select");
		expect(Array.isArray(payload.selected_pack_ids)).toBe(true);
		const selected = payload.selected_pack_ids as string[];
		expect(selected.includes("cli-kernel-local")).toBe(true);
	});

	test("v select wb selects workbench pack only", () => {
		const proc = runKernel(["v", "select", "wb", "--json"]);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.scope).toBe("wb");
		expect(payload.selected_pack_ids).toEqual(["workbench-parity"]);
	});

	test("v select treats retired runtime paths as default fallback", () => {
		const proc = runKernel([
			"v",
			"select",
			"--changed-path",
			".agents/runtime/core.py",
			"--json",
		]);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		const selected = payload.selected_pack_ids as string[];
		expect(selected).toEqual(["cli-kernel-local"]);
	});

	// biome-ignore format: Keep the existing test body stable when setting its integration timeout.
	test("v select changed-path routes current services/commands paths to benchmark packs", () => {
		const cliProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/main.ts",
			"--json",
		]);
		expect(cliProc.status).toBe(0);
		const cliPayload = parseJsonOutput(cliProc.stdout as string);
		expect(cliPayload.selected_pack_ids).toEqual(["cli-kernel-local"]);

		const catalogRulesProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/catalog/rules.ts",
			"--json",
		]);
		expect(catalogRulesProc.status).toBe(0);
		const catalogRulesPayload = parseJsonOutput(
			catalogRulesProc.stdout as string,
		);
		expect(catalogRulesPayload.selected_pack_ids).toEqual(["routing-accuracy"]);

		const catalogCommandProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/catalog.ts",
			"--json",
		]);
		expect(catalogCommandProc.status).toBe(0);
		const catalogCommandPayload = parseJsonOutput(
			catalogCommandProc.stdout as string,
		);
		expect(catalogCommandPayload.selected_pack_ids).toEqual([
			"routing-accuracy",
		]);

		const mutationProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/files/example.ts",
			"--json",
		]);
		expect(mutationProc.status).toBe(0);
		const mutationPayload = parseJsonOutput(mutationProc.stdout as string);
		expect(mutationPayload.selected_pack_ids).toEqual(["mutation-safety"]);

		const mutationCommandProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/file.ts",
			"--json",
		]);
		expect(mutationCommandProc.status).toBe(0);
		const mutationCommandPayload = parseJsonOutput(
			mutationCommandProc.stdout as string,
		);
		expect(mutationCommandPayload.selected_pack_ids).toEqual([
			"mutation-safety",
		]);

		const mutationServiceProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/mutations/journal.ts",
			"--json",
		]);
		expect(mutationServiceProc.status).toBe(0);
		const mutationServicePayload = parseJsonOutput(
			mutationServiceProc.stdout as string,
		);
		expect(mutationServicePayload.selected_pack_ids).toEqual([
			"mutation-safety",
		]);

		const projectRootProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/project/root.ts",
			"--json",
		]);
		expect(projectRootProc.status).toBe(0);
		const projectRootPayload = parseJsonOutput(
			projectRootProc.stdout as string,
		);
		expect(projectRootPayload.selected_pack_ids).toEqual(["mutation-safety"]);

		const projectPathsProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/project/paths.ts",
			"--json",
		]);
		expect(projectPathsProc.status).toBe(0);
		const projectPathsPayload = parseJsonOutput(
			projectPathsProc.stdout as string,
		);
		expect(projectPathsPayload.selected_pack_ids).toEqual(["mutation-safety"]);

		const updateServiceProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/update/check.ts",
			"--json",
		]);
		expect(updateServiceProc.status).toBe(0);
		const updateServicePayload = parseJsonOutput(
			updateServiceProc.stdout as string,
		);
		expect(updateServicePayload.selected_pack_ids).toEqual(["update-safety"]);

		const updateCommandProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/update.ts",
			"--json",
		]);
		expect(updateCommandProc.status).toBe(0);
		const updateCommandPayload = parseJsonOutput(
			updateCommandProc.stdout as string,
		);
		expect(updateCommandPayload.selected_pack_ids).toEqual(["update-safety"]);

		const wbProc = runKernel([
			"v",
			"select",
			"--changed-path",
			".afol/wb/session/task.md",
			"--json",
		]);
		expect(wbProc.status).toBe(0);
		const wbPayload = parseJsonOutput(wbProc.stdout as string);
		expect(wbPayload.selected_pack_ids).toEqual(["workbench-parity"]);

		const mcpProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/mcp/adapter.ts",
			"--json",
		]);
		expect(mcpProc.status).toBe(0);
		const mcpPayload = parseJsonOutput(mcpProc.stdout as string);
		expect(mcpPayload.selected_pack_ids).toEqual(["mcp-parity"]);

		const tokenProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"docs/standards/prompt-context-guidelines.md",
			"--json",
		]);
		expect(tokenProc.status).toBe(0);
		const tokenPayload = parseJsonOutput(tokenProc.stdout as string);
		expect(tokenPayload.selected_pack_ids).toEqual(["token-economy"]);

		const pstrProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/pstr/index.ts",
			"--json",
		]);
		expect(pstrProc.status).toBe(0);
		expect(
			parseJsonOutput(pstrProc.stdout as string).selected_pack_ids,
		).toEqual(["pstr-integrity"]);

		const ctxProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/context.ts",
			"--json",
		]);
		expect(ctxProc.status).toBe(0);
		expect(parseJsonOutput(ctxProc.stdout as string).selected_pack_ids).toEqual(
			["context-bundles"],
		);

		const stateProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/state/session-state.ts",
			"--json",
		]);
		expect(stateProc.status).toBe(0);
		expect(
			parseJsonOutput(stateProc.stdout as string).selected_pack_ids,
		).toEqual(["state-projection"]);

		const memoryProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/memory.ts",
			"--json",
		]);
		expect(memoryProc.status).toBe(0);
		expect(
			parseJsonOutput(memoryProc.stdout as string).selected_pack_ids,
		).toEqual(["memory-governance"]);

		const libraryProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/library/crud.ts",
			"--json",
		]);
		expect(libraryProc.status).toBe(0);
		expect(
			parseJsonOutput(libraryProc.stdout as string).selected_pack_ids,
		).toEqual(["library-knowledge"]);

		const governanceProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/spec-gate/changelog.ts",
			"--json",
		]);
		expect(governanceProc.status).toBe(0);
		expect(
			parseJsonOutput(governanceProc.stdout as string).selected_pack_ids,
		).toEqual(["governance-history"]);

		const admProc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/services/adm/validate.ts",
			"--json",
		]);
		expect(admProc.status).toBe(0);
		expect(parseJsonOutput(admProc.stdout as string).selected_pack_ids).toEqual(
			["adm-governance"],
		);
	}, slowValidationTestTimeoutMs);

	test("v select changed-path keeps generic cli fallback on cli-kernel-local", () => {
		const proc = runKernel([
			"v",
			"select",
			"--changed-path",
			"cli/commands/validate.ts",
			"--json",
		]);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
	});

	test("plain validate stays on structural validation even when benchmark registry exists", () => {
		const fixtureRoot = createValidationFixtureRoot();
		const proc = runKernel(["validate", "--json"], fixtureRoot);
		expect(proc.status).toBe(1);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.schema).toBe("afol.result/v1");
		expect(payload.exit_code).toBe(1);
		expect(payload.mode).toBeUndefined();
		expect(typeof payload.ok).toBe("boolean");
		expect(payload.report).toBeDefined();
		expect(Array.isArray(payload.checks)).toBe(true);
	});

	test(
		"validate run changed-path executes selected AFOL-native validation commands",
		() => {
			const proc = runKernel([
				"validate",
				"run",
				"--changed-path",
				"cli/commands/validate.ts",
				"--json",
			]);
			const payload = parseJsonOutput(proc.stdout as string);
			const failureContext = JSON.stringify({
				status: payload.status,
				summary: payload.summary,
				contract_issues: payload.contract_issues,
				command_results: (
					payload.command_results as Array<Record<string, unknown>>
				).map(({ pack_id, status, exit_code, stderr_tail }) => ({
					pack_id,
					status,
					exit_code,
					stderr_tail,
				})),
			});
			expect(proc.status, failureContext).toBe(0);
			expect(payload.mode).toBe("run");
			expect(payload.status).toBe("passed");
			expect(payload.pass).toBe(true);
			expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
			const results = payload.command_results as Array<Record<string, unknown>>;
			expect(results.length).toBeGreaterThan(0);
			expect(
				results.every((entry) => entry.pack_id === "cli-kernel-local"),
			).toBe(true);
			expect(results.every((entry) => entry.status === "passed")).toBe(true);
			expect(results.every((entry) => Array.isArray(entry.command))).toBe(true);
			expect(JSON.stringify(results)).not.toContain("just");
			expect(payload.contract_issues).toEqual([]);
		},
		cliKernelRunTestTimeoutMs,
	);

	test("v select changed-path does not route docs/spec-tests by runtime or mcp substrings", () => {
		const proc = runKernel([
			"v",
			"select",
			"--changed-path",
			"docs/arc/SPECS/F-10/spec-tests/260521_0140_runtime-adapters-and-mcp-parity_spec-test_01.md",
			"--json",
		]);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
		const selected = payload.selected_pack_ids as string[];
		expect(selected.includes("mcp-parity")).toBe(false);
		expect(selected.includes("runtime-live-agent")).toBe(false);
	});

	test(
		"v bench returns benchmark schema with scenario results",
		() => {
			const root = createValidationFixtureRoot(relaxCliKernelTimingLimits);
			try {
				const proc = runKernel(
					["v", "bench", "--pack", "cli-kernel-local", "--json"],
					root,
				);
				expect(proc.status).toBe(0);
				const payload = parseJsonOutput(proc.stdout as string);
				expect(payload.mode).toBe("benchmark");
				expect(payload.benchmark_result_schema_version).toBe("1.0.0");
				expect(payload.status).toBe("passed");
				expect(payload.pass).toBe(true);
				expect(payload.summary).toEqual({
					total: 8,
					passed: 8,
					failed: 0,
					skipped: 0,
					baseline_missing: 0,
				});
				const results = payload.results as Array<Record<string, unknown>>;
				expect(results.length).toBeGreaterThanOrEqual(8);
				const first =
					results.find((entry) => entry.status === "passed") ?? results[0];
				if (!first) {
					throw new Error("Expected at least one benchmark result");
				}
				expect(typeof first.scenario_id).toBe("string");
				expect(typeof first.duration_ms).toBe("number");
				expect(typeof first.status).toBe("string");
				expect(typeof first.baseline_reference).toBe("string");
				expect(
					(first.baseline_reference as string).startsWith(
						".afol/data/benchmarks/catalog/baselines/",
					),
				).toBe(true);
				expect((first.baseline_reference as string).startsWith("/")).toBe(
					false,
				);
				expect(typeof first.threshold_reference).toBe("object");
				expect(first.pass).toBe(true);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		cliKernelValidationTestTimeoutMs,
	);

	test(
		"bench --pack aliases to validation benchmark contract",
		() => {
			const root = createValidationFixtureRoot(relaxCliKernelTimingLimits);
			try {
				const proc = runKernel(
					["bench", "--pack", "cli-kernel-local", "--json"],
					root,
				);
				expect(proc.status).toBe(0);
				const payload = parseJsonOutput(proc.stdout as string);
				expect(payload.mode).toBe("benchmark");
				expect(payload.selected_pack_ids).toEqual(["cli-kernel-local"]);
				expect(payload.pass).toBe(true);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		cliKernelValidationTestTimeoutMs,
	);

	test(
		"v bench runs update-safety pack with compact update envelopes",
		() => {
			const proc = runKernel([
				"v",
				"bench",
				"--pack",
				"update-safety",
				"--json",
			]);
			expect(proc.status, proc.stderr as string).toBe(0);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(payload.mode).toBe("benchmark");
			expect(payload.result_count).toBe(7);
			expect(payload.status).toBe("passed");
			expect(payload.pass).toBe(true);
			expect(payload.summary).toEqual({
				total: 7,
				passed: 7,
				failed: 0,
				skipped: 0,
				baseline_missing: 0,
			});
			const results = payload.results as Array<Record<string, unknown>>;
			expect(results.length).toBe(7);
			expect(results.every((entry) => entry.pack_id === "update-safety")).toBe(
				true,
			);
			expect(results.some((entry) => entry.status === "failed")).toBe(false);
			const scenarioIds = new Set(
				results.map((entry) => String(entry.scenario_id)),
			);
			expect(scenarioIds.has("fleet-check")).toBe(true);
			expect(scenarioIds.has("fleet-preview")).toBe(true);
			expect(scenarioIds.has("fleet-apply")).toBe(true);
		},
		slowValidationTestTimeoutMs,
	);

	test(
		"v bench runs mutation-safety against the portable observed baseline",
		() => {
			const root = createValidationFixtureRoot(relaxMutationSafetyTimingLimits);
			try {
				const proc = runKernel(
					["v", "bench", "--pack", "mutation-safety", "--json"],
					root,
				);
				const payload = parseJsonOutput(proc.stdout as string);
				const failureContext = JSON.stringify({
					status: payload.status,
					pass: payload.pass,
					summary: payload.summary,
					contract_issues: payload.contract_issues,
					results: (payload.results as Array<Record<string, unknown>>).map(
						({ scenario_id, status, pass, notes }) => ({
							scenario_id,
							status,
							pass,
							notes,
						}),
					),
					stderr_tail: String(proc.stderr ?? "").slice(-1_024),
				});
				expect(proc.status, failureContext).toBe(0);
				expect(payload.mode).toBe("benchmark");
				expect(payload.status).toBe("passed");
				expect(payload.pass).toBe(true);
				expect(payload.result_count).toBe(5);
				expect(payload.contract_issues).toEqual([]);
				expect(payload.summary).toEqual({
					total: 5,
					passed: 5,
					failed: 0,
					skipped: 0,
					baseline_missing: 0,
				});
				const results = payload.results as Array<Record<string, unknown>>;
				expect(results.map((entry) => entry.scenario_id).sort()).toEqual([
					...expectedMutationScenarioIds,
				]);
				expect(
					results.every(
						(entry) =>
							entry.pack_id === "mutation-safety" && entry.status === "passed",
					),
				).toBe(true);
				expect(
					results.every((entry) => {
						const notes = entry.notes;
						return (
							Array.isArray(notes) &&
							notes.every(
								(note) =>
									typeof note !== "string" ||
									!note.startsWith("baseline-incompatible:"),
							)
						);
					}),
				).toBe(true);
				expect(
					results.some((entry) => entry.status === "baseline-missing"),
				).toBe(false);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		slowValidationTestTimeoutMs,
	);

	test(
		"v bench runs mcp-parity pack without skipped adapter stubs",
		() => {
			const proc = runKernel(["v", "bench", "--pack", "mcp-parity", "--json"]);
			expect(proc.status).toBe(0);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(payload.mode).toBe("benchmark");
			expect(payload.status).toBe("passed");
			expect(payload.pass).toBe(true);
			expect(payload.result_count).toBe(5);
			expect(payload.summary).toEqual({
				total: 5,
				passed: 5,
				failed: 0,
				skipped: 0,
				baseline_missing: 0,
			});
			const results = payload.results as Array<Record<string, unknown>>;
			expect(results.map((entry) => entry.scenario_id).sort()).toEqual([
				"mcp-error",
				"mcp-evidence",
				"mcp-mutation",
				"mcp-rule",
				"mcp-status",
			]);
			expect(results.every((entry) => entry.status === "passed")).toBe(true);
			expect(
				results.some((entry) =>
					((entry.notes as string[] | undefined) ?? []).includes(
						"not-implemented-live-runner",
					),
				),
			).toBe(false);
		},
		slowValidationTestTimeoutMs,
	);

	test(
		"v bench --save persists a benchmark result artifact under default results directory",
		() => {
			const fixtureRoot = createValidationFixtureRoot(
				relaxCliKernelTimingLimits,
			);
			const proc = runKernel(
				["v", "bench", "--pack", "cli-kernel-local", "--save", "--json"],
				fixtureRoot,
			);
			expect(proc.status).toBe(0);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(typeof payload.saved_result_path).toBe("string");
			const savedPath = payload.saved_result_path as string;
			expect(
				savedPath.startsWith(".afol/data/benchmarks/catalog/results/"),
			).toBe(true);
			const absoluteSavedPath = join(fixtureRoot, savedPath);
			expect(existsSync(absoluteSavedPath)).toBe(true);
			const savedPayload = readJson(absoluteSavedPath);
			expect(savedPayload.mode).toBe("benchmark");
			const savedResults = savedPayload.results as Array<
				Record<string, unknown>
			>;
			expect(savedResults.length).toBeGreaterThan(0);
			const first = savedResults[0];
			if (!first) {
				throw new Error("Expected at least one saved benchmark result");
			}
			expect(typeof first.run_id).toBe("string");
			expect(typeof first.pack_id).toBe("string");
			expect(typeof first.baseline_id).toBe("string");
			expect(typeof first.git_commit).toBe("string");
		},
		cliKernelValidationTestTimeoutMs,
	);

	test(
		"v bench --output writes to explicit path",
		() => {
			const fixtureRoot = createValidationFixtureRoot(
				relaxCliKernelTimingLimits,
			);
			const outputPath = join(
				fixtureRoot,
				".afol",
				"tmp",
				"f11",
				"cli-kernel-local-result.json",
			);
			const proc = runKernel(
				[
					"v",
					"bench",
					"--pack",
					"cli-kernel-local",
					"--output",
					outputPath,
					"--json",
				],
				fixtureRoot,
			);
			expect(proc.status).toBe(0);
			expect(existsSync(outputPath)).toBe(true);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(payload.saved_result_path).toBe(
				".afol/tmp/f11/cli-kernel-local-result.json",
			);
			const savedPayload = readJson(outputPath);
			expect(savedPayload.mode).toBe("benchmark");
		},
		cliKernelValidationTestTimeoutMs,
	);

	test(
		"v bench fails when metrics violate threshold and baseline",
		() => {
			const fixtureRoot = createValidationFixtureRoot((root) => {
				const scenarioPath = join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"scenarios",
					"cli-kernel-local",
					"cli-help-compact.json",
				);
				const scenario = readJson(scenarioPath);
				const thresholds = scenario.thresholds as Record<string, unknown>;
				thresholds.max_output_tokens = 1;
				writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);

				const baselinePath = join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"baselines",
					"cli-kernel-local",
					"baseline-v1.json",
				);
				const baseline = readJson(baselinePath);
				baseline.timing_p50_ms = 1;
				baseline.timing_p95_ms = 1;
				writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
			});

			const proc = runKernel(
				["v", "bench", "--pack", "cli-kernel-local", "--json"],
				fixtureRoot,
			);
			expect(proc.status).toBe(2);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(payload.status).toBe("failed");
			expect(payload.pass).toBe(false);
			const results = payload.results as Array<Record<string, unknown>>;
			const target = results.find(
				(entry) => entry.scenario_id === "cli-help-compact",
			);
			expect(target?.status).toBe("failed");
			expect(target?.pass).toBe(false);
			expect(Array.isArray(target?.notes)).toBe(true);
			const notes = target?.notes as string[];
			expect(
				notes.some((entry) =>
					entry.startsWith("threshold-exceeded:max_output_tokens:"),
				),
			).toBe(true);
			expect(
				notes.some((entry) =>
					entry.startsWith("baseline-regression:timing_p95_ms:"),
				),
			).toBe(true);
			const summary = payload.summary as Record<string, unknown>;
			expect(summary.failed).toBe(8);
			expect(summary.skipped).toBe(0);
		},
		cliKernelValidationTestTimeoutMs,
	);

	test("v bench runtime-live-agent fails on a partial live snapshot without fallback mapping", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
			const savedResult = readJson(savedResultPath);
			savedResult.scenarios = [
				{
					id: "live-implement-start-complete-evidence",
					pass: true,
					duration_ms: 120,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
			];
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
			);
		});

		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(2);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("failed");
		expect(payload.pass).toBe(false);
		const notes = payload.notes as string[];
		expect(
			notes.some((entry) =>
				entry.startsWith(
					"runtime-live-agent-artifact:.afol/data/benchmarks/results/",
				),
			),
		).toBe(true);
		expect(notes).toContain(
			`runtime-live-agent-refresh:${runtimeLiveBenchmarkRefreshCommand}`,
		);
		expect(notes).toContain(
			`runtime-live-agent-refresh-note:${runtimeLiveBenchmarkRefreshNote}`,
		);
		expect(
			notes.some((entry) =>
				entry.startsWith("runtime-live-artifact-incomplete:"),
			),
		).toBe(true);
		const results = payload.results as Array<Record<string, unknown>>;
		expect(results.length).toBe(4);
		expect(results.some((result) => result.status === "failed")).toBe(true);
		expect(results.some((result) => result.status === "passed")).toBe(true);
		expect(
			results.some((result) =>
				(result.notes as string[]).some((entry) =>
					entry.startsWith("runtime-live-direct-evidence-missing:"),
				),
			),
		).toBe(true);
		expect(
			results
				.flatMap((result) => result.notes as string[])
				.some((entry) => entry.startsWith("live-runner-mapping-fallback:")),
		).toBe(false);
		const summary = payload.summary as Record<string, unknown>;
		expect(summary.total).toBe(4);
		expect(summary.passed).toBe(1);
		expect(summary.failed).toBe(3);
		expect(summary.skipped).toBe(0);
		expect(summary.baseline_missing).toBe(0);
	});

	test("v bench runtime-live-agent passes when every scenario has direct live evidence", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
			const savedResult = readJson(savedResultPath);
			savedResult.scenarios = [
				{
					id: "live-implement-start-complete-evidence",
					pass: true,
					duration_ms: 120,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-tools-benchmark-discovery",
					pass: true,
					duration_ms: 140,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-implement-next-governance-preflight",
					pass: true,
					duration_ms: 160,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "maintenance-cadence-review",
					pass: true,
					duration_ms: 120,
					tool_call_count: 4,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1240,
					prompt_bytes: 240,
					token_usage: {
						available: true,
						input_tokens: 220,
						output_tokens: 80,
						total_tokens: 300,
						cached_input_tokens: 0,
						reasoning_output_tokens: 0,
					},
				},
			];
			savedResult.pass = true;
			savedResult.duration_ms = 540;
			savedResult.tool_call_count = 7;
			savedResult.error_count = 0;
			savedResult.retry_count = 0;
			savedResult.context_bytes_total = 4312;
			savedResult.prompt_bytes_total = 960;
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
			);
		});

		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("passed");
		expect(payload.pass).toBe(true);
		const notes = payload.notes as string[];
		expect(
			notes.some((entry) =>
				entry.startsWith("runtime-live-artifact-incomplete:"),
			),
		).toBe(false);
		expect(
			notes.some((entry) =>
				entry.startsWith(
					"runtime-live-agent-artifact:.afol/data/benchmarks/results/",
				),
			),
		).toBe(true);
		expect(notes).toContain(
			`runtime-live-agent-refresh:${runtimeLiveBenchmarkRefreshCommand}`,
		);
		expect(notes).toContain(
			`runtime-live-agent-refresh-note:${runtimeLiveBenchmarkRefreshNote}`,
		);
		const results = payload.results as Array<Record<string, unknown>>;
		expect(results.length).toBe(4);
		expect(results.filter((result) => result.status === "passed")).toHaveLength(
			4,
		);
		const maintenanceResult = results.find(
			(entry) => entry.scenario_id === "live-maintenance-cadence",
		);
		expect(maintenanceResult?.status).toBe("passed");
		expect(maintenanceResult?.pass).toBe(true);
		expect(maintenanceResult?.output_tokens).toBe(80);
		expect(maintenanceResult?.tool_success_rate).toBe(1);
		expect(
			results
				.flatMap((result) => result.notes as string[])
				.some((entry) => entry.startsWith("live-runner-mapping-fallback:")),
		).toBe(false);
		expect(
			results
				.filter((result) => result.status !== "skipped")
				.every((result) => {
					const resultNotes = result.notes as string[];
					return resultNotes.some((entry) =>
						entry.startsWith(
							"live-runner-artifact:.afol/data/benchmarks/results/",
						),
					);
				}),
		).toBe(true);
		const summary = payload.summary as Record<string, unknown>;
		expect(summary.total).toBe(4);
		expect(summary.passed).toBe(4);
		expect(summary.failed).toBe(0);
		expect(summary.skipped).toBe(0);
		expect(summary.baseline_missing).toBe(0);
	});

	test("v bench runtime-live-agent pins maintenance cadence thresholds", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
			const savedResult = readJson(savedResultPath);
			savedResult.scenarios = [
				{
					id: "live-implement-start-complete-evidence",
					pass: true,
					duration_ms: 120,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-tools-benchmark-discovery",
					pass: true,
					duration_ms: 140,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-implement-next-governance-preflight",
					pass: true,
					duration_ms: 160,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "maintenance-cadence-review",
					pass: true,
					duration_ms: 120,
					tool_call_count: 4,
					tool_success_rate: 0.97,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1240,
					prompt_bytes: 240,
					token_usage: {
						available: true,
						input_tokens: 220,
						output_tokens: 4001,
						total_tokens: 621,
						cached_input_tokens: 0,
						reasoning_output_tokens: 0,
					},
				},
			];
			savedResult.pass = true;
			savedResult.duration_ms = 540;
			savedResult.tool_call_count = 7;
			savedResult.error_count = 0;
			savedResult.retry_count = 0;
			savedResult.context_bytes_total = 4312;
			savedResult.prompt_bytes_total = 960;
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
			);
		});

		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(2);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("failed");
		expect(payload.pass).toBe(false);
		const results = payload.results as Array<Record<string, unknown>>;
		const target = results.find(
			(entry) => entry.scenario_id === "live-maintenance-cadence",
		);
		expect(target?.status).toBe("failed");
		expect(target?.pass).toBe(false);
		expect(target?.tool_success_rate).toBe(0.97);
		expect(target?.output_tokens).toBe(4001);
		const notes = target?.notes as string[];
		expect(notes).toContain(
			"threshold-below-min:min_tool_success_rate:0.97<0.98",
		);
		expect(notes).toContain("threshold-exceeded:max_output_tokens:4001>4000");
		const summary = payload.summary as Record<string, unknown>;
		expect(summary.passed).toBe(3);
		expect(summary.failed).toBe(1);
		expect(summary.skipped).toBe(0);
	});

	test("v bench runtime-live-agent uses the tracked snapshot when saved result is absent", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
			if (existsSync(savedResultPath)) {
				unlinkSync(savedResultPath);
			}
		});

		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("passed");
		expect(payload.pass).toBe(true);
		expect(payload.notes).toContain(
			"runtime-live-agent-evidence-source:snapshot",
		);
		const results = payload.results as Array<Record<string, unknown>>;
		expect(results.length).toBe(4);
		expect(results.filter((result) => result.status === "passed")).toHaveLength(
			4,
		);
		expect(
			results
				.filter((result) => result.status !== "skipped")
				.every((result) =>
					(result.notes as string[]).includes(
						"live-runner-evidence-source:snapshot",
					),
				),
		).toBe(true);
	});

	test("v bench runtime-live-agent rejects invalid fallback snapshots", () => {
		const cases = [
			[
				"missing-schema",
				(snapshot: Record<string, unknown>) => delete snapshot.schema_version,
			],
			[
				"invalid-time",
				(snapshot: Record<string, unknown>) =>
					(snapshot.generated_at = "invalid"),
			],
			[
				"missing-time",
				(snapshot: Record<string, unknown>) => delete snapshot.generated_at,
			],
			[
				"stale",
				(snapshot: Record<string, unknown>) =>
					(snapshot.generated_at = "2020-01-01T00:00:00.000Z"),
			],
			[
				"incomplete",
				(snapshot: Record<string, unknown>) => (snapshot.scenarios = []),
			],
		] as const;
		for (const [, mutate] of cases) {
			const fixtureRoot = createValidationFixtureRoot((root) => {
				const { snapshotPath, savedResultPath } =
					getRuntimeLiveArtifactPaths(root);
				unlinkSync(savedResultPath);
				const snapshot = readJson(snapshotPath);
				mutate(snapshot);
				writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
			});
			const proc = runKernel(
				["v", "bench", "--pack", "runtime-live-agent", "--json"],
				fixtureRoot,
			);
			expect(proc.status).toBe(2);
			const payload = parseJsonOutput(proc.stdout as string);
			expect(payload.pass).toBe(false);
		}
	});

	test("v bench runtime-live-agent fails when direct live evidence violates thresholds", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			const { savedResultPath } = getRuntimeLiveArtifactPaths(root);
			const savedResult = readJson(savedResultPath);
			savedResult.scenarios = [
				{
					id: "live-implement-start-complete-evidence",
					pass: true,
					duration_ms: 120,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-tools-benchmark-discovery",
					pass: true,
					duration_ms: 140,
					tool_call_count: 1,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
				},
				{
					id: "live-implement-next-governance-preflight",
					pass: true,
					duration_ms: 160,
					tool_call_count: 4,
					tool_success_rate: 0.75,
					error_count: 1,
					retry_count: 0,
					context_bytes: 1024,
					prompt_bytes: 240,
					token_usage: {
						available: true,
						input_tokens: 1200,
						output_tokens: 4001,
						total_tokens: 1601,
						cached_input_tokens: 0,
						reasoning_output_tokens: 0,
					},
				},
				{
					id: "maintenance-cadence-review",
					pass: true,
					duration_ms: 120,
					tool_call_count: 4,
					tool_success_rate: 1,
					error_count: 0,
					retry_count: 0,
					context_bytes: 1240,
					prompt_bytes: 240,
					token_usage: {
						available: true,
						input_tokens: 220,
						output_tokens: 80,
						total_tokens: 300,
						cached_input_tokens: 0,
						reasoning_output_tokens: 0,
					},
				},
			];
			savedResult.pass = true;
			savedResult.duration_ms = 540;
			savedResult.tool_call_count = 10;
			savedResult.error_count = 1;
			savedResult.retry_count = 0;
			savedResult.context_bytes_total = 4312;
			savedResult.prompt_bytes_total = 960;
			writeFileSync(
				savedResultPath,
				`${JSON.stringify(savedResult, null, 2)}\n`,
			);
		});

		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(2);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("failed");
		expect(payload.pass).toBe(false);
		const results = payload.results as Array<Record<string, unknown>>;
		const target = results.find((entry) => entry.scenario_id === "live-status");
		expect(target?.status).toBe("failed");
		expect(target?.pass).toBe(false);
		expect(target?.tool_success_rate).toBe(0.75);
		const notes = target?.notes as string[];
		expect(notes).toContain(
			"threshold-below-min:min_tool_success_rate:0.75<0.98",
		);
		expect(notes).toContain("threshold-exceeded:max_output_tokens:4001>4000");
		const summary = payload.summary as Record<string, unknown>;
		expect(summary.passed).toBe(3);
		expect(summary.failed).toBe(1);
		expect(summary.skipped).toBe(0);
	});

	test("v bench runtime-live-agent fails with actionable note when live artifact is missing", () => {
		const fixtureRoot = createValidationFixtureRoot((root) => {
			unlinkSync(
				join(
					root,
					".afol",
					"data",
					"benchmarks",
					"snapshots",
					"runtime-flow-live-agent-v4-latest.json",
				),
			);
		});
		const proc = runKernel(
			["v", "bench", "--pack", "runtime-live-agent", "--json"],
			fixtureRoot,
		);
		expect(proc.status).toBe(2);
		const payload = parseJsonOutput(proc.stdout as string);
		expect(payload.status).toBe("failed");
		expect(payload.pass).toBe(false);
		const notes = payload.notes as string[];
		expect(notes).toContain(
			`runtime-live-artifact-missing:.afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json;${runtimeLiveBenchmarkRefreshGuidance}`,
		);
		const results = payload.results as Array<Record<string, unknown>>;
		expect(results.length).toBe(4);
		expect(results.filter((entry) => entry.status === "failed")).toHaveLength(
			4,
		);
		expect(
			results
				.filter((entry) => entry.status !== "skipped")
				.every((entry) =>
					(entry.notes as string[]).includes(
						`runtime-live-artifact-missing:.afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json;${runtimeLiveBenchmarkRefreshGuidance}`,
					),
				),
		).toBe(true);
		expect(payload.summary).toEqual({
			total: 4,
			passed: 0,
			failed: 4,
			skipped: 0,
			baseline_missing: 0,
		});
	});

	test(
		"invalid scenario or baseline schema_version yields contract issues",
		() => {
			const fixtureRoot = createValidationFixtureRoot((root) => {
				const scenarioPath = join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"scenarios",
					"cli-kernel-local",
					"cli-help-compact.json",
				);
				const baselinePath = join(
					root,
					".afol",
					"data",
					"benchmarks",
					"catalog",
					"baselines",
					"cli-kernel-local",
					"baseline-v1.json",
				);
				const scenario = readJson(scenarioPath);
				scenario.schema_version = "9.9.9";
				writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
				const baseline = readJson(baselinePath);
				baseline.schema_version = "9.9.9";
				writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
			});

			const selectProc = runKernel(["v", "select", "--json"], fixtureRoot);
			expect(selectProc.status).toBe(0);
			const selectPayload = parseJsonOutput(selectProc.stdout as string);
			const selectIssues = selectPayload.contract_issues as string[];
			expect(
				selectIssues.some((entry) =>
					entry.startsWith(
						"scenario-schema-version-mismatch:cli-kernel-local:",
					),
				),
			).toBe(true);
			expect(
				selectIssues.some((entry) =>
					entry.startsWith(
						"baseline-schema-version-mismatch:cli-kernel-local:",
					),
				),
			).toBe(true);

			const benchProc = runKernel(
				["v", "bench", "--pack", "cli-kernel-local", "--json"],
				fixtureRoot,
			);
			expect(benchProc.status).toBe(2);
			const benchPayload = parseJsonOutput(benchProc.stdout as string);
			expect(benchPayload.status).toBe("failed");
			expect(benchPayload.pass).toBe(false);
		},
		cliKernelValidationTestTimeoutMs,
	);

	test("validate alias and tpl/update scopes keep working", () => {
		const validateProc = runKernel(["validate", "select", "--json"]);
		expect(validateProc.status).toBe(0);
		const validatePayload = parseJsonOutput(validateProc.stdout as string);
		expect(validatePayload.mode).toBe("select");

		const tplProc = runKernel(["v", "select", "tpl", "--json"]);
		expect(tplProc.status).toBe(0);
		const tplPayload = parseJsonOutput(tplProc.stdout as string);
		expect(tplPayload.scope).toBe("tpl");
		expect(tplPayload.selected_pack_ids).toEqual(["cli-kernel-local"]);

		const updateProc = runKernel(["v", "select", "update", "--json"]);
		expect(updateProc.status).toBe(0);
		const updatePayload = parseJsonOutput(updateProc.stdout as string);
		expect(updatePayload.scope).toBe("update");
		expect(updatePayload.selected_pack_ids).toEqual(["update-safety"]);
	}, 10000);

	test("registry contract remains complete for the sixteen-pack matrix", () => {
		const proc = runKernel(["v", "select", "--json"]);
		expect(proc.status).toBe(0);
		const payload = parseJsonOutput(proc.stdout as string);
		const registry = payload.registry as Array<Record<string, unknown>>;
		expect(registry.map((entry) => entry.pack_id)).toEqual([
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
		]);
		expect(
			registry.every(
				(entry) =>
					(entry.scenario_count as number) >= (entry.min_scenarios as number),
			),
		).toBe(true);
		expect(
			registry.find((entry) => entry.pack_id === "evolution-core")
				?.baseline_present,
		).toBe(true);
		expect(payload.contract_issues).toEqual([]);
	});
});
