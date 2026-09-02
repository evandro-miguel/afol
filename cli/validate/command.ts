import { join, relative } from "node:path";
import { boundedSpawn } from "../core/subprocess";
import { type ParsedValidationArgs, parseValidationArgs } from "./args";
import { saveBenchmarkPayload } from "./benchmark-files";
import { runValidationCommands } from "./command-runner";
import { outputJson, outputJsonWithStatus, registrySummary } from "./output";
import {
	baselineFilename,
	formatMutationCalibrationReason,
	loadRegistry,
	readGitRepositoryId,
	validateRegistryContract,
} from "./registry";
import {
	buildRuntimeLiveAgentResults,
	collectThresholdNotes,
} from "./runtime-live";
import {
	executeScenarioPackWithArtifact,
	type PreparedCompiledReleaseArtifact,
	RELEASE_BENCH_SAMPLES,
	RELEASE_BENCH_WARMUP_SAMPLES,
	runScenarioCommand,
} from "./scenario-execution";

export { resolveValidateInvocation } from "./args";
export { runScenarioCommand } from "./scenario-execution";

import type { TimingMode } from "./args";
import { selectPacks } from "./selector";
import {
	type Baseline,
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type BenchmarkResult,
	type PackId,
	type RegistrySnapshot,
	type Scenario,
	type ScenarioBaseline,
	VALIDATION_SCHEMA_VERSION,
	type ValidationScope,
} from "./types";

const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";
// Project token rule (see AGENTS.md / low-token principle):
// >5000 output tokens = non-ideal (warn); >10000 = prohibitive (fail).
const TOKEN_RULE_NONIDEAL = 5_000;
const TOKEN_RULE_PROHIBITIVE = 10_000;
const BASELINE_TIMING_REGRESSION_FACTOR = 1.25;
const MUTATION_PROCESS_JITTER_FLOOR_MS = 50;
const MUTATION_PROFILE_RECOVERY_NOTE =
	"recovery:mutation-safety:run-compatible-profile-or-produce-reviewed-calibration;unrelated-packs-may-continue";
const TIMING_THRESHOLD_KEYS = new Set([
	"max_duration_ms",
	"min_duration_ms",
	"max_p50_ms",
	"min_p50_ms",
	"max_p95_ms",
	"min_p95_ms",
]);

function isTimingThresholdFailure(note: string): boolean {
	const match = /^(?:threshold-exceeded|threshold-below-min):([^:]+)/.exec(
		note,
	);
	return match !== null && TIMING_THRESHOLD_KEYS.has(match[1] ?? "");
}

function isTimingRegressionFailure(note: string): boolean {
	return /^baseline-regression:timing_(?:p50|p95)_ms:/.test(note);
}
function resolveValidationSelection(
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[] = [],
) {
	const selection = selectPacks({ scope, changedPaths });
	return {
		selectedPacks:
			explicitPacks.length > 0 ? explicitPacks : selection.selected_pack_ids,
		selectionReasons: selection.reasons,
		contractIssues: validateRegistryContract(snapshot),
	};
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

function appendBaselineRegressionNotes(
	notes: string[],
	baseline:
		| Pick<Baseline | ScenarioBaseline, "timing_p50_ms" | "timing_p95_ms">
		| undefined,
	metrics: Record<string, number>,
	packId: PackId,
): void {
	if (!baseline) {
		return;
	}
	const timingP50Limit =
		typeof baseline.timing_p50_ms === "number"
			? Math.max(
					baseline.timing_p50_ms * BASELINE_TIMING_REGRESSION_FACTOR,
					packId === "mutation-safety"
						? baseline.timing_p50_ms + MUTATION_PROCESS_JITTER_FLOOR_MS
						: 0,
				)
			: undefined;
	if (
		typeof timingP50Limit === "number" &&
		typeof metrics.timing_p50_ms === "number" &&
		metrics.timing_p50_ms > timingP50Limit
	) {
		notes.push(
			`baseline-regression:timing_p50_ms:${metrics.timing_p50_ms}>${timingP50Limit}`,
		);
	}
	const timingP95Limit =
		typeof baseline.timing_p95_ms === "number"
			? Math.max(
					baseline.timing_p95_ms * BASELINE_TIMING_REGRESSION_FACTOR,
					packId === "mutation-safety"
						? baseline.timing_p95_ms + MUTATION_PROCESS_JITTER_FLOOR_MS
						: 0,
				)
			: undefined;
	if (
		typeof timingP95Limit === "number" &&
		typeof metrics.timing_p95_ms === "number" &&
		metrics.timing_p95_ms > timingP95Limit
	) {
		notes.push(
			`baseline-regression:timing_p95_ms:${metrics.timing_p95_ms}>${timingP95Limit}`,
		);
	}
}

function applyProjectTokenRule(result: BenchmarkResult): BenchmarkResult {
	if (result.status === "skipped") {
		return result;
	}
	const outputTokens = result.output_tokens ?? 0;
	if (outputTokens > TOKEN_RULE_PROHIBITIVE) {
		const tokenRuleNote = `token-rule:prohibitive(>10k):${outputTokens}tokens`;
		return {
			...result,
			status: "failed",
			pass: false,
			notes: [tokenRuleNote, ...result.notes],
		};
	}
	if (outputTokens > TOKEN_RULE_NONIDEAL) {
		return {
			...result,
			notes: [
				...result.notes,
				`token-rule:non-ideal(>5k):${outputTokens}tokens`,
			],
		};
	}
	return result;
}

export function combinedProjectTokenRuleNote(
	results: Array<Pick<BenchmarkResult, "status" | "output_tokens">>,
): string | null {
	const outputTokens = results
		.filter((result) => result.status !== "skipped")
		.reduce((total, result) => total + (result.output_tokens ?? 0), 0);
	if (outputTokens > TOKEN_RULE_PROHIBITIVE) {
		return `token-rule:combined-prohibitive(>10k):${outputTokens}tokens`;
	}
	if (outputTokens > TOKEN_RULE_NONIDEAL) {
		return `token-rule:combined-non-ideal(>5k):${outputTokens}tokens`;
	}
	return null;
}

function resolveBenchmarkStatus(
	status: BenchmarkResult["status"],
): "passed" | "failed" | "skipped" {
	return status === "skipped"
		? "skipped"
		: status === "baseline-missing" || status === "incompatible"
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
			case "incompatible":
				failed += 1;
				break;
		}
	}
	return { total: results.length, passed, failed, skipped, baselineMissing };
}

function resolveBenchmarkRunStatus(
	summary: BenchmarkRunSummary,
	contractIssueCount: number,
): "passed" | "failed" | "skipped" {
	// A run passes when there are no real failures or missing baselines.
	// Skipped scenarios are honest opt-outs (e.g. mutating/session-scoped
	// commands that cannot run in-root) and do NOT fail the run, as long as
	// at least one scenario actually passed. A run with zero failures but
	// also zero passes (everything skipped) reports "skipped" to signal no
	// real coverage, distinct from a passing run.
	const pass =
		summary.failed === 0 &&
		summary.baselineMissing === 0 &&
		contractIssueCount === 0 &&
		summary.passed > 0;
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
	timingMode: TimingMode,
	scenarioId?: string,
): BenchmarkPackResults {
	const packScenarios = snapshot.scenariosByPack[packId] ?? [];
	const scenarios = scenarioId
		? packScenarios.filter((scenario) => scenario.scenario_id === scenarioId)
		: packScenarios;
	const baselinePath = join(
		projectRoot,
		BASELINES_RELATIVE_PATH,
		packId,
		baselineFilename(packId),
	);
	const baseline = snapshot.baselinesByPack[packId];
	if (packId === "runtime-live-agent") {
		const runtimeLiveResults = buildRuntimeLiveAgentResults(
			projectRoot,
			scenarios,
			baselinePath,
		);
		return {
			results: runtimeLiveResults.results.map(applyProjectTokenRule),
			notes: runtimeLiveResults.notes,
		};
	}
	return {
		results: executeScenarioPackWithArtifact(
			projectRoot,
			scenarios,
			(scenario, artifact) =>
				buildResult(
					projectRoot,
					scenario,
					baselinePath,
					baseline,
					timingMode,
					artifact,
				),
		),
		notes: [],
	};
}

function resolveBenchmarkScenario(
	snapshot: RegistrySnapshot,
	packId: PackId,
	scenarioId: string,
): Scenario {
	const scenario = (snapshot.scenariosByPack[packId] ?? []).find(
		(entry) => entry.scenario_id === scenarioId,
	);
	if (scenario) return scenario;
	const owningPack = snapshot.packs.find((entry) =>
		(snapshot.scenariosByPack[entry.pack_id] ?? []).some(
			(entry) => entry.scenario_id === scenarioId,
		),
	);
	if (owningPack) {
		throw new Error(
			`Scenario ${scenarioId} belongs to pack ${owningPack.pack_id}, not ${packId}`,
		);
	}
	throw new Error(`Unknown --scenario-id value: ${scenarioId}`);
}

export function collectProfileCompatibilityNotes(
	scenario: Scenario,
	baseline: Baseline | undefined,
	scenarioBaseline: ScenarioBaseline | undefined,
	execution: ReturnType<typeof runScenarioCommand> | null,
): string[] {
	if (scenario.pack_id !== "mutation-safety" || !baseline) {
		return [];
	}
	if (baseline.calibration_status === "pending") {
		return [
			`baseline-incompatible:calibration-pending:${formatMutationCalibrationReason(baseline.calibration_reason)}`,
			MUTATION_PROFILE_RECOVERY_NOTE,
		];
	}
	if (!execution) {
		return [];
	}
	const notes: string[] = [];
	if (!scenarioBaseline) {
		notes.push(
			`baseline-incompatible:scenario-missing:${scenario.scenario_id}`,
		);
	} else if (
		scenarioBaseline.scenario_id !== scenario.scenario_id ||
		scenarioBaseline.scenario_version !== scenario.scenario_version
	) {
		notes.push(
			`baseline-incompatible:scenario-identity:${scenario.scenario_id}@${scenario.scenario_version}`,
		);
	}
	for (const field of [
		"host_profile_id",
		"os",
		"arch",
		"cpu_class",
		"bun_version",
		"runtime_version",
		"execution_mode",
		"artifact_mode",
	] as const) {
		const expected = baseline[field];
		const actual = execution.profile[field];
		if (expected === undefined || expected !== actual) {
			notes.push(
				`profile-incompatible:${field}:result=${actual}:baseline=${expected ?? "missing"}`,
			);
		}
	}
	if (execution.metrics.sample_count < RELEASE_BENCH_SAMPLES) {
		notes.push(
			`profile-incompatible:sample_count:${execution.metrics.sample_count}<${RELEASE_BENCH_SAMPLES}`,
		);
	}
	if (notes.length > 0) notes.push(MUTATION_PROFILE_RECOVERY_NOTE);
	return notes;
}

export function buildResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	baseline: Baseline | undefined,
	timingMode: TimingMode = "enforce",
	preparedArtifact?: PreparedCompiledReleaseArtifact,
): BenchmarkResult {
	if (timingMode === "observe" && scenario.pack_id !== "governance-history") {
		throw new Error(
			"--timing-mode observe is limited to the governance-history pack",
		);
	}
	// bench executes scenario.command and measures; deterministic_metrics is legacy/ignored for execution packs
	const hasCommand =
		typeof scenario.command === "string" && scenario.command.trim().length > 0;
	const execution =
		hasCommand &&
		scenario.implementation_status !== "planned" &&
		(scenario.sandbox || scenario.implementation_status !== "skipped")
			? runScenarioCommand(projectRoot, scenario, {
					...(preparedArtifact ? { artifact: preparedArtifact } : {}),
					...(scenario.pack_id === "mutation-safety"
						? {
								sampleCount: RELEASE_BENCH_SAMPLES,
								warmupCount: RELEASE_BENCH_WARMUP_SAMPLES,
							}
						: {}),
				})
			: null;
	const metrics = execution?.metrics ?? scenario.deterministic_metrics;
	const notes = execution?.notes
		? [...execution.notes]
		: ["no-command-fallback"];
	const thresholdNotes = collectThresholdNotes(
		scenario.thresholds,
		metrics as Record<string, number | undefined>,
	);
	const regressionNotes: string[] = [];
	const scenarioBaseline = baseline?.scenarios?.[scenario.scenario_id];
	const compatibilityNotes = collectProfileCompatibilityNotes(
		scenario,
		baseline,
		scenarioBaseline,
		execution,
	);
	if (compatibilityNotes.length === 0) {
		appendBaselineRegressionNotes(
			regressionNotes,
			scenarioBaseline ?? baseline,
			metrics as Record<string, number>,
			scenario.pack_id,
		);
	}
	const status = resolveResultStatus(
		scenario,
		baseline,
		execution,
		timingMode === "observe" || compatibilityNotes.length > 0
			? thresholdNotes.filter((note) => !isTimingThresholdFailure(note))
			: thresholdNotes,
		timingMode === "observe"
			? regressionNotes.filter((note) => !isTimingRegressionFailure(note))
			: regressionNotes,
		compatibilityNotes,
	);
	if (status === "baseline-missing") {
		notes.push("baseline-missing");
	} else {
		notes.push(...thresholdNotes, ...regressionNotes, ...compatibilityNotes);
	}
	const resolvedStatus = resolveBenchmarkStatus(status);
	const sourceRepository = readGitRepositoryId(projectRoot);
	return applyProjectTokenRule({
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `${execution ? "bench" : "legacy"}-${scenario.pack_id}-${scenario.scenario_id}-${scenario.scenario_version}`,
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
		...(typeof metrics.canonical_write_count === "number"
			? { canonical_write_count: metrics.canonical_write_count }
			: {}),
		...(typeof metrics.telemetry_append_count === "number"
			? { telemetry_append_count: metrics.telemetry_append_count }
			: {}),
		...(typeof metrics.derived_work_calls === "number"
			? { derived_work_calls: metrics.derived_work_calls }
			: {}),
		...(typeof metrics.instrumented_duration_ms === "number"
			? { instrumented_duration_ms: metrics.instrumented_duration_ms }
			: {}),
		...(typeof metrics.instrumented_output_bytes === "number"
			? { instrumented_output_bytes: metrics.instrumented_output_bytes }
			: {}),
		...(typeof metrics.fixture_creation_duration_ms === "number"
			? { fixture_creation_duration_ms: metrics.fixture_creation_duration_ms }
			: {}),
		...(typeof metrics.setup_duration_ms === "number"
			? { setup_duration_ms: metrics.setup_duration_ms }
			: {}),
		...(typeof metrics.recovery_duration_ms === "number"
			? { recovery_duration_ms: metrics.recovery_duration_ms }
			: {}),
		...(typeof metrics.argv_chars === "number"
			? { argv_chars: metrics.argv_chars }
			: {}),
		tool_call_count: metrics.tool_call_count ?? 1,
		tool_success_rate: metrics.tool_success_rate ?? 1,
		git_commit: execution?.git_commit ?? getGitCommit(projectRoot),
		...(sourceRepository ? { source_repository: sourceRepository } : {}),
		timestamp: execution?.timestamp ?? new Date().toISOString(),
		sample_count: execution?.metrics.sample_count ?? 0,
		warmup_count: execution?.metrics.warmup_count ?? 0,
		host_profile_id: execution?.profile.host_profile_id ?? "unknown",
		os: execution?.profile.os ?? process.platform,
		arch: execution?.profile.arch ?? process.arch,
		cpu_class: execution?.profile.cpu_class ?? "unknown",
		bun_version: execution?.profile.bun_version ?? Bun.version,
		runtime_version: execution?.profile.runtime_version ?? Bun.version,
		execution_mode: execution?.profile.execution_mode ?? "source",
		artifact_mode: execution?.profile.artifact_mode ?? "source",
		artifact_sha256: execution?.profile.artifact_sha256 ?? "source",
		...(execution?.source_state_sha256
			? { source_state_sha256: execution.source_state_sha256 }
			: {}),
		...(execution?.source_dirty !== undefined
			? { source_dirty: execution.source_dirty }
			: {}),
		notes:
			status === "skipped"
				? scenario.implementation_status === "planned"
					? ["planned-no-execution"]
					: ["not-implemented-live-runner"]
				: notes,
	});
}

function resolveResultStatus(
	scenario: Scenario,
	baseline: Baseline | undefined,
	execution: ReturnType<typeof runScenarioCommand> | null,
	thresholdNotes: readonly string[],
	regressionNotes: readonly string[],
	compatibilityNotes: readonly string[] = [],
): BenchmarkResult["status"] {
	if (scenario.implementation_status === "planned") {
		return "skipped";
	}
	if (scenario.implementation_status === "skipped" && !scenario.sandbox) {
		return "skipped";
	}
	if (!baseline) {
		return "baseline-missing";
	}
	if (execution && !execution.passed) {
		return "failed";
	}
	if (
		thresholdNotes.length > 0 ||
		(scenario.pack_id !== "mutation-safety" && regressionNotes.length > 0)
	) {
		return "failed";
	}
	if (compatibilityNotes.length > 0) {
		return "incompatible";
	}
	return "passed";
}

function getGitCommit(projectRoot: string): string {
	const result = boundedSpawn("git", ["rev-parse", "HEAD"], {
		cwd: projectRoot,
		timeoutMs: 15_000,
	});
	if (result.ok) {
		return result.stdout.trim() || "unknown";
	}
	return "unknown";
}

function handleSelect(
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
): number {
	const { selectedPacks, selectionReasons, contractIssues } =
		resolveValidationSelection(snapshot, scope, changedPaths);
	return outputJson({
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "select",
		scope,
		selected_pack_ids: selectedPacks,
		reasons: selectionReasons,
		registry: registrySummary(snapshot),
		contract_issues: contractIssues,
	});
}

function handleRun(
	projectRoot: string,
	snapshot: RegistrySnapshot,
	scope: ValidationScope,
	changedPaths: string[],
	explicitPacks: PackId[],
): number {
	const { selectedPacks, selectionReasons, contractIssues } =
		resolveValidationSelection(snapshot, scope, changedPaths, explicitPacks);
	const { commandResults, summary } = runValidationCommands(
		projectRoot,
		selectedPacks,
	);
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
			selection_reasons: selectionReasons,
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
	timingMode: TimingMode = "enforce",
	scenarioId?: string,
): number {
	const { selectedPacks, selectionReasons, contractIssues } =
		resolveValidationSelection(snapshot, scope, changedPaths, explicitPacks);
	if (
		timingMode === "observe" &&
		(selectedPacks.length !== 1 || selectedPacks[0] !== "governance-history")
	) {
		console.error(
			"--timing-mode observe is limited to the governance-history pack",
		);
		return 2;
	}
	if (scenarioId && selectedPacks.length !== 1) {
		console.error("--scenario-id requires exactly one --pack");
		return 2;
	}
	let selectedScenario: Scenario | undefined;
	if (scenarioId) {
		try {
			selectedScenario = resolveBenchmarkScenario(
				snapshot,
				selectedPacks[0] as PackId,
				scenarioId,
			);
		} catch (error) {
			console.error((error as Error).message);
			return 2;
		}
	}
	const packResults = selectedPacks.map((packId) =>
		collectBenchmarkPackResults(
			projectRoot,
			snapshot,
			packId,
			timingMode,
			scenarioId,
		),
	);
	const results = packResults.flatMap((entry) => entry.results);
	const benchmarkNotes = packResults.flatMap((entry) => entry.notes);
	const scopedContractIssues = scenarioId ? [] : contractIssues;
	const summary = summarizeBenchmarkResults(results);
	const combinedTokenRuleNote = combinedProjectTokenRuleNote(results);
	const status = resolveBenchmarkRunStatus(
		summary,
		scopedContractIssues.length,
	);
	const notes =
		status === "skipped"
			? ["all-scenarios-skipped:not-implemented-live-runner", ...benchmarkNotes]
			: [
					...benchmarkNotes,
					...(combinedTokenRuleNote ? [combinedTokenRuleNote] : []),
				];
	const payload: Record<string, unknown> = {
		schema_version: VALIDATION_SCHEMA_VERSION,
		command_family: "validation",
		mode: "benchmark",
		timing_mode: timingMode,
		benchmark_result_schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		status,
		pass: status === "passed",
		selected_pack_ids: selectedPacks,
		...(selectedScenario
			? { selected_scenario_id: selectedScenario.scenario_id }
			: {}),
		selection_reasons: selectionReasons,
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
		contract_issues: scopedContractIssues,
	};
	if (scenarioId && status !== "passed") {
		payload.rerun_command = `afol validate bench --pack ${selectedPacks[0]} --scenario-id ${scenarioId} --json`;
	}
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
	let parsed: ParsedValidationArgs;
	try {
		parsed = parseValidationArgs(args);
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
			parsed.timingMode,
			parsed.scenarioId,
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
