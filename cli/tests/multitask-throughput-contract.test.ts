import { describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	assertValidMultitaskBenchmarkBaseline,
	evaluateMultitaskBenchmark,
	formatBenchmarkSummary,
	type MultitaskBenchmarkBaseline,
	type MultitaskBenchmarkResult,
	repeatedPairOrder,
} from "../dev/multitask-throughput-contract";

const baseline = JSON.parse(
	readFileSync(
		join(
			process.cwd(),
			".afol/data/benchmarks/baselines/multitask-throughput-v1.json",
		),
		"utf8",
	),
) as MultitaskBenchmarkBaseline;

function result(): MultitaskBenchmarkResult {
	const sequential = {
		afol_calls: 22,
		verification_runs: 10,
		samples_ms: Array.from({ length: 12 }, () => 2_700),
		p50_ms: 2_700,
		p95_ms: 3_300,
		output_bytes_p50: 2_432,
		argv_chars_p50: 357,
	};
	const batch = {
		afol_calls: 4,
		verification_runs: 1,
		samples_ms: Array.from({ length: 12 }, () => 720),
		p50_ms: 720,
		p95_ms: 1_100,
		output_bytes_p50: 1_596,
		argv_chars_p50: 85,
	};
	return {
		schema: "afol.multitask-throughput/v2",
		generated_at: "2026-07-29T00:00:00.000Z",
		environment: {
			platform: "linux",
			arch: "x64",
			bun_version: "fixture",
			timing_mode: "paired-relative",
			pair_order: "alternating",
			source_commit: "0".repeat(40),
			source_dirty: false,
			baseline_sha256: "0".repeat(64),
		},
		runs: 12,
		first_attempt_success: true,
		retries: 0,
		scaling: [],
		batch_boundary_100: {
			afolCalls: 4,
			verificationRuns: 1,
			durationMs: 3_200,
			outputBytes: 1_665,
			argvChars: 91,
		},
		repeated_10_tasks: { sequential, batch },
	};
}

describe("multitask throughput benchmark contract", () => {
	test("rejects incomplete baselines before measurement", () => {
		const invalid = structuredClone(baseline);
		delete invalid.gates.batch_100_duration_ms_max;
		expect(() =>
			assertValidMultitaskBenchmarkBaseline(invalid, "fixture"),
		).toThrow("missing finite gate batch_100_duration_ms_max");
	});

	test("rejects a baseline without an identity", () => {
		const invalid = structuredClone(baseline);
		invalid.baseline_id = "";
		expect(() =>
			assertValidMultitaskBenchmarkBaseline(invalid, "fixture"),
		).toThrow("Invalid multitask benchmark baseline");
	});

	test("exits 2 without saving when the baseline is malformed", () => {
		const scratchRoot = join(process.cwd(), ".tmp");
		mkdirSync(scratchRoot, { recursive: true });
		const fixtureRoot = mkdtempSync(
			join(scratchRoot, "bad-benchmark-baseline-"),
		);
		const baselinePath = join(fixtureRoot, "invalid.json");
		const resultsRoot = join(process.cwd(), ".afol/data/benchmarks/results");
		const before = readdirSync(resultsRoot).sort();
		const invalid = structuredClone(baseline);
		delete invalid.gates.batch_100_duration_ms_max;
		writeFileSync(baselinePath, `${JSON.stringify(invalid)}\n`);
		try {
			const spawned = Bun.spawnSync(
				[
					"bun",
					"run",
					"cli/dev/multitask-throughput-benchmark.ts",
					"--baseline",
					baselinePath,
					"--save",
				],
				{ cwd: process.cwd() },
			);
			expect(spawned.exitCode).toBe(2);
			expect(spawned.stderr.toString()).toContain(
				"missing finite gate batch_100_duration_ms_max",
			);
			expect(readdirSync(resultsRoot).sort()).toEqual(before);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	test("counterbalances repeated pair order", () => {
		expect(repeatedPairOrder(0)).toEqual(["sequential", "batch"]);
		expect(repeatedPairOrder(1)).toEqual(["batch", "sequential"]);
		expect(repeatedPairOrder(2)).toEqual(["sequential", "batch"]);
	});

	test("passes every relative and 100-task quality gate", () => {
		const comparison = evaluateMultitaskBenchmark(result(), baseline);
		expect(comparison.status).toBe("passed");
		expect(comparison.quality_claim).toBe(true);
		expect(comparison.gates).toHaveLength(11);
		expect(comparison.gates.every((gate) => gate.ok)).toBe(true);
	});

	test("fails regressions in calls and bounded 100-task output", () => {
		const regressed = result();
		regressed.repeated_10_tasks.batch.afol_calls = 8;
		regressed.batch_boundary_100.outputBytes = 5_001;
		const comparison = evaluateMultitaskBenchmark(regressed, baseline);
		expect(comparison.status).toBe("failed");
		expect(
			comparison.gates.filter((gate) => !gate.ok).map((gate) => gate.id),
		).toEqual(["ten_task_call_reduction_pct", "batch_100_output_bytes"]);
	});

	test("labels one-run checks as smoke without a quality claim", () => {
		const comparison = evaluateMultitaskBenchmark(result(), baseline, false);
		expect(comparison.status).toBe("smoke");
		expect(comparison.quality_claim).toBe(false);
		expect(comparison.gates.every((gate) => gate.ok)).toBe(true);
	});

	test("keeps the default report compact and decision-oriented", () => {
		const benchmark = result();
		const comparison = evaluateMultitaskBenchmark(benchmark, baseline);
		const summary = formatBenchmarkSummary(benchmark, comparison);
		expect(summary).toContain("multitask benchmark: PASSED");
		expect(summary).toContain("10 tasks: calls 22->4");
		expect(summary).toContain("economy: argv");
		expect(summary).not.toContain("tokens:");
		expect(summary).toContain("100 tasks: calls=4");
		expect(Buffer.byteLength(summary, "utf8")).toBeLessThan(600);
	});
});
