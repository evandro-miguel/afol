import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type {
	BenchmarkBaseline,
	BenchReport,
	BenchResult,
	BenchToolTypeCounts,
} from "./types";
import { BENCH_SCHEMA_VERSION } from "./types";

const RESULTS_RELATIVE_PATH = ".afol/data/benchmarks/results";
const BASELINES_RELATIVE_PATH = ".afol/data/benchmarks/catalog/baselines";

type SavedRunArchive = {
	schema_version: string;
	run_id: string;
	pack_id: string;
	timestamp: string;
	results: BenchResult[];
	report: BenchReport["json"];
	text: string;
};

type Aggregate = {
	total_tokens: number;
	total_time_ms: number;
	avg_tool_success_rate: number;
	tool_success_total: number;
	tool_success_count: number;
	by_type: BenchToolTypeCounts;
	error_count: number;
	results_count: number;
	passed: number;
	failed: number;
	blocked: number;
	meta_planning_detected: boolean;
	direct_execution: boolean;
};

function aggregateResults(results: BenchResult[]): Aggregate {
	const aggregate: Aggregate = {
		total_tokens: 0,
		total_time_ms: 0,
		avg_tool_success_rate: 0,
		tool_success_total: 0,
		tool_success_count: 0,
		by_type: {
			file_read: 0,
			afol_command: 0,
			shell: 0,
			agent_message: 0,
		},
		error_count: 0,
		results_count: results.length,
		passed: 0,
		failed: 0,
		blocked: 0,
		meta_planning_detected: false,
		direct_execution: true,
	};

	for (const result of results) {
		aggregate.total_tokens += result.tokens.total;
		aggregate.total_time_ms += result.timing.wall_clock_ms;
		aggregate.tool_success_total += result.tools.success_rate;
		aggregate.tool_success_count += 1;
		aggregate.by_type.file_read += result.tools.by_type.file_read;
		aggregate.by_type.afol_command += result.tools.by_type.afol_command;
		aggregate.by_type.shell += result.tools.by_type.shell;
		aggregate.by_type.agent_message += result.tools.by_type.agent_message;
		aggregate.error_count += result.tools.error_count;
		if (result.status === "passed") {
			aggregate.passed += 1;
		} else if (result.status === "blocked") {
			aggregate.blocked += 1;
		} else {
			aggregate.failed += 1;
		}
		if (result.plan_quality?.meta_planning_detected) {
			aggregate.meta_planning_detected = true;
		}
		if (!result.plan_quality?.direct_execution) {
			aggregate.direct_execution = false;
		}
	}

	if (aggregate.tool_success_count > 0) {
		aggregate.avg_tool_success_rate = Number(
			(aggregate.tool_success_total / aggregate.tool_success_count).toFixed(4),
		);
	}

	return aggregate;
}

function baselineComparison(
	results: BenchResult[],
	baseline: BenchmarkBaseline | null,
	aggregate: Aggregate,
): BenchReport["comparison"] {
	if (!baseline) {
		return {
			delta_tokens: null,
			delta_time_ms: null,
			delta_tool_success_rate: null,
			regressions: [],
		};
	}

	const baselineTokens =
		baseline.tokens?.total ?? baseline.aggregate?.total_tokens ?? null;
	const baselineTime =
		baseline.timing?.wall_clock_ms ?? baseline.aggregate?.total_time_ms ?? null;
	const baselineSuccess =
		baseline.tools?.success_rate ??
		baseline.aggregate?.avg_tool_success_rate ??
		null;
	const deltaTokens =
		baselineTokens === null ? null : aggregate.total_tokens - baselineTokens;
	const deltaTime =
		baselineTime === null ? null : aggregate.total_time_ms - baselineTime;
	const deltaSuccess =
		baselineSuccess === null
			? null
			: aggregate.avg_tool_success_rate - baselineSuccess;
	const regressions: string[] = [];
	if (deltaTokens !== null && deltaTokens > 0) {
		regressions.push(`tokens+${deltaTokens}`);
	}
	if (deltaTime !== null && deltaTime > 0) {
		regressions.push(`time+${deltaTime}`);
	}
	if (deltaSuccess !== null && deltaSuccess < 0) {
		regressions.push(`tool-success-${Math.abs(deltaSuccess)}`);
	}
	if (results.some((result) => result.status !== "passed")) {
		regressions.push("scenario-failures");
	}
	return {
		delta_tokens: deltaTokens,
		delta_time_ms: deltaTime,
		delta_tool_success_rate: deltaSuccess,
		regressions,
	};
}

function formatReportText(report: BenchReport): string {
	const lines = [
		`bench report: ${report.pack_id}`,
		`run: ${report.run_id}`,
		`timestamp: ${report.timestamp}`,
		`results: ${report.summary.total} passed=${report.summary.passed} failed=${report.summary.failed} blocked=${report.summary.blocked}`,
		`tokens: total=${report.summary.total_tokens}`,
		`time_ms: total=${report.summary.total_time_ms}`,
		`tool_success: ${report.summary.avg_tool_success_rate}`,
	];
	if (report.baseline) {
		lines.push(
			`baseline: ${report.baseline.baseline_id}`,
			`delta_tokens: ${report.comparison.delta_tokens ?? "n/a"}`,
			`delta_time_ms: ${report.comparison.delta_time_ms ?? "n/a"}`,
			`delta_tool_success_rate: ${report.comparison.delta_tool_success_rate ?? "n/a"}`,
		);
	}
	if (report.comparison.regressions.length > 0) {
		lines.push(`regressions: ${report.comparison.regressions.join(", ")}`);
	}
	for (const result of report.results) {
		lines.push(
			`${result.status} ${result.scenario_id} tokens=${result.tokens.total} time_ms=${result.timing.wall_clock_ms} tools=${result.tools.total_calls}`,
		);
	}
	return lines.join("\n");
}

function scenarioReport(
	results: BenchResult[],
): Array<Record<string, unknown>> {
	return results.map((result) => ({
		scenario_id: result.scenario_id,
		status: result.status,
		pass: result.pass,
		tokens: result.tokens,
		timing: result.timing,
		tools: result.tools,
		effectiveness: result.effectiveness,
		plan_quality: result.plan_quality,
		notes: result.notes,
	}));
}

export function buildReport(
	results: BenchResult[],
	baseline: BenchmarkBaseline | null = null,
): BenchReport {
	const aggregate = aggregateResults(results);
	const timestamp = results[0]?.timestamp ?? new Date().toISOString();
	const runId = results[0]?.run_id ?? `bench-${Date.now().toString(36)}`;
	const packId = results[0]?.pack_id ?? "unknown";
	const comparison = baselineComparison(results, baseline, aggregate);
	const report: BenchReport = {
		schema_version: BENCH_SCHEMA_VERSION,
		run_id: runId,
		pack_id: packId,
		timestamp,
		results,
		baseline,
		summary: {
			total: aggregate.results_count,
			passed: aggregate.passed,
			failed: aggregate.failed,
			blocked: aggregate.blocked,
			total_tokens: aggregate.total_tokens,
			total_time_ms: aggregate.total_time_ms,
			avg_tool_success_rate: aggregate.avg_tool_success_rate,
		},
		comparison,
		text: "",
		json: {},
	};
	report.text = formatReportText(report);
	report.json = {
		schema_version: report.schema_version,
		run_id: report.run_id,
		pack_id: report.pack_id,
		timestamp: report.timestamp,
		summary: report.summary,
		comparison: report.comparison,
		baseline: report.baseline,
		results: scenarioReport(results),
		text: report.text,
	};
	return report;
}

function readJson(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) {
		return null;
	}
	try {
		const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
		if (typeof data === "object" && data !== null && !Array.isArray(data)) {
			return data as Record<string, unknown>;
		}
		throw new Error("root must be an object.");
	} catch (error) {
		throw new Error(
			`Malformed benchmark JSON ${path}: ${(error as Error).message}`,
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSavedRun(
	path: string,
	fieldPath: string,
	message: string,
): never {
	throw new Error(`Malformed benchmark run ${path}: ${fieldPath} ${message}`);
}

function requireRecord(
	value: unknown,
	path: string,
	fieldPath: string,
): Record<string, unknown> {
	if (!isRecord(value)) {
		invalidSavedRun(path, fieldPath, "must be an object.");
	}
	return value;
}

function requireString(
	value: unknown,
	path: string,
	fieldPath: string,
): string {
	if (typeof value !== "string") {
		invalidSavedRun(path, fieldPath, "must be a string.");
	}
	return value;
}

function requireNonemptyString(
	value: unknown,
	path: string,
	fieldPath: string,
): string {
	const parsed = requireString(value, path, fieldPath);
	if (!parsed.trim()) invalidSavedRun(path, fieldPath, "must not be empty.");
	return parsed;
}

function requireBoolean(
	value: unknown,
	path: string,
	fieldPath: string,
): boolean {
	if (typeof value !== "boolean") {
		invalidSavedRun(path, fieldPath, "must be a boolean.");
	}
	return value;
}

function requireFiniteNumber(
	value: unknown,
	path: string,
	fieldPath: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		invalidSavedRun(path, fieldPath, "must be a finite number.");
	}
	return value;
}

function requireNonnegativeNumber(
	value: unknown,
	path: string,
	fieldPath: string,
): number {
	const parsed = requireFiniteNumber(value, path, fieldPath);
	if (parsed < 0) invalidSavedRun(path, fieldPath, "must be nonnegative.");
	return parsed;
}

function requireNonnegativeInteger(
	value: unknown,
	path: string,
	fieldPath: string,
): number {
	const parsed = requireNonnegativeNumber(value, path, fieldPath);
	if (!Number.isInteger(parsed)) {
		invalidSavedRun(path, fieldPath, "must be an integer.");
	}
	return parsed;
}

function requireEnum<T extends string>(
	value: unknown,
	options: readonly T[],
	path: string,
	fieldPath: string,
): T {
	if (typeof value !== "string" || !options.includes(value as T)) {
		invalidSavedRun(path, fieldPath, `must be one of: ${options.join(", ")}.`);
	}
	return value as T;
}

function requireStringArray(
	value: unknown,
	path: string,
	fieldPath: string,
): string[] {
	if (
		!Array.isArray(value) ||
		value.some((entry) => typeof entry !== "string")
	) {
		invalidSavedRun(path, fieldPath, "must be an array of strings.");
	}
	return value;
}

function parseTokens(
	value: Record<string, unknown>,
	path: string,
	fieldPath: string,
): BenchResult["tokens"] {
	const tokens = {
		input: requireNonnegativeInteger(value.input, path, `${fieldPath}.input`),
		output: requireNonnegativeInteger(
			value.output,
			path,
			`${fieldPath}.output`,
		),
		cached_input: requireNonnegativeInteger(
			value.cached_input,
			path,
			`${fieldPath}.cached_input`,
		),
		reasoning_output: requireNonnegativeInteger(
			value.reasoning_output,
			path,
			`${fieldPath}.reasoning_output`,
		),
		total: requireNonnegativeInteger(value.total, path, `${fieldPath}.total`),
	};
	if (
		tokens.total !==
		tokens.input + tokens.output + tokens.cached_input + tokens.reasoning_output
	) {
		invalidSavedRun(
			path,
			`${fieldPath}.total`,
			"must equal the sum of token fields.",
		);
	}
	return tokens;
}

function parseBenchResult(
	entry: unknown,
	path: string,
	index: number,
): BenchResult {
	const rowPath = `results[${index}]`;
	const record = requireRecord(entry, path, rowPath);
	const tokens = requireRecord(record.tokens, path, `${rowPath}.tokens`);
	const timing = requireRecord(record.timing, path, `${rowPath}.timing`);
	const tools = requireRecord(record.tools, path, `${rowPath}.tools`);
	const toolCounts = requireRecord(
		tools.by_type,
		path,
		`${rowPath}.tools.by_type`,
	);
	const effectiveness = requireRecord(
		record.effectiveness,
		path,
		`${rowPath}.effectiveness`,
	);
	const thresholds = requireRecord(
		record.thresholds,
		path,
		`${rowPath}.thresholds`,
	);
	const planQualityValue = record.plan_quality;
	const planQuality =
		planQualityValue === null
			? null
			: (() => {
					const parsed = requireRecord(
						planQualityValue,
						path,
						`${rowPath}.plan_quality`,
					);
					return {
						meta_planning_detected: requireBoolean(
							parsed.meta_planning_detected,
							path,
							`${rowPath}.plan_quality.meta_planning_detected`,
						),
						direct_execution: requireBoolean(
							parsed.direct_execution,
							path,
							`${rowPath}.plan_quality.direct_execution`,
						),
					};
				})();
	const parsedTokens = parseTokens(tokens, path, `${rowPath}.tokens`);
	const wallClockMs = requireNonnegativeNumber(
		timing.wall_clock_ms,
		path,
		`${rowPath}.timing.wall_clock_ms`,
	);

	const parsedThresholds: BenchResult["thresholds"] = {
		max_output_tokens: requireFiniteNumber(
			thresholds.max_output_tokens,
			path,
			`${rowPath}.thresholds.max_output_tokens`,
		),
		max_duration_ms: requireFiniteNumber(
			thresholds.max_duration_ms,
			path,
			`${rowPath}.thresholds.max_duration_ms`,
		),
		min_tool_success_rate: requireFiniteNumber(
			thresholds.min_tool_success_rate,
			path,
			`${rowPath}.thresholds.min_tool_success_rate`,
		),
	};
	const status = requireEnum(
		record.status,
		["passed", "failed", "blocked"],
		path,
		`${rowPath}.status`,
	);
	const pass = requireBoolean(record.pass, path, `${rowPath}.pass`);
	if (pass !== (status === "passed")) {
		invalidSavedRun(
			path,
			`${rowPath}.pass`,
			"must be true exactly when status is passed.",
		);
	}
	for (const key of [
		"max_total_tokens",
		"max_afol_commands",
		"max_round_trips",
	] as const) {
		if (Object.hasOwn(thresholds, key)) {
			parsedThresholds[key] = requireFiniteNumber(
				thresholds[key],
				path,
				`${rowPath}.thresholds.${key}`,
			);
		}
	}
	const totalCalls = requireNonnegativeInteger(
		tools.total_calls,
		path,
		`${rowPath}.tools.total_calls`,
	);
	const successRate = requireNonnegativeNumber(
		tools.success_rate,
		path,
		`${rowPath}.tools.success_rate`,
	);
	if (successRate > 1) {
		invalidSavedRun(
			path,
			`${rowPath}.tools.success_rate`,
			"must be between 0 and 1.",
		);
	}
	const parsedToolCounts = {
		file_read: requireNonnegativeInteger(
			toolCounts.file_read,
			path,
			`${rowPath}.tools.by_type.file_read`,
		),
		afol_command: requireNonnegativeInteger(
			toolCounts.afol_command,
			path,
			`${rowPath}.tools.by_type.afol_command`,
		),
		shell: requireNonnegativeInteger(
			toolCounts.shell,
			path,
			`${rowPath}.tools.by_type.shell`,
		),
		agent_message: requireNonnegativeInteger(
			toolCounts.agent_message,
			path,
			`${rowPath}.tools.by_type.agent_message`,
		),
	};
	if (
		Object.values(parsedToolCounts).reduce((sum, count) => sum + count, 0) !==
		totalCalls
	) {
		invalidSavedRun(
			path,
			`${rowPath}.tools.by_type`,
			"must sum to tools.total_calls.",
		);
	}
	const toolErrorCount = requireNonnegativeInteger(
		tools.error_count,
		path,
		`${rowPath}.tools.error_count`,
	);
	if (toolErrorCount > totalCalls) {
		invalidSavedRun(
			path,
			`${rowPath}.tools.error_count`,
			"must not exceed tools.total_calls.",
		);
	}

	return {
		schema_version: requireEnum(
			record.schema_version,
			[BENCH_SCHEMA_VERSION],
			path,
			`${rowPath}.schema_version`,
		),
		run_id: requireNonemptyString(record.run_id, path, `${rowPath}.run_id`),
		scenario_id: requireNonemptyString(
			record.scenario_id,
			path,
			`${rowPath}.scenario_id`,
		),
		pack_id: requireNonemptyString(record.pack_id, path, `${rowPath}.pack_id`),
		status,
		mode: requireEnum(
			record.mode,
			["live", "cli-micro"],
			path,
			`${rowPath}.mode`,
		),
		git_commit: requireNonemptyString(
			record.git_commit,
			path,
			`${rowPath}.git_commit`,
		),
		model: requireNonemptyString(record.model, path, `${rowPath}.model`),
		timestamp: requireNonemptyString(
			record.timestamp,
			path,
			`${rowPath}.timestamp`,
		),
		tokens: parsedTokens,
		timing: { wall_clock_ms: wallClockMs },
		tools: {
			total_calls: totalCalls,
			success_rate: successRate,
			by_type: parsedToolCounts,
			error_count: toolErrorCount,
		},
		effectiveness: {
			task_completed: requireBoolean(
				effectiveness.task_completed,
				path,
				`${rowPath}.effectiveness.task_completed`,
			),
			error_count: requireNonnegativeInteger(
				effectiveness.error_count,
				path,
				`${rowPath}.effectiveness.error_count`,
			),
		},
		plan_quality: planQuality,
		thresholds: parsedThresholds,
		pass,
		notes: requireStringArray(record.notes, path, `${rowPath}.notes`),
	};
}

function parseSavedRunResults(
	resultsRaw: unknown[],
	path: string,
	packId: string,
): BenchResult[] {
	return resultsRaw.map((entry, index) => {
		const result = parseBenchResult(entry, path, index);
		if (result.pack_id !== packId) {
			invalidSavedRun(
				path,
				`results[${index}].pack_id`,
				`must match archive pack_id "${packId}".`,
			);
		}
		return result;
	});
}

function parseToolCounts(value: unknown): BenchToolTypeCounts | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const record = value as Record<string, unknown>;
	const fileRead = Number(record.file_read ?? 0);
	const afolCommand = Number(record.afol_command ?? 0);
	const shell = Number(record.shell ?? 0);
	const agentMessage = Number(record.agent_message ?? 0);
	if (
		[fileRead, afolCommand, shell, agentMessage].some(
			(entry) => !Number.isFinite(entry),
		)
	) {
		return null;
	}
	return {
		file_read: fileRead,
		afol_command: afolCommand,
		shell,
		agent_message: agentMessage,
	};
}

function parseBaseline(
	data: Record<string, unknown>,
	path: string,
): BenchmarkBaseline | null {
	const schemaVersion =
		typeof data.schema_version === "string" ? data.schema_version : null;
	const baselineId =
		typeof data.baseline_id === "string" ? data.baseline_id : null;
	const packId = typeof data.pack_id === "string" ? data.pack_id : null;
	if (!schemaVersion || !baselineId || !packId) {
		return null;
	}
	const baseline: BenchmarkBaseline = {
		schema_version: schemaVersion,
		baseline_id: baselineId,
		pack_id: packId,
	};
	if (typeof data.git_commit === "string") {
		baseline.git_commit = data.git_commit;
	}
	if (typeof data.run_id === "string") {
		baseline.run_id = data.run_id;
	}
	if (typeof data.timestamp === "string") {
		baseline.timestamp = data.timestamp;
	}
	if (typeof data.results_count === "number") {
		baseline.results_count = data.results_count;
	}
	if (typeof data.timing_p50_ms === "number") {
		baseline.timing = { wall_clock_ms: data.timing_p50_ms };
	}
	if (typeof data.timing === "object" && data.timing !== null) {
		const timing = data.timing as Record<string, unknown>;
		if (typeof timing.wall_clock_ms === "number") {
			baseline.timing = { wall_clock_ms: timing.wall_clock_ms };
		}
	}
	if (typeof data.tokens === "object" && data.tokens !== null) {
		const tokenData = data.tokens as Record<string, unknown>;
		baseline.tokens = {
			input: Number(tokenData.input ?? 0),
			output: Number(tokenData.output ?? 0),
			cached_input: Number(tokenData.cached_input ?? 0),
			reasoning_output: Number(tokenData.reasoning_output ?? 0),
			total: Number(tokenData.total ?? 0),
		};
	}
	const tools = parseToolCounts(data.tools);
	if (tools) {
		baseline.tools = {
			total_calls: Number(
				(data.tools as Record<string, unknown>).total_calls ?? 0,
			),
			success_rate: Number(
				(data.tools as Record<string, unknown>).success_rate ?? 0,
			),
			by_type: tools,
			error_count: Number(
				(data.tools as Record<string, unknown>).error_count ?? 0,
			),
		};
	}
	if (typeof data.effectiveness === "object" && data.effectiveness !== null) {
		const effectiveness = data.effectiveness as Record<string, unknown>;
		baseline.effectiveness = {
			task_completed: Boolean(effectiveness.task_completed),
			error_count: Number(effectiveness.error_count ?? 0),
		};
	}
	if (typeof data.plan_quality === "object" && data.plan_quality !== null) {
		const planQuality = data.plan_quality as Record<string, unknown>;
		baseline.plan_quality = {
			meta_planning_detected: Boolean(planQuality.meta_planning_detected),
			direct_execution: Boolean(planQuality.direct_execution),
		};
	}
	if (typeof data.aggregate === "object" && data.aggregate !== null) {
		const aggregate = data.aggregate as Record<string, unknown>;
		baseline.aggregate = {
			total_tokens: Number(aggregate.total_tokens ?? 0),
			total_time_ms: Number(aggregate.total_time_ms ?? 0),
			avg_tool_success_rate: Number(aggregate.avg_tool_success_rate ?? 0),
		};
	}
	if (typeof data.legacy === "object" && data.legacy !== null) {
		baseline.legacy = data.legacy as Record<string, unknown>;
	}
	void path;
	return baseline;
}

export function loadBaseline(
	root: string,
	packId: string,
): BenchmarkBaseline | null {
	const path = join(root, BASELINES_RELATIVE_PATH, packId, "baseline-v1.json");
	const data = readJson(path);
	if (!data) {
		return null;
	}
	return parseBaseline(data, path);
}

export function saveBaseline(
	root: string,
	packId: string,
	report: BenchReport,
): string {
	const path = join(root, BASELINES_RELATIVE_PATH, packId, "baseline-v1.json");
	mkdirSync(dirname(path), { recursive: true });
	const payload: BenchmarkBaseline = {
		schema_version: BENCH_SCHEMA_VERSION,
		baseline_id: `${packId}-baseline-v2`,
		pack_id: packId,
		run_id: report.run_id,
		timestamp: report.timestamp,
		results_count: report.summary.total,
		tokens: report.results.reduce<BenchReport["results"][number]["tokens"]>(
			(acc, result) => ({
				input: acc.input + result.tokens.input,
				output: acc.output + result.tokens.output,
				cached_input: acc.cached_input + result.tokens.cached_input,
				reasoning_output: acc.reasoning_output + result.tokens.reasoning_output,
				total: acc.total + result.tokens.total,
			}),
			{ input: 0, output: 0, cached_input: 0, reasoning_output: 0, total: 0 },
		),
		timing: { wall_clock_ms: report.summary.total_time_ms },
		tools: {
			total_calls: report.results.reduce(
				(sum, result) => sum + result.tools.total_calls,
				0,
			),
			success_rate: report.summary.avg_tool_success_rate,
			by_type: report.results.reduce<BenchToolTypeCounts>(
				(acc, result) => ({
					file_read: acc.file_read + result.tools.by_type.file_read,
					afol_command: acc.afol_command + result.tools.by_type.afol_command,
					shell: acc.shell + result.tools.by_type.shell,
					agent_message: acc.agent_message + result.tools.by_type.agent_message,
				}),
				{ file_read: 0, afol_command: 0, shell: 0, agent_message: 0 },
			),
			error_count: report.results.reduce(
				(sum, result) => sum + result.tools.error_count,
				0,
			),
		},
		effectiveness: {
			task_completed:
				report.summary.failed === 0 && report.summary.blocked === 0,
			error_count: report.results.reduce(
				(sum, result) => sum + result.effectiveness.error_count,
				0,
			),
		},
		plan_quality: {
			meta_planning_detected: report.results.some(
				(result) => result.plan_quality?.meta_planning_detected === true,
			),
			direct_execution: report.results.every(
				(result) => result.plan_quality?.direct_execution !== false,
			),
		},
		aggregate: {
			total_tokens: report.summary.total_tokens,
			total_time_ms: report.summary.total_time_ms,
			avg_tool_success_rate: report.summary.avg_tool_success_rate,
		},
	};
	if (report.results[0]?.git_commit) {
		payload.git_commit = report.results[0].git_commit;
	}
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return relative(root, path).replaceAll("\\", "/");
}

export function loadSavedRun(path: string): SavedRunArchive | null {
	const data = readJson(path);
	if (!data) {
		return null;
	}
	const schemaVersion = requireEnum(
		data.schema_version,
		[BENCH_SCHEMA_VERSION],
		path,
		"schema_version",
	);
	const runId = requireNonemptyString(data.run_id, path, "run_id");
	const packId = requireNonemptyString(data.pack_id, path, "pack_id");
	const timestamp = requireNonemptyString(data.timestamp, path, "timestamp");
	if (!Array.isArray(data.results)) {
		invalidSavedRun(path, "results", "must be an array.");
	}
	const resultsRaw = data.results;
	if (resultsRaw.length === 0) {
		invalidSavedRun(path, "results", "must include at least one result.");
	}
	const results = parseSavedRunResults(resultsRaw, path, packId);
	return {
		schema_version: schemaVersion,
		run_id: runId,
		pack_id: packId,
		timestamp,
		results,
		report:
			typeof data.report === "object" && data.report !== null
				? (data.report as BenchReport["json"])
				: {},
		text: typeof data.text === "string" ? data.text : "",
	};
}

export function saveRunArchive(root: string, report: BenchReport): string {
	const timestamp = report.timestamp.replaceAll(":", "-");
	const fileName = `${timestamp}_${report.pack_id}.json`;
	const path = join(root, RESULTS_RELATIVE_PATH, fileName);
	mkdirSync(dirname(path), { recursive: true });
	const payload: SavedRunArchive = {
		schema_version: BENCH_SCHEMA_VERSION,
		run_id: report.run_id,
		pack_id: report.pack_id,
		timestamp: report.timestamp,
		results: report.results,
		report: report.json,
		text: report.text,
	};
	writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return relative(root, path).replaceAll("\\", "/");
}
