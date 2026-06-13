import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { saveBenchmarkPayload } from "./benchmark-files";
import {
	outputJson,
	outputJsonWithStatus,
	outputTail,
	registrySummary,
} from "./output";
import { loadRegistry, validateRegistryContract } from "./registry";
import {
	buildRuntimeLiveAgentResults,
	collectThresholdNotes,
} from "./runtime-live";
import { selectPacks } from "./selector";
import {
	type Baseline,
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type BenchmarkResult,
	type PackId,
	REQUIRED_PACKS,
	type RegistrySnapshot,
	type Scenario,
	VALIDATION_SCHEMA_VERSION,
	type ValidationCommandResult,
	type ValidationCommandSpec,
	type ValidationScope,
} from "./types";

const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";

const VALIDATION_COMMANDS_BY_PACK: Record<PackId, ValidationCommandSpec[]> = {
	"cli-kernel-local": [
		{ command: ["bun", "run", "typecheck"] },
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/validate-command.test.ts",
			],
		},
	],
	"routing-accuracy": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/kernel.test.ts",
				"cli/tests/rule-command.test.ts",
				"cli/tests/skill-command.test.ts",
			],
		},
	],
	"mutation-safety": [
		{ command: ["bun", "test", "cli/tests/mutation-safety.test.ts"] },
	],
	"update-safety": [
		{ command: ["bun", "test", "cli/tests/update-command.test.ts"] },
	],
	"workbench-parity": [
		{
			command: [
				"bun",
				"test",
				"cli/tests/workbench-lifecycle.test.ts",
				"cli/tests/workbench-verify.test.ts",
				"cli/tests/log-command.test.ts",
				"cli/tests/verify-command.test.ts",
			],
		},
	],
	"mcp-parity": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"mcp-parity",
				"--json",
			],
		},
	],
	"runtime-live-agent": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"runtime-live-agent",
				"--json",
			],
		},
	],
	"token-economy": [
		{
			command: [
				"bun",
				"run",
				"cli/main.ts",
				"v",
				"bench",
				"--pack",
				"token-economy",
				"--json",
			],
		},
	],
};

function buildResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	baseline: Baseline | undefined,
): BenchmarkResult {
	const metrics = scenario.deterministic_metrics;
	const notes = collectThresholdNotes(scenario.thresholds, metrics);
	if (baseline) {
		if (
			typeof baseline.timing_p50_ms === "number" &&
			typeof metrics.timing_p50_ms === "number" &&
			metrics.timing_p50_ms > baseline.timing_p50_ms
		) {
			notes.push(
				`baseline-regression:timing_p50_ms:${metrics.timing_p50_ms}>${baseline.timing_p50_ms}`,
			);
		}
		if (
			typeof baseline.timing_p95_ms === "number" &&
			typeof metrics.timing_p95_ms === "number" &&
			metrics.timing_p95_ms > baseline.timing_p95_ms
		) {
			notes.push(
				`baseline-regression:timing_p95_ms:${metrics.timing_p95_ms}>${baseline.timing_p95_ms}`,
			);
		}
	}
	const status: BenchmarkResult["status"] =
		scenario.implementation_status === "skipped"
			? "skipped"
			: !baseline
				? "baseline-missing"
				: notes.length > 0
					? "failed"
					: "passed";
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `det-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status,
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: status === "passed",
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: metrics.error_count ?? 0,
		retry_count: metrics.retry_count ?? 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
		git_commit: getGitCommit(projectRoot),
		notes:
			status === "skipped"
				? ["not-implemented-live-runner"]
				: status === "baseline-missing"
					? ["baseline-missing"]
					: notes,
	};
}

function getGitCommit(projectRoot: string): string {
	const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: projectRoot,
		encoding: "utf8",
	});
	if (result.status !== 0) {
		return "unknown";
	}
	return (result.stdout || "").trim() || "unknown";
}

function runPackCommand(
	projectRoot: string,
	packId: PackId,
	spec: ValidationCommandSpec,
): ValidationCommandResult {
	const startedAt = performance.now();
	const [command, ...args] = spec.command;
	if (!command) {
		throw new Error(`Empty validation command for pack: ${packId}`);
	}
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const exitCode = result.status;
	let reportedStatus: string | undefined;
	let reportedPass: boolean | undefined;
	try {
		const payload = JSON.parse(result.stdout ?? "") as Record<string, unknown>;
		if (typeof payload.status === "string") {
			reportedStatus = payload.status;
		}
		if (typeof payload.pass === "boolean") {
			reportedPass = payload.pass;
		}
	} catch {
		// Non-JSON command output is valid for package scripts and tests.
	}
	const reportedFailure = reportedPass === false || reportedStatus === "failed";
	const passed =
		exitCode === 0 && !result.signal && !result.error && !reportedFailure;
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: exitCode,
		signal: result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout ?? ""),
		stderr_tail: outputTail(
			result.error ? result.error.message : (result.stderr ?? ""),
		),
	};
	if (reportedStatus !== undefined) {
		commandResult.reported_status = reportedStatus;
	}
	if (reportedPass !== undefined) {
		commandResult.reported_pass = reportedPass;
	}
	return commandResult;
}

function parseArgs(args: string[]): {
	mode: "run" | "select" | "bench";
	scope: ValidationScope;
	changedPaths: string[];
	explicitPacks: PackId[];
	save: boolean;
	outputPath?: string;
} {
	let mode: "run" | "select" | "bench" = "run";
	let scope: ValidationScope = "default";
	const changedPaths: string[] = [];
	const explicitPacks: PackId[] = [];
	let save = false;
	let outputPath: string | undefined;

	let index = 0;
	const modeArg = args[index];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		mode = modeArg;
		index += 1;
	}
	if (mode !== "bench") {
		const scopeArg = args[index];
		if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
			scope = scopeArg;
			index += 1;
		}
	}

	while (index < args.length) {
		const token = args[index];
		const nextArg = args[index + 1];
		if (token === "--changed-path" && nextArg) {
			changedPaths.push(nextArg);
			index += 2;
			continue;
		}
		if (token === "--pack" && nextArg) {
			const pack = nextArg;
			if (!REQUIRED_PACKS.includes(pack as PackId)) {
				throw new Error(`Unknown --pack value: ${pack}`);
			}
			explicitPacks.push(pack as PackId);
			index += 2;
			continue;
		}
		if (token === "--json") {
			index += 1;
			continue;
		}
		if (token === "--save") {
			save = true;
			index += 1;
			continue;
		}
		if (token === "--output") {
			const value = args[index + 1];
			if (!value) {
				throw new Error("Missing value for --output");
			}
			outputPath = value;
			index += 2;
			continue;
		}
		throw new Error(`Unknown validation argument: ${token}`);
	}

	const parsed = {
		mode,
		scope,
		changedPaths,
		explicitPacks,
		save,
	};
	return outputPath === undefined ? parsed : { ...parsed, outputPath };
}

function handleSelect(
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	return outputJson({
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "select",
		scope,
		selected_pack_ids: selection.selected_pack_ids,
		reasons: selection.reasons,
		registry: registrySummary(snapshot),
		contract_issues: validateRegistryContract(snapshot),
	});
}

function handleRun(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const commandResults: ValidationCommandResult[] = [];
	for (const packId of selectedPacks) {
		for (const spec of VALIDATION_COMMANDS_BY_PACK[packId] ?? []) {
			commandResults.push(runPackCommand(projectRoot, packId, spec));
		}
	}
	const passed = commandResults.filter(
		(entry) => entry.status === "passed",
	).length;
	const failed = commandResults.filter(
		(entry) => entry.status === "failed",
	).length;
	const contractIssues = validateRegistryContract(snapshot);
	const pass = failed === 0 && contractIssues.length === 0;
	return outputJsonWithStatus(
		{
			schema_version: VALIDATION_SCHEMA_VERSION,
			command_family: "validation",
			mode: "run",
			scope,
			status: pass ? "passed" : "failed",
			pass,
			selected_pack_ids: selectedPacks,
			selection_reasons: selection.reasons,
			summary: {
				total: commandResults.length,
				passed,
				failed,
			},
			command_results: commandResults,
			registry: registrySummary(snapshot),
			contract_issues: contractIssues,
		},
		pass ? 0 : 2,
	);
}

function handleBenchmark(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
	persist: boolean,
	outputPath?: string,
): number {
	const selection = selectPacks({ scope, changedPaths });
	const selectedPacks =
		explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids;
	const results: BenchmarkResult[] = [];
	const benchmarkNotes: string[] = [];
	for (const packId of selectedPacks) {
		const scenarios = snapshot.scenariosByPack[packId] ?? [];
		const baselinePath = join(
			projectRoot,
			BASELINES_RELATIVE_PATH,
			packId,
			"baseline-v1.json",
		);
		const baseline = snapshot.baselinesByPack[packId];
		if (packId === "runtime-live-agent") {
			const live = buildRuntimeLiveAgentResults(
				projectRoot,
				scenarios,
				baselinePath,
			);
			results.push(...live.results);
			benchmarkNotes.push(...live.notes);
			continue;
		}
		for (const scenario of scenarios) {
			results.push(buildResult(projectRoot, scenario, baselinePath, baseline));
		}
	}
	const passed = results.filter((entry) => entry.status === "passed").length;
	const failed = results.filter((entry) => entry.status === "failed").length;
	const skipped = results.filter((entry) => entry.status === "skipped").length;
	const baselineMissing = results.filter(
		(entry) => entry.status === "baseline-missing",
	).length;
	const contractIssues = validateRegistryContract(snapshot);
	const pass =
		failed === 0 &&
		baselineMissing === 0 &&
		skipped === 0 &&
		contractIssues.length === 0;
	const allSkipped =
		results.length > 0 &&
		skipped === results.length &&
		failed === 0 &&
		baselineMissing === 0 &&
		contractIssues.length === 0;
	const status: "passed" | "failed" | "skipped" = pass
		? "passed"
		: allSkipped
			? "skipped"
			: "failed";
	const notes = allSkipped
		? ["all-scenarios-skipped:not-implemented-live-runner", ...benchmarkNotes]
		: benchmarkNotes;
	const payload: Record<string, unknown> = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "benchmark",
		benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		status,
		pass,
		selected_pack_ids: selectedPacks,
		selection_reasons: selection.reasons,
		result_count: results.length,
		notes,
		summary: {
			total: results.length,
			passed,
			failed,
			skipped,
			baseline_missing: baselineMissing,
		},
		results,
		contract_issues: contractIssues,
	};
	if (persist || outputPath) {
		const savedResultPath = saveBenchmarkPayload(
			projectRoot,
			payload,
			selectedPacks,
			outputPath,
		);
		payload.saved_result_path = savedResultPath;
		payload.saved_result_file = savedResultPath.split("/").at(-1);
	}
	return outputJsonWithStatus(payload, pass ? 0 : 2);
}

export function runValidationCommand(
	projectRoot: string,
	args: string[],
): number {
	let parsed: ReturnType<typeof parseArgs>;
	try {
		parsed = parseArgs(args);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	let snapshot: RegistrySnapshot;
	try {
		snapshot = loadRegistry(projectRoot);
	} catch (error) {
		console.error((error as Error).message);
		return 2;
	}

	if (parsed.mode === "bench") {
		return handleBenchmark(
			projectRoot,
			snapshot,
			parsed.scope,
			parsed.changedPaths,
			parsed.explicitPacks,
			parsed.save,
			parsed.outputPath,
		);
	}
	if (parsed.mode === "select") {
		return handleSelect(snapshot, parsed.scope, parsed.changedPaths);
	}
	return handleRun(
		projectRoot,
		snapshot,
		parsed.scope,
		parsed.changedPaths,
		parsed.explicitPacks,
	);
}
