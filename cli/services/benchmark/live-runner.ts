import { normalizeCommandForBenchmark, type parseEventStream } from "./metrics";
import type { BenchScenario, BenchThresholds, LiveBenchResult } from "./types";
import {
	BENCH_SCHEMA_VERSION,
	DEFAULT_BENCH_MODEL,
	DEFAULT_BENCH_PACK_ID,
} from "./types";

type LiveBenchOptions = {
	keepArtifacts?: boolean;
};

const EXTERNAL_RECEIPT_REQUIRED =
	"external-receipt-required:run the fixed harness outside AFOL and provide its validated receipt";

function commandSegments(command: string): string[] {
	return normalizeCommandForBenchmark(command)
		.split(/&&|\|\||;|\r?\n/g)
		.map((segment) => segment.trim());
}

export function commandMatchesExpected(
	command: string,
	expected: string,
): boolean {
	const normalizedExpected = expected.trim().replace(/\s+/g, " ");
	if (!normalizedExpected) return true;
	return commandSegments(command).some((segment) => {
		const normalizedSegment = segment.replace(/\s+/g, " ");
		return (
			normalizedSegment === normalizedExpected ||
			normalizedSegment.startsWith(`${normalizedExpected} `)
		);
	});
}

function commandIncludesForbidden(command: string, forbidden: string): boolean {
	const normalizedForbidden = forbidden.trim().replace(/\s+/g, " ");
	return (
		Boolean(normalizedForbidden) &&
		normalizeCommandForBenchmark(command)
			.replace(/\s+/g, " ")
			.includes(normalizedForbidden)
	);
}

export function collectExpectationNotes(
	scenario: BenchScenario,
	metrics: ReturnType<typeof parseEventStream>,
): string[] {
	const commands = metrics.tools.calls.map((call) => call.command);
	return [
		...(scenario.expected?.commands_used ?? []).flatMap((expected) =>
			commands.some((command) => commandMatchesExpected(command, expected))
				? []
				: [`expected-command-missing:${expected}`],
		),
		...(scenario.expected?.forbidden_commands ?? []).flatMap((forbidden) =>
			commands.some((command) => commandIncludesForbidden(command, forbidden))
				? [`forbidden-command:${forbidden}`]
				: [],
		),
	];
}

function normalizeThresholds(
	thresholds?: Partial<BenchThresholds>,
): BenchThresholds {
	return {
		max_output_tokens: thresholds?.max_output_tokens ?? 4_000,
		max_duration_ms: thresholds?.max_duration_ms ?? 120_000,
		min_tool_success_rate: thresholds?.min_tool_success_rate ?? 0.8,
	};
}

/**
 * AFOL intentionally does not execute benchmark agents. Model selection,
 * scheduling, execution, and retries belong to the external fixed harness.
 */
export function runLiveBenchmark(
	_root: string,
	scenario: BenchScenario,
	_opts: LiveBenchOptions = {},
): LiveBenchResult {
	return {
		schema_version: BENCH_SCHEMA_VERSION,
		run_id: `${scenario.id}-${Date.now().toString(36)}`,
		scenario_id: scenario.id,
		pack_id: DEFAULT_BENCH_PACK_ID,
		status: "blocked",
		mode: "live",
		git_commit: "unknown",
		model: DEFAULT_BENCH_MODEL,
		timestamp: new Date().toISOString(),
		tokens: {
			input: 0,
			output: 0,
			cached_input: 0,
			reasoning_output: 0,
			total: 0,
		},
		timing: { wall_clock_ms: 0 },
		tools: {
			total_calls: 0,
			success_rate: 0,
			by_type: { file_read: 0, afol_command: 0, shell: 0, agent_message: 0 },
			error_count: 0,
		},
		effectiveness: { task_completed: false, error_count: 0 },
		plan_quality: { meta_planning_detected: false, direct_execution: false },
		thresholds: normalizeThresholds(scenario.thresholds),
		pass: false,
		notes: [EXTERNAL_RECEIPT_REQUIRED],
	};
}
