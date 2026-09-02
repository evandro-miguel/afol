import { describe, expect, test } from "bun:test";
import { assertCompiledHotPathBenchmark } from "../dev/dist-smoke-assertions";

const artifactSha256 = "a".repeat(64);

function result(overrides: Record<string, unknown> = {}) {
	return {
		scenario_id: "f32-status-default",
		pack_id: "workbench-parity",
		status: "passed",
		pass: true,
		duration_ms: 10,
		error_count: 0,
		sample_count: 20,
		execution_mode: "compiled-release",
		artifact_mode: "bun-compile",
		artifact_sha256: artifactSha256,
		...overrides,
	};
}

function payload(
	results = [result()],
	overrides: Record<string, unknown> = {},
) {
	return JSON.stringify({
		status: "passed",
		pass: true,
		selected_pack_ids: ["workbench-parity"],
		result_count: results.length,
		summary: {
			total: results.length,
			passed: results.length,
			failed: 0,
			skipped: 0,
			baseline_missing: 0,
		},
		results,
		...overrides,
	});
}

describe("compiled dist smoke benchmark assertions", () => {
	const expectedScenarioIds = new Set(["f32-status-default"]);

	test("accepts passed workbench-parity results with candidate provenance", () => {
		expect(
			assertCompiledHotPathBenchmark(
				payload(),
				expectedScenarioIds,
				artifactSha256,
			),
		).toEqual({
			resultCount: 1,
			passed: 1,
			artifactSha256,
		});
	});

	test.each([
		["invalid JSON", "not-json", /invalid JSON/, expectedScenarioIds],
		[
			"failed benchmark",
			payload(undefined, { status: "failed", pass: false }),
			/did not report passed/,
			expectedScenarioIds,
		],
		[
			"failed result",
			payload([result({ status: "failed" })]),
			/not passed workbench-parity coverage/,
			expectedScenarioIds,
		],
		[
			"source provenance",
			payload([result({ execution_mode: "source" })]),
			/not compiled-release/,
			expectedScenarioIds,
		],
		[
			"artifact mode",
			payload([result({ artifact_mode: "source" })]),
			/not bun-compile/,
			expectedScenarioIds,
		],
		[
			"artifact hash",
			payload([result({ artifact_sha256: "b".repeat(64) })]),
			/hash does not match candidate/,
			expectedScenarioIds,
		],
	] as const)("rejects %s", (_label, stdout, message, scenarioIds) => {
		expect(() =>
			assertCompiledHotPathBenchmark(stdout, scenarioIds, artifactSha256),
		).toThrow(message);
	});

	test("rejects empty or incomplete results", () => {
		expect(() =>
			assertCompiledHotPathBenchmark(
				payload([]),
				expectedScenarioIds,
				artifactSha256,
			),
		).toThrow(/results are empty/);
	});

	test("rejects a result with no scenario id", () => {
		expect(() =>
			assertCompiledHotPathBenchmark(
				payload([result({ scenario_id: undefined })]),
				expectedScenarioIds,
				artifactSha256,
			),
		).toThrow(/has no scenario id/);
	});

	test.each([
		[
			"missing scenario IDs",
			payload([result()]),
			/missing=.*f32-status-health/,
		],
		[
			"duplicate scenario IDs",
			payload([result(), result()]),
			/duplicate=.*f32-status-default/,
		],
		[
			"unknown scenario IDs",
			payload([result({ scenario_id: "unexpected-scenario" })]),
			/unknown=.*unexpected-scenario/,
		],
	] as const)("rejects %s", (_label, stdout, message) => {
		const expectedIds = new Set(["f32-status-default", "f32-status-health"]);
		expect(() =>
			assertCompiledHotPathBenchmark(stdout, expectedIds, artifactSha256),
		).toThrow(message);
	});

	test.each([
		["non-positive duration", { duration_ms: 0 }],
		["non-number duration", { duration_ms: "10" }],
		["fractional sample count", { sample_count: 1.5 }],
		["non-positive sample count", { sample_count: 0 }],
		["non-zero error count", { error_count: 1 }],
	] as const)("rejects %s", (_label, measurement) => {
		expect(() =>
			assertCompiledHotPathBenchmark(
				payload([result(measurement)]),
				expectedScenarioIds,
				artifactSha256,
			),
		).toThrow(/no meaningful measurements/);
	});
});
