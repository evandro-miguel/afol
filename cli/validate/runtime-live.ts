import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { boundedSpawn } from "../core/subprocess";
import {
	asBoolean,
	asOptionalNumber,
	asOptionalObject,
	asOptionalString,
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
const LIVE_BENCHMARK_SNAPSHOT_SCHEMA_VERSION = "1.0.0";
const LIVE_BENCHMARK_STALE_AFTER_DAYS = 7;
const LIVE_BENCHMARK_RESULT_SCHEMA_VERSION = "2.0.0";
const LIVE_BENCHMARK_FIXED_PROFILE: LiveRunnerProfile = {
	runtime: "codex",
	model: "gpt-5.4-mini",
	reasoning_effort: "medium",
};
const LIVE_BENCHMARK_SCENARIO_IDS: Record<string, string> = {
	"governed-task-lifecycle": "live-implement-start-complete-evidence",
	"file-inspection-vs-command": "live-implement-next-governance-preflight",
	"validation-flow": "live-tools-benchmark-discovery",
};
const LIVE_BENCHMARK_REFRESH_COMMAND = "external fixed harness receipt";
const LIVE_BENCHMARK_VALIDATE_COMMAND =
	"afol validate bench --pack runtime-live-agent --json";
const LIVE_BENCHMARK_REFRESH_GUIDANCE = `run:${LIVE_BENCHMARK_REFRESH_COMMAND};then:${LIVE_BENCHMARK_VALIDATE_COMMAND};continue:scripted-packs-without-live-claim`;
const LIVE_BENCHMARK_REFRESH_NOTE = `obtain a fresh receipt from the external fixed harness, place it at ${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH}, then validate with ${LIVE_BENCHMARK_VALIDATE_COMMAND}`;

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
	output_bytes: number;
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

function assertFixedHarnessProfile(profile: LiveRunnerProfile): void {
	if (
		profile.runtime !== LIVE_BENCHMARK_FIXED_PROFILE.runtime ||
		profile.model !== LIVE_BENCHMARK_FIXED_PROFILE.model ||
		profile.reasoning_effort !== LIVE_BENCHMARK_FIXED_PROFILE.reasoning_effort
	) {
		throw new Error(
			`runtime-live-profile-mismatch:runtime=${profile.runtime},model=${profile.model},reasoning=${profile.reasoning_effort};expected:${LIVE_BENCHMARK_FIXED_PROFILE.runtime}/${LIVE_BENCHMARK_FIXED_PROFILE.model}/${LIVE_BENCHMARK_FIXED_PROFILE.reasoning_effort};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
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
		output_bytes:
			asOptionalNumber(data.output_bytes, `${sourcePath}.output_bytes`) ?? 0,
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

function requiredNumber(value: unknown, key: string): number {
	const parsed = asOptionalNumber(value, key);
	if (parsed === undefined) {
		throw new Error(`Missing numeric field: ${key}`);
	}
	return parsed;
}

function parseArchivedModelProfile(
	value: unknown,
	sourcePath: string,
): Pick<LiveRunnerProfile, "model" | "reasoning_effort"> {
	const [model, reasoningEffort, ...rest] = asString(value, sourcePath).split(
		"/",
	);
	if (
		model === undefined ||
		model === "" ||
		reasoningEffort === undefined ||
		reasoningEffort === "" ||
		rest.length > 0
	) {
		throw new Error(`runtime-live-archive-model-invalid:${sourcePath}`);
	}
	return { model, reasoning_effort: reasoningEffort };
}

function parseSavedRunArchive(
	data: Record<string, unknown>,
	sourcePath: string,
): LiveRunnerResultPayload {
	const schemaVersion = asString(
		data.schema_version,
		`${sourcePath}.schema_version`,
	);
	if (schemaVersion !== LIVE_BENCHMARK_RESULT_SCHEMA_VERSION) {
		throw new Error(
			`runtime-live-result-schema-mismatch:${schemaVersion};expected:${LIVE_BENCHMARK_RESULT_SCHEMA_VERSION}`,
		);
	}
	if (!Array.isArray(data.results) || data.results.length === 0) {
		throw new Error(
			`Invalid saved benchmark results array: ${sourcePath}.results`,
		);
	}
	const generatedAt = asString(data.timestamp, `${sourcePath}.timestamp`);
	const archivedProfiles = data.results.map((entry, index) => {
		if (!isObject(entry)) {
			throw new Error(
				`Invalid saved benchmark result: ${sourcePath}.results[${index}]`,
			);
		}
		return parseArchivedModelProfile(
			entry.model,
			`${sourcePath}.results[${index}].model`,
		);
	});
	const benchmarkProfile = archivedProfiles[0];
	if (!benchmarkProfile) {
		throw new Error(
			`Invalid saved benchmark results array: ${sourcePath}.results`,
		);
	}
	if (
		archivedProfiles.some(
			(profile) =>
				profile.model !== benchmarkProfile.model ||
				profile.reasoning_effort !== benchmarkProfile.reasoning_effort,
		)
	) {
		throw new Error(`runtime-live-archive-profile-inconsistent:${sourcePath}`);
	}
	const topLevelProfile = asOptionalObject(
		data.benchmark_profile,
		`${sourcePath}.benchmark_profile`,
	);
	const explicitRuntime =
		asOptionalString(data.runtime, `${sourcePath}.runtime`) ??
		asOptionalString(
			topLevelProfile?.runtime,
			`${sourcePath}.benchmark_profile.runtime`,
		);
	// Schema 2.0.0 archives record model/reasoning per result but no runtime;
	// their legacy Codex producer is the only compatible runtime fallback.
	const runtime = explicitRuntime ?? "codex";
	const scenarios = data.results.map((entry, index) => {
		if (!isObject(entry)) {
			throw new Error(
				`Invalid saved benchmark result: ${sourcePath}.results[${index}]`,
			);
		}
		const timing = asOptionalObject(
			entry.timing,
			`${sourcePath}.results[${index}].timing`,
		);
		const tools = asOptionalObject(
			entry.tools,
			`${sourcePath}.results[${index}].tools`,
		);
		const tokens = asOptionalObject(
			entry.tokens,
			`${sourcePath}.results[${index}].tokens`,
		);
		const id = asString(
			entry.scenario_id,
			`${sourcePath}.results[${index}].scenario_id`,
		);
		return {
			id: LIVE_BENCHMARK_SCENARIO_IDS[id] ?? id,
			pass: asBoolean(entry.pass, `${sourcePath}.results[${index}].pass`),
			duration_ms: requiredNumber(
				timing?.wall_clock_ms,
				`${sourcePath}.results[${index}].timing.wall_clock_ms`,
			),
			tool_call_count: requiredNumber(
				tools?.total_calls,
				`${sourcePath}.results[${index}].tools.total_calls`,
			),
			tool_success_rate: requiredNumber(
				tools?.success_rate,
				`${sourcePath}.results[${index}].tools.success_rate`,
			),
			error_count: requiredNumber(
				tools?.error_count,
				`${sourcePath}.results[${index}].tools.error_count`,
			),
			retry_count: 0,
			context_bytes: 0,
			prompt_bytes: 0,
			output_bytes: 0,
			input_tokens: requiredNumber(
				tokens?.input,
				`${sourcePath}.results[${index}].tokens.input`,
			),
			output_tokens: requiredNumber(
				tokens?.output,
				`${sourcePath}.results[${index}].tokens.output`,
			),
			total_tokens: requiredNumber(
				tokens?.total,
				`${sourcePath}.results[${index}].tokens.total`,
			),
		};
	});
	return {
		pack_id: LIVE_BENCHMARK_EXPECTED_PACK_ID,
		generated_at: generatedAt,
		pass: scenarios.every((scenario) => scenario.pass),
		duration_ms: scenarios.reduce((sum, row) => sum + row.duration_ms, 0),
		tool_call_count: scenarios.reduce(
			(sum, row) => sum + row.tool_call_count,
			0,
		),
		error_count: scenarios.reduce((sum, row) => sum + row.error_count, 0),
		retry_count: 0,
		context_bytes_total: 0,
		prompt_bytes_total: 0,
		benchmark_profile: {
			runtime,
			...benchmarkProfile,
		},
		scenarios,
	};
}

function loadRuntimeLiveEvidence(projectRoot: string): RuntimeLiveEvidence {
	const snapshotPath = join(projectRoot, LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH);
	if (!existsSync(snapshotPath)) {
		throw new Error(
			`runtime-live-artifact-missing:${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	const snapshot = loadJsonObject(snapshotPath);
	const snapshotPackId = asString(snapshot.pack_id, `${snapshotPath}.pack_id`);
	if (snapshotPackId !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${snapshotPackId};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	assertFixedHarnessProfile(
		parseLiveRunnerProfile(
			snapshot.benchmark_profile,
			`${snapshotPath}.benchmark_profile`,
		),
	);
	const savedResultPathRaw = asOptionalString(
		snapshot.saved_result_path,
		`${snapshotPath}.saved_result_path`,
	);
	const savedResultPath = savedResultPathRaw
		? resolve(projectRoot, savedResultPathRaw)
		: undefined;
	const payloadSource =
		savedResultPath && existsSync(savedResultPath) ? "result" : "snapshot";
	const schemaVersion = asString(
		snapshot.schema_version,
		`${snapshotPath}.schema_version`,
	);
	if (schemaVersion !== LIVE_BENCHMARK_SNAPSHOT_SCHEMA_VERSION) {
		throw new Error(
			`runtime-live-snapshot-schema-mismatch:${schemaVersion};expected:${LIVE_BENCHMARK_SNAPSHOT_SCHEMA_VERSION};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	const staleAfterDays = asOptionalNumber(
		snapshot.stale_after_days,
		`${snapshotPath}.stale_after_days`,
	);
	const generatedAt = Date.parse(
		asString(snapshot.generated_at, `${snapshotPath}.generated_at`),
	);
	if (
		!Number.isFinite(generatedAt) ||
		staleAfterDays !== LIVE_BENCHMARK_STALE_AFTER_DAYS
	) {
		throw new Error(
			`runtime-live-snapshot-freshness-invalid:${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	const ageMs = Date.now() - generatedAt;
	if (ageMs < 0 || ageMs > staleAfterDays * 24 * 60 * 60 * 1000) {
		throw new Error(
			`runtime-live-snapshot-stale:${LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH};generated-at:${snapshot.generated_at};max-age-days:${staleAfterDays};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	const snapshotPayload = parseLiveRunnerPayload(snapshot, snapshotPath);
	const payloadPath =
		payloadSource === "result" && savedResultPath
			? savedResultPath
			: snapshotPath;
	const payload =
		payloadSource === "result"
			? (() => {
					const savedResult = loadJsonObject(payloadPath);
					return savedResult.schema_version ===
						LIVE_BENCHMARK_RESULT_SCHEMA_VERSION
						? parseSavedRunArchive(savedResult, payloadPath)
						: parseLiveRunnerPayload(savedResult, payloadPath);
				})()
			: snapshotPayload;
	if (
		payloadSource === "result" &&
		payload.generated_at !== snapshotPayload.generated_at
	) {
		throw new Error(
			`runtime-live-result-timestamp-mismatch:${payload.generated_at};snapshot:${snapshotPayload.generated_at}`,
		);
	}
	if (payload.pack_id !== LIVE_BENCHMARK_EXPECTED_PACK_ID) {
		throw new Error(
			`runtime-live-artifact-pack-mismatch:${payload.pack_id};expected:${LIVE_BENCHMARK_EXPECTED_PACK_ID};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`,
		);
	}
	assertFixedHarnessProfile(payload.benchmark_profile);
	return {
		snapshotPathRelative: resolveRelativePath(
			projectRoot,
			LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH,
		),
		savedResultPathRelative:
			payloadSource === "result" && savedResultPathRaw
				? resolveRelativePath(projectRoot, savedResultPathRaw)
				: LIVE_BENCHMARK_SNAPSHOT_RELATIVE_PATH,
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

function plannedRuntimeLiveResult(
	projectRoot: string,
	scenario: Scenario,
	baselinePath: string,
): BenchmarkResult {
	const metrics = scenario.deterministic_metrics;
	return {
		schema_version: BENCHMARK_RESULT_SCHEMA_VERSION,
		run_id: `live-runtime-live-agent-${scenario.scenario_id}-${scenario.scenario_version}`,
		scenario_id: scenario.scenario_id,
		scenario_version: scenario.scenario_version,
		pack_id: scenario.pack_id,
		status: "skipped",
		baseline_id: scenario.baseline_id,
		baseline_reference: relative(projectRoot, baselinePath).replaceAll(
			"\\",
			"/",
		),
		threshold_reference: scenario.thresholds,
		pass: false,
		duration_ms: metrics.duration_ms ?? 0,
		timing_p50_ms: metrics.timing_p50_ms ?? metrics.duration_ms ?? 0,
		timing_p95_ms: metrics.timing_p95_ms ?? metrics.duration_ms ?? 0,
		error_count: 0,
		retry_count: 0,
		context_tokens: metrics.context_tokens ?? 0,
		prompt_tokens: metrics.prompt_tokens ?? 0,
		output_tokens: metrics.output_tokens ?? 0,
		context_bytes: metrics.context_bytes ?? 0,
		output_bytes: metrics.output_bytes ?? 0,
		tool_call_count: 0,
		tool_success_rate: 1,
		git_commit: getGitCommit(projectRoot),
		notes: ["planned-no-execution"],
	};
}

function getGitCommit(projectRoot: string): string {
	const result = boundedSpawn("git", ["rev-parse", "--short=12", "HEAD"], {
		cwd: projectRoot,
		timeoutMs: 15_000,
	});
	if (result.ok) {
		return result.stdout.trim() || "unknown";
	}
	return "unknown";
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
	return `${reason}:${scenario.scenario_id}:${mappedId};artifact:${evidence.savedResultPathRelative};${LIVE_BENCHMARK_REFRESH_GUIDANCE}`;
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
		output_bytes: mappedScenario.output_bytes,
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
				scenario.implementation_status === "planned"
					? plannedRuntimeLiveResult(projectRoot, scenario, baselinePath)
					: failedRuntimeLiveResult(projectRoot, scenario, baselinePath, note),
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
		if (scenario.implementation_status === "planned") {
			return plannedRuntimeLiveResult(projectRoot, scenario, baselinePath);
		}
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

	const proofScenarioCount = scenarios.filter(
		(scenario) => scenario.implementation_status !== "planned",
	).length;
	if (matchedDirectEvidenceCount !== proofScenarioCount) {
		incompleteArtifact = true;
	}

	return {
		results,
		notes: [
			`runtime-live-agent-artifact:${evidence.savedResultPathRelative}`,
			`runtime-live-agent-evidence-source:${evidence.payloadSource}`,
			...(incompleteArtifact
				? [
						`runtime-live-artifact-incomplete:${evidence.savedResultPathRelative};matched-direct-evidence:${matchedDirectEvidenceCount}/${proofScenarioCount};${LIVE_BENCHMARK_REFRESH_GUIDANCE};note:${LIVE_BENCHMARK_REFRESH_NOTE}`,
					]
				: []),
			`runtime-live-agent-refresh:${LIVE_BENCHMARK_REFRESH_COMMAND}`,
			`runtime-live-agent-refresh-note:${LIVE_BENCHMARK_REFRESH_NOTE}`,
		],
	};
}
