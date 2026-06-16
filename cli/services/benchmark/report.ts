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
		return typeof data === "object" && data !== null
			? (data as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
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
	const resultsRaw = Array.isArray(data.results) ? data.results : null;
	if (!resultsRaw) {
		return null;
	}
	const results = resultsRaw.filter((entry): entry is BenchResult => {
		return (
			typeof entry === "object" &&
			entry !== null &&
			typeof (entry as { scenario_id?: unknown }).scenario_id === "string"
		);
	});
	return {
		schema_version:
			typeof data.schema_version === "string"
				? data.schema_version
				: BENCH_SCHEMA_VERSION,
		run_id:
			typeof data.run_id === "string"
				? data.run_id
				: `bench-${Date.now().toString(36)}`,
		pack_id: typeof data.pack_id === "string" ? data.pack_id : "unknown",
		timestamp:
			typeof data.timestamp === "string"
				? data.timestamp
				: new Date().toISOString(),
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
