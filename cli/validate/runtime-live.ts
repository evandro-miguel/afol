import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
	asBoolean,
	asOptionalNumber,
	asOptionalObject,
	asString,
	isObject,
	loadJsonObject,
} from "./shared";
import {
	BENCHMARK_RESULT_SCHEMA_VERSION,
	type BenchmarkResult,
	type Scenario,
} from "./types";

const LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH =
	".afol/data/benchmarks/snapshots/runtime-flow-live-agent-v4-latest.json";
const LIVE_BENCHMARK_EXPECTED_PACK_ID = "runtime-flow-live-agent-v4";
const LIVE_BENCHMARK_REFRESH_COMMAND =
	"afol validate bench --pack runtime-live-agent --json";
const LIVE_BENCHMARK_REFRESH_NOTE =
	"snapshot validation; live runner pending (spec 260423_2006 in .afol/adm/specs/)";

interface LiveRunnerProfile {
	runtime: string;
	model: string;
	reasoning_effort: string;
}

interface LiveRunnerScenarioResult {
	id: string;
	pass: boolean;
	duration_ms: number;
	tool_call_count: number;
	tool_success_rate: number;
	error_count: number;
	retry_count: number;
	context_bytes: number;
	prompt_bytes: number;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
}

interface LiveRunnerResultPayload {
	pack_id: string;
	generated_at: string;
	pass: boolean;
	duration_ms: number;
	tool_call_count: number;
	error_count: number;
	retry_count: number;
	context_bytes_total: number;
	prompt_bytes_total: number;
	benchmark_profile: LiveRunnerProfile;
	scenarios: LiveRunnerScenarioResult[];
}

interface RuntimeLiveEvidence {
	snapshotPathRelative: string;
	savedResultPathRelative: string;
	payloadSource: "result" | "snapshot";
	payload: LiveRunnerResultPayload;
}

interface RuntimeLiveAgentResults {
	results: BenchmarkResult[];
	notes: string[];
}

function deriveToolSuccessRate(
	toolCallCount: number,
	errorCount: number,
): number {
	if (toolCallCount <= 0) {
		return errorCount === 0 ? 1 : 0;
	}
	const successCount = Math.max(0, toolCallCount - errorCount);
	return Number((successCount / toolCallCount).toFixed(4));
}

function parseLiveRunnerProfile(
	data: unknown,
	sourcePath: string,
): LiveRunnerProfile {
	if (!isObject(data)) {
		throw new Error(`Invalid benchmark profile object: ${sourcePath}`);
	}
	return {
		runtime: asString(data.runtime, `${sourcePath}.runtime`),
		model: asString(data.model, `${sourcePath}.model`),
		reasoning_effort: asString(
			data.reasoning_effort,
			`${sourcePath}.reasoning_effort`,
		),
	};
}

function parseLiveRunnerScenarioResult(
	data: unknown,
	sourcePath: string,
): LiveRunnerScenarioResult {
	if (!isObject(data)) {
		throw new Error(`Invalid live scenario object: ${sourcePath}`);
	}
	const toolCallCount =
		asOptionalNumber(data.tool_call_count, `${sourcePath}.tool_call_count`) ??
		0;
	const errorCount =
		asOptionalNumber(data.error_count, `${sourcePath}.error_count`) ?? 0;
	const tokenUsage = asOptionalObject(
		data.token_usage,
		`${sourcePath}.token_usage`,
	);
	return {
		id: asString(data.id, `${sourcePath}.id`),
		pass: asBoolean(data.pass, `${sourcePath}.pass`),
		duration_ms:
			asOptionalNumber(data.duration_ms, `${sourcePath}.duration_ms`) ?? 0,
		tool_call_count: toolCallCount,
		tool_success_rate:
			asOptionalNumber(
				data.tool_success_rate,
				`${sourcePath}.tool_success_rate`,
			) ?? deriveToolSuccessRate(toolCallCount, errorCount),
		error_count: errorCount,
		retry_count:
			asOptionalNumber(data.retry_count, `${sourcePath}.retry_count`) ?? 0,
		context_bytes:
			asOptionalNumber(data.context_bytes, `${sourcePath}.context_bytes`) ?? 0,
		prompt_bytes:
			asOptionalNumber(data.prompt_bytes, `${sourcePath}.prompt_bytes`) ?? 0,
		input_tokens:
			asOptionalNumber(
				tokenUsage?.input_tokens,
				`${sourcePath}.token_usage.input_tokens`,
			) ?? 0,
		output_tokens:
			asOptionalNumber(
				tokenUsage?.output_tokens,
				`${sourcePath}.token_usage.output_tokens`,
			) ?? 0,
		total_tokens:
			asOptionalNumber(
				tokenUsage?.total_tokens,
				`${sourcePath}.token_usage.total_tokens`,
			) ?? 0,
	};
}

function payloadMetricValue(
	data: Record<string, unknown>,
	summary: Record<string, unknown> | undefined,
	key: string,
): unknown {
	return data[key] ?? summary?.[key];
}

function parseLiveRunnerPayload(
	data: Record<string, unknown>,
	sourcePath: string,
): LiveRunnerResultPayload {
	const scenariosRaw = data.scenarios;
	if (!Array.isArray(scenariosRaw)) {
		throw new Error(
			`Invalid live runner scenarios array: ${sourcePath}.scenarios`,
		);
	}
	const scenarios = scenariosRaw.map((entry, index) =>
		parseLiveRunnerScenarioResult(entry, `${sourcePath}.scenarios[${index}]`),
	);
	if (scenarios.length === 0) {
		throw new Error(`Live runner artifact has no scenarios: ${sourcePath}`);
	}
	const summary = asOptionalObject(data.summary, `${sourcePath}.summary`);
	return {
		pack_id: asString(data.pack_id, `${sourcePath}.pack_id`),
		generated_at: asString(data.generated_at, `${sourcePath}.generated_at`),
		pass: asBoolean(
			payloadMetricValue(data, summary, "pass"),
			`${sourcePath}.pass`,
		),
		duration_ms:
			asOptionalNumber(
				payloadMetricValue(data, summary, "duration_ms"),
				`${sourcePath}.duration_ms`,
			) ?? 0,
		tool_call_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "tool_call_count"),
				`${sourcePath}.tool_call_count`,
			) ?? 0,
		error_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "error_count"),
				`${sourcePath}.error_count`,
			) ?? 0,
		retry_count:
			asOptionalNumber(
				payloadMetricValue(data, summary, "retry_count"),
				`${sourcePath}.retry_count`,
			) ?? 0,
		context_bytes_total:
			asOptionalNumber(
				payloadMetricValue(data, summary, "context_bytes_total"),
				`${sourcePath}.context_bytes_total`,
			) ?? 0,
		prompt_bytes_total:
			asOptionalNumber(
				payloadMetricValue(data, summary, "prompt_bytes_total"),
				`${sourcePath}.prompt_bytes_total`,
			) ?? 0,
		benchmark_profile: parseLiveRunnerProfile(
			data.benchmark_profile,
			`${sourcePath}.benchmark_profile`,
		),
		scenarios,
	};
}

function resolveRelativePath(projectRoot: string, targetPath: string): string {
	return relative(projectRoot, resolve(projectRoot, targetPath)).replaceAll(
		"\\",
		"/",
	);
}

function loadRuntimeLiveEvidence(projectRoot: string): RuntimeLiveEvidence {
	const snapshotPath = join(projectRoot, LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH);
	if (!existsSync(snapshotPath)) {
		throw new Error(
			`runtime-live-artifact-missing:${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const snapshot = loadJsonObject(snapshotPath);
	const snapshotPackId = asString(snapshot.pack_id, `${snapshotPath}.pack_id`);
	if (snapshotPackId !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${snapshotPackId};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const snapshotProfile = parseLiveRunnerProfile(
		snapshot.benchmark_profile,
		`${snapshotPath}.benchmark_profile`,
	);
	if (
		snapshotProfile.model !== "gpt-5.4-mini" ||
		snapshotProfile.reasoning_effort !== "medium"
	) {
		throw new Error(
			`runtime-live-profile-mismatch:model=${snapshotProfile.model},reasoning=${snapshotProfile.reasoning_effort};expected:gpt-5.4-mini/medium;run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	const savedResultPathRaw = asString(
		snapshot.saved_result_path,
		`${snapshotPath}.saved_result_path`,
	);
	const savedResultPath = resolve(projectRoot, savedResultPathRaw);
	const payloadSource = existsSync(savedResultPath) ? "result" : "snapshot";
	const payloadPath =
		payloadSource === "result" ? savedResultPath : snapshotPath;
	const payloadRaw =
		payloadSource === "result" ? loadJsonObject(savedResultPath) : snapshot;
	const payload = parseLiveRunnerPayload(payloadRaw, payloadPath);
	if (payload.pack_id !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${payload.pack_id};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	if (
		payload.benchmark_profile.model !== "gpt-5.4-mini" ||
		payload.benchmark_profile.reasoning_effort !== "medium"
	) {
		throw new Error(
			`runtime-live-profile-mismatch:model=${payload.benchmark_profile.model},reasoning=${payload.benchmark_profile.reasoning_effort};expected:gpt-5.4-mini/medium;run:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
		);
	}
	return {
		snapshotPathRelative: resolveRelativePath(
			projectRoot,
			LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH,
		),
		savedResultPathRelative: resolveRelativePath(
			projectRoot,
			savedResultPathRaw,
		),
		payloadSource,
		payload,
	};
}

function failedRuntimeLiveResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	note: string,
): BenchmarkResult {
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: "failed",
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: false,
		duration_ms: 0,
		timing_p50_ms: 0,
		timing_p95_ms: 0,
		error_count: 1,
		retry_count: 0,
		context_tokens: 0,
		prompt_tokens: 0,
		output_tokens: 0,
		context_bytes: 0,
		output_bytes: 0,
		tool_call_count: 0,
		tool_success_rate: 0,
		git_commit: getGitCommit(projectRoot),
		notes: [note],
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

export function collectThresholdNotes(
	thresholds: Record<string, number>,
	metrics: Record<string, number | undefined>,
): string[] {
	const notes: string[] = [];
	for (const [thresholdKey, thresholdValue] of Object.entries(thresholds)) {
		const metricKey =
			thresholdKey === "max_p95_ms" || thresholdKey === "min_p95_ms"
				? "timing_p95_ms"
				: thresholdKey === "max_p50_ms" || thresholdKey === "min_p50_ms"
					? "timing_p50_ms"
					: thresholdKey.startsWith("max_") || thresholdKey.startsWith("min_")
						? thresholdKey.slice(4)
						: null;
		if (!metricKey) {
			notes.push(`unsupported-threshold:${thresholdKey}`);
			continue;
		}
		const metricValue = metrics[metricKey];
		if (typeof metricValue !== "number" || Number.isNaN(metricValue)) {
			notes.push(`threshold-metric-missing:${thresholdKey}`);
			continue;
		}
		if (thresholdKey.startsWith("max_") && metricValue > thresholdValue) {
			notes.push(
				`threshold-exceeded:${thresholdKey}:${metricValue}>${thresholdValue}`,
			);
		} else if (
			thresholdKey.startsWith("min_") &&
			metricValue < thresholdValue
		) {
			notes.push(
				`threshold-below-min:${thresholdKey}:${metricValue}<${thresholdValue}`,
			);
		}
	}
	return notes;
}

function runtimeLiveDirectEvidenceNote(
	evidence: RuntimeLiveEvidence,
	scenario: Scenario,
	reason:
		| "runtime-live-direct-evidence-missing"
		| "runtime-live-direct-evidence-reused",
): string {
	const mappedId = scenario.live_runner_scenario_id ?? "missing";
	return `${reason}:${scenario.scenario_id}:${mappedId};artifact:${evidence.savedResultPathRelative};run:${LIVE_BENCHMARK_REFRESH_COMMAND}`;
}

interface RuntimeLiveScenarioOutcome {
	result: BenchmarkResult;
	matchedDirectEvidence: boolean;
	incompleteArtifact: boolean;
}

function buildRuntimeLiveScenarioResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
	evidence: RuntimeLiveEvidence,
	liveById: Map<string, LiveRunnerScenarioResult>,
	usedLiveScenarioIds: Set<string>,
): RuntimeLiveScenarioOutcome {
	const mappingId = scenario.live_runner_scenario_id;
	if (!mappingId) {
		return {
			result: failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-missing",
				),
			),
			matchedDirectEvidence: false,
			incompleteArtifact: true,
		};
	}
	const mappedScenario = liveById.get(mappingId);
	if (!mappedScenario) {
		return {
			result: failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-missing",
				),
			),
			matchedDirectEvidence: false,
			incompleteArtifact: true,
		};
	}
	if (usedLiveScenarioIds.has(mappedScenario.id)) {
		return {
			result: failedRuntimeLiveResult(
				projectRoot,
				scenario,
				baselinePath,
				runtimeLiveDirectEvidenceNote(
					evidence,
					scenario,
					"runtime-live-direct-evidence-reused",
				),
			),
			matchedDirectEvidence: false,
			incompleteArtifact: true,
		};
	}
	usedLiveScenarioIds.add(mappedScenario.id);
	const metrics: Record<string, number> = {
		duration_ms: mappedScenario.duration_ms,
		timing_p50_ms: mappedScenario.duration_ms,
		timing_p95_ms: mappedScenario.duration_ms,
		error_count: mappedScenario.error_count,
		retry_count: mappedScenario.retry_count,
		context_tokens: mappedScenario.input_tokens,
		prompt_tokens: mappedScenario.input_tokens,
		output_tokens: mappedScenario.output_tokens,
		total_tokens: mappedScenario.total_tokens,
		context_bytes: mappedScenario.context_bytes,
		output_bytes: mappedScenario.prompt_bytes,
		tool_call_count: mappedScenario.tool_call_count,
		tool_success_rate: mappedScenario.tool_success_rate,
	};
	const thresholdNotes = collectThresholdNotes(scenario.thresholds, metrics);
	const status: BenchmarkResult["status"] =
		mappedScenario.pass && thresholdNotes.length === 0 ? "passed" : "failed";
	const notes = [
		`live-runner-artifact:${evidence.savedResultPathRelative}`,
		`live-runner-snapshot:${evidence.snapshotPathRelative}`,
		`live-runner-evidence-source:${evidence.payloadSource}`,
		`live-runner-scenario:${mappedScenario.id}`,
		`live-runner-generated-at:${evidence.payload.generated_at}`,
		`live-runner-profile:${evidence.payload.benchmark_profile.model}/${evidence.payload.benchmark_profile.reasoning_effort}`,
	];
	if (!mappedScenario.pass) {
		notes.push("live-runner-scenario-failed");
	}
	notes.push(...thresholdNotes);
	return {
		result: {
			schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
			run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
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
			timing_p50_ms: metrics.timing_p50_ms ?? 0,
			timing_p95_ms: metrics.timing_p95_ms ?? 0,
			error_count: metrics.error_count ?? 0,
			retry_count: metrics.retry_count ?? 0,
			context_tokens: metrics.context_tokens ?? 0,
			prompt_tokens: metrics.prompt_tokens ?? 0,
			output_tokens: metrics.output_tokens ?? 0,
			context_bytes: metrics.context_bytes ?? 0,
			output_bytes: metrics.output_bytes ?? 0,
			tool_call_count: metrics.tool_call_count ?? 0,
			tool_success_rate: metrics.tool_success_rate ?? 0,
			git_commit: getGitCommit(projectRoot),
			notes,
		},
		matchedDirectEvidence: true,
		incompleteArtifact: false,
	};
}

export function buildRuntimeLiveAgentResults(
	projectRoot: string,
	scenarios: Scenario[],
	baselinePath: string,
): RuntimeLiveAgentResults {
	let evidence: RuntimeLiveEvidence;
	try {
		evidence = loadRuntimeLiveEvidence(projectRoot);
	} catch (error) {
		const note = (error as Error).message;
		return {
			results: scenarios.map((scenario) =>
				failedRuntimeLiveResult(projectRoot, scenario, baselinePath, note),
			),
			notes: [note],
		};
	}

	const liveById = new Map<string, LiveRunnerScenarioResult>();
	for (const liveScenario of evidence.payload.scenarios) {
		liveById.set(liveScenario.id, liveScenario);
	}
	const usedLiveScenarioIds = new Set<string>();
	let matchedDirectEvidenceCount = 0;
	let incompleteArtifact = false;
	const results = scenarios.map((scenario) => {
		const outcome = buildRuntimeLiveScenarioResult(
			projectRoot,
			scenario,
			baselinePath,
			evidence,
			liveById,
			usedLiveScenarioIds,
		);
		matchedDirectEvidenceCount += outcome.matchedDirectEvidence ? 1 : 0;
		incompleteArtifact = incompleteArtifact || outcome.incompleteArtifact;
		return outcome.result;
	});

	if (matchedDirectEvidenceCount !== scenarios.length) {
		incompleteArtifact = true;
	}

	return {
		results,
		notes: [
			`runtime-live-agent-artifact:${evidence.savedResultPathRelative}`,
			`runtime-live-agent-evidence-source:${evidence.payloadSource}`,
			...(incompleteArtifact
				? [
						`runtime-live-artifact-incomplete:${evidence.savedResultPathRelative};matched-direct-evidence:${matchedDirectEvidenceCount}/${scenarios.length};run:${LIVE_BENCHMARK_REFRESH_COMMAND};note:${LIVE_BENCHMARK_REFRESH_NOTE}`,
					]
				: []),
			`runtime-live-agent-refresh:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
			`runtime-live-agent-refresh-note:${LIVE_BENCHMARK_REFRESH_NOTE}`,
		],
	};
}
