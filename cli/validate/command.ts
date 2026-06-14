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
	"pstr-integrity": [
		{ command: ["bun", "test", "cli/tests/pstr-schema-sweep.test.ts"] },
	],
	"context-bundles": [
		{ command: ["bun", "test", "cli/tests/context-system.test.ts"] },
	],
	"state-projection": [
		{ command: ["bun", "test", "cli/tests/state-command.test.ts"] },
	],
};

interface ValidationCommandReport {
	reportedStatus?: string;
	reportedPass?: boolean;
}

interface ParsedValidationArgs {
	mode: "run" | "select" | "bench";
	scope: ValidationScope;
	changedPaths: string[];
	explicitPacks: PackId[];
	save: boolean;
	outputPath?: string;
}

interface BenchmarkPackResults {
	results: BenchmarkResult[];
	notes: string[];
}

interface BenchmarkRunSummary {
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	baselineMissing: number;
}

function parseValidationCommandReport(
	stdout: string | undefined,
): ValidationCommandReport {
	if (stdout === undefined || stdout === "") {
		return {};
	}
	try {
		const payload = JSON.parse(stdout) as Record<string, unknown>;
		const report: ValidationCommandReport = {};
		if (typeof payload.status === "string") {
			report.reportedStatus = payload.status;
		}
		if (typeof payload.pass === "boolean") {
			report.reportedPass = payload.pass;
		}
		return report;
	} catch {
		return {};
	}
}

function isValidationCommandPassing(
	result: ReturnType<typeof spawnSync>,
	report: ValidationCommandReport,
): boolean {
	return (
		result.status === 0 &&
		!result.signal &&
		!result.error &&
		report.reportedPass !== false &&
		report.reportedStatus !== "failed"
	);
}

function appendBaselineRegressionNotes(
	notes: string[],
	baseline: Baseline | undefined,
	metrics: Record<string, number>,
): void {
	if (!baseline) {
		return;
	}
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

function resolveBenchmarkStatus(
	status: BenchmarkResult["status"],
): "passed" | "failed" | "skipped" {
	return status === "skipped"
		? "skipped"
		: status === "baseline-missing"
			? "failed"
			: status === "passed"
				? "passed"
				: "failed";
}

function summarizeBenchmarkResults(
	results: BenchmarkResult[],
): BenchmarkRunSummary {
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let baselineMissing = 0;
	for (const entry of results) {
		switch (entry.status) {
			case "passed":
				passed += 1;
				break;
			case "failed":
				failed += 1;
				break;
			case "skipped":
				skipped += 1;
				break;
			case "baseline-missing":
				baselineMissing += 1;
				break;
		}
	}
	return { total: results.length, passed, failed, skipped, baselineMissing };
}

function resolveBenchmarkRunStatus(
	summary: BenchmarkRunSummary,
	contractIssueCount: number,
): "passed" | "failed" | "skipped" {
	const pass =
		summary.failed === 0 &&
		summary.baselineMissing === 0 &&
		summary.skipped === 0 &&
		contractIssueCount === 0;
	if (pass) {
		return "passed";
	}
	const allSkipped =
		summary.total > 0 &&
		summary.skipped === summary.total &&
		summary.failed === 0 &&
		summary.baselineMissing === 0 &&
		contractIssueCount === 0;
	return allSkipped ? "skipped" : "failed";
}

function collectBenchmarkPackResults(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	packId: PackId,
): BenchmarkPackResults {
	const scenarios = snapshot.scenariosByPack[packId] ?? [];
	const baselinePath = join(
		projectRoot,
		BASELINES_RELATIVE_PATH,
		packId,
		"baseline-v1.json",
	);
	const baseline = snapshot.baselinesByPack[packId];
	if (packId === "runtime-live-agent") {
		return buildRuntimeLiveAgentResults(projectRoot, scenarios, baselinePath);
	}
	return {
		results: scenarios.map((scenario) =>
			buildResult(projectRoot, scenario, baselinePath, baseline),
		),
		notes: [],
	};
}

function summarizeValidationCommandResults(
	commandResults: ValidationCommandResult[],
): { passed: number; failed: number } {
	let passed = 0;
	let failed = 0;
	for (const entry of commandResults) {
		if (entry.status === "passed") {
			passed += 1;
		} else {
			failed += 1;
		}
	}
	return { passed, failed };
}

function consumeValidationArg(
	state: ParsedValidationArgs,
	token: string,
	nextArg: string | undefined,
): number | undefined {
	switch (token) {
		case "--changed-path":
			if (!nextArg) {
				throw new Error("Missing value for --changed-path");
			}
			state.changedPaths.push(nextArg);
			return 2;
		case "--pack":
			if (!nextArg) {
				throw new Error("Missing value for --pack");
			}
			if (!REQUIRED_PACKS.includes(nextArg as PackId)) {
				throw new Error(`Unknown --pack value: ${nextArg}`);
			}
			state.explicitPacks.push(nextArg as PackId);
			return 2;
		case "--save":
			state.save = true;
			return 1;
		case "--output":
			if (!nextArg) {
				throw new Error("Missing value for --output");
			}
			state.outputPath = nextArg;
			return 2;
		default:
			return undefined;
	}
}

function buildResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	baseline: Baseline | undefined,
): BenchmarkResult {
	const metrics = scenario.deterministic_metrics;
	const notes = collectThresholdNotes(scenario.thresholds, metrics);
	appendBaselineRegressionNotes(notes, baseline, metrics);
	const status: BenchmarkResult["status"] =
		scenario.implementation_status === "skipped"
			? "skipped"
			: !baseline
				? "baseline-missing"
				: notes.length > 0
					? "failed"
					: "passed";
	const resolvedStatus = resolveBenchmarkStatus(status);
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `det-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: status,
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: resolvedStatus === "passed",
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
	const report = parseValidationCommandReport(result.stdout ?? "");
	const passed = isValidationCommandPassing(result, report);
	const commandResult: ValidationCommandResult = {
		pack_id: packId,
		command: spec.command,
		status: passed ? "passed" : "failed",
		exit_code: result.status,
		signal: result.signal,
		duration_ms: durationMs,
		stdout_tail: outputTail(result.stdout ?? ""),
		stderr_tail: outputTail(
			result.error ? result.error.message : (result.stderr ?? ""),
		),
	};
	if (report.reportedStatus !== undefined) {
		commandResult.reported_status = report.reportedStatus;
	}
	if (report.reportedPass !== undefined) {
		commandResult.reported_pass = report.reportedPass;
	}
	return commandResult;
}

function parseArgs(args: string[]): ParsedValidationArgs {
	const parsed: ParsedValidationArgs = {
		mode: "run",
		scope: "default",
		changedPaths: [],
		explicitPacks: [],
		save: false,
	};

	let index = 0;
	const modeArg = args[index];
	if (modeArg === "bench" || modeArg === "select" || modeArg === "run") {
		parsed.mode = modeArg;
		index += 1;
	}
	if (parsed.mode !== "bench") {
		const scopeArg = args[index];
		if (scopeArg === "wb" || scopeArg === "tpl" || scopeArg === "update") {
			parsed.scope = scopeArg;
			index += 1;
		}
	}

	while (index < args.length) {
		const token = args[index];
		if (token === undefined) {
			break;
		}
		const nextArg = args[index + 1];
		const consumed = consumeValidationArg(parsed, token, nextArg);
		if (consumed !== undefined) {
			index += consumed;
			continue;
		}
		if (token === "--json") {
			index += 1;
			continue;
		}
		throw new Error(`Unknown validation argument: ${token}`);
	}

	return parsed;
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
	const summary = summarizeValidationCommandResults(commandResults);
	const contractIssues = validateRegistryContract(snapshot);
	const pass = summary.failed === 0 && contractIssues.length === 0;
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
				passed: summary.passed,
				failed: summary.failed,
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
	const packResults = selectedPacks.map((packId) =>
		collectBenchmarkPackResults(projectRoot, snapshot, packId),
	);
	const results = packResults.flatMap((entry) => entry.results);
	const benchmarkNotes = packResults.flatMap((entry) => entry.notes);
	const summary = summarizeBenchmarkResults(results);
	const contractIssues = validateRegistryContract(snapshot);
	const status = resolveBenchmarkRunStatus(summary, contractIssues.length);
	const notes =
		status === "skipped"
			? ["all-scenarios-skipped:not-implemented-live-runner", ...benchmarkNotes]
			: benchmarkNotes;
	const payload: Record<string, unknown> = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "benchmark",
		benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		status,
		pass: status === "passed",
		selected_pack_ids: selectedPacks,
		selection_reasons: selection.reasons,
		result_count: results.length,
		notes,
		summary: {
			total: summary.total,
			passed: summary.passed,
			failed: summary.failed,
			skipped: summary.skipped,
			baseline_missing: summary.baselineMissing,
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
	return outputJsonWithStatus(payload, status === "passed" ? 0 : 2);
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
