export type ScenarioResult = {
	afolCalls: number;
	verificationRuns: number;
	durationMs: number;
	outputBytes: number;
	argvChars: number;
};

export type RepeatedSummary = {
	afol_calls: number;
	verification_runs: number;
	samples_ms: number[];
	p50_ms: number;
	p95_ms: number;
	output_bytes_p50: number;
	argv_chars_p50: number;
};

export type MultitaskBenchmarkResult = {
	schema: "afol.multitask-throughput/v2";
	generated_at: string;
	environment: {
		platform: string;
		arch: string;
		bun_version: string;
		timing_mode: "paired-relative";
		pair_order: "alternating";
		source_commit: string;
		source_dirty: boolean;
		baseline_sha256: string;
	};
	runs: number;
	first_attempt_success: true;
	retries: 0;
	scaling: Array<{
		task_count: number;
		sequential: ScenarioResult;
		batch: ScenarioResult;
	}>;
	batch_boundary_100: ScenarioResult;
	repeated_10_tasks: {
		sequential: RepeatedSummary;
		batch: RepeatedSummary;
	};
};

export type MultitaskBenchmarkBaseline = {
	schema: "afol.multitask-throughput-baseline/v1";
	baseline_id: string;
	timing_mode: "paired-relative";
	sample_count_min: number;
	gates: Record<string, number>;
};

export type GateResult = {
	id: string;
	ok: boolean;
	actual: number;
	operator: ">=" | "<=";
	expected: number;
};

export type Comparison = {
	status: "passed" | "failed" | "smoke";
	baseline_id: string;
	quality_claim: boolean;
	gates: GateResult[];
};

type GateDefinition = [
	id: string,
	actual: number,
	operator: ">=" | "<=",
	threshold: string,
];

export const REQUIRED_BASELINE_GATE_KEYS = [
	"ten_task_call_reduction_pct_min",
	"ten_task_verification_reduction_pct_min",
	"ten_task_p50_reduction_pct_min",
	"ten_task_p95_reduction_pct_min",
	"ten_task_output_reduction_pct_min",
	"ten_task_argv_reduction_pct_min",
	"batch_100_afol_calls_max",
	"batch_100_verification_runs_max",
	"batch_100_argv_chars_max",
	"batch_100_output_bytes_max",
	"batch_100_duration_ms_max",
] as const;

export function assertValidMultitaskBenchmarkBaseline(
	baseline: MultitaskBenchmarkBaseline,
	source = "baseline",
): void {
	if (
		baseline.schema !== "afol.multitask-throughput-baseline/v1" ||
		baseline.timing_mode !== "paired-relative" ||
		!baseline.baseline_id?.trim() ||
		!Number.isInteger(baseline.sample_count_min) ||
		baseline.sample_count_min < 1
	) {
		throw new Error(`Invalid multitask benchmark baseline: ${source}`);
	}
	for (const key of REQUIRED_BASELINE_GATE_KEYS) {
		if (!Number.isFinite(baseline.gates?.[key])) {
			throw new Error(
				`Invalid multitask benchmark baseline: missing finite gate ${key} in ${source}`,
			);
		}
	}
}

export function repeatedPairOrder(
	index: number,
): readonly ["sequential", "batch"] | readonly ["batch", "sequential"] {
	return index % 2 === 0 ? ["sequential", "batch"] : ["batch", "sequential"];
}

export function reduction(before: number, after: number): number {
	return Math.round(((before - after) / before) * 1_000) / 10;
}

export function evaluateMultitaskBenchmark(
	result: MultitaskBenchmarkResult,
	baseline: MultitaskBenchmarkBaseline,
	qualityClaim = true,
): Comparison {
	const sequential = result.repeated_10_tasks.sequential;
	const batch = result.repeated_10_tasks.batch;
	const boundary = result.batch_boundary_100;
	const definitions: GateDefinition[] = [
		[
			"ten_task_call_reduction_pct",
			reduction(sequential.afol_calls, batch.afol_calls),
			">=",
			"ten_task_call_reduction_pct_min",
		],
		[
			"ten_task_verification_reduction_pct",
			reduction(sequential.verification_runs, batch.verification_runs),
			">=",
			"ten_task_verification_reduction_pct_min",
		],
		[
			"ten_task_p50_reduction_pct",
			reduction(sequential.p50_ms, batch.p50_ms),
			">=",
			"ten_task_p50_reduction_pct_min",
		],
		[
			"ten_task_p95_reduction_pct",
			reduction(sequential.p95_ms, batch.p95_ms),
			">=",
			"ten_task_p95_reduction_pct_min",
		],
		[
			"ten_task_output_reduction_pct",
			reduction(sequential.output_bytes_p50, batch.output_bytes_p50),
			">=",
			"ten_task_output_reduction_pct_min",
		],
		[
			"ten_task_argv_reduction_pct",
			reduction(sequential.argv_chars_p50, batch.argv_chars_p50),
			">=",
			"ten_task_argv_reduction_pct_min",
		],
		[
			"batch_100_afol_calls",
			boundary.afolCalls,
			"<=",
			"batch_100_afol_calls_max",
		],
		[
			"batch_100_verification_runs",
			boundary.verificationRuns,
			"<=",
			"batch_100_verification_runs_max",
		],
		[
			"batch_100_argv_chars",
			boundary.argvChars,
			"<=",
			"batch_100_argv_chars_max",
		],
		[
			"batch_100_output_bytes",
			boundary.outputBytes,
			"<=",
			"batch_100_output_bytes_max",
		],
		[
			"batch_100_duration_ms",
			boundary.durationMs,
			"<=",
			"batch_100_duration_ms_max",
		],
	];
	const gates = definitions.map(([id, actual, operator, threshold]) => {
		const expected = baseline.gates[threshold] ?? Number.NaN;
		return {
			id,
			actual,
			operator,
			expected,
			ok:
				Number.isFinite(expected) &&
				(operator === ">=" ? actual >= expected : actual <= expected),
		};
	});
	return {
		status: qualityClaim
			? gates.every((gate) => gate.ok)
				? "passed"
				: "failed"
			: "smoke",
		baseline_id: baseline.baseline_id,
		quality_claim: qualityClaim,
		gates,
	};
}

export function formatBenchmarkSummary(
	result: MultitaskBenchmarkResult,
	comparison: Comparison,
	artifactPath?: string,
): string {
	const sequential = result.repeated_10_tasks.sequential;
	const batch = result.repeated_10_tasks.batch;
	const metric = (before: number, after: number) =>
		`${before}->${after} (-${reduction(before, after)}%)`;
	const failed = comparison.gates.filter((gate) => !gate.ok);
	return [
		`multitask benchmark: ${comparison.status.toUpperCase()} baseline=${comparison.baseline_id} runs=${result.runs}`,
		`10 tasks: calls ${metric(sequential.afol_calls, batch.afol_calls)} verifications ${metric(sequential.verification_runs, batch.verification_runs)}`,
		`latency: p50 ${metric(sequential.p50_ms, batch.p50_ms)} p95 ${metric(sequential.p95_ms, batch.p95_ms)}`,
		`economy: argv ${metric(sequential.argv_chars_p50, batch.argv_chars_p50)} output ${metric(sequential.output_bytes_p50, batch.output_bytes_p50)}`,
		`100 tasks: calls=${result.batch_boundary_100.afolCalls} verifications=${result.batch_boundary_100.verificationRuns} argv=${result.batch_boundary_100.argvChars}chars output=${result.batch_boundary_100.outputBytes}B duration=${result.batch_boundary_100.durationMs}ms`,
		...(failed.length
			? [`failed gates: ${failed.map((gate) => gate.id).join(",")}`]
			: []),
		...(artifactPath ? [`artifact: ${artifactPath}`] : []),
	].join("\n");
}
