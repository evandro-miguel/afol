import { describe, expect, test } from "bun:test";
import { evolutionBaselineWriterTestApi } from "../dev/update-evolution-benchmark-baseline";
import { validateBenchmarkProvenance } from "../validate/registry";
import type { Baseline, Scenario } from "../validate/types";

describe("evolution benchmark baseline refresh", () => {
	test("requires an exact prior-provenance issue for a failed refresh run", () => {
		expect(
			evolutionBaselineWriterTestApi.isPriorProvenanceOnlyFailure({
				status: "failed",
				pass: false,
				contract_issues: [],
			}),
		).toBe(false);

		expect(
			evolutionBaselineWriterTestApi.isPriorProvenanceOnlyFailure({
				status: "failed",
				pass: false,
				contract_issues: [
					"benchmark-provenance-commit-not-ancestor:evolution-core:evolution-status-contract:0123456789ab",
				],
			}),
		).toBe(true);

		expect(
			evolutionBaselineWriterTestApi.isPriorProvenanceOnlyFailure({
				status: "failed",
				pass: false,
				contract_issues: [
					"benchmark-provenance-commit-not-found:evolution-core:evolution-status-contract:0123456789ab",
				],
			}),
		).toBe(true);
	});

	test("rejects unrelated contract issues", () => {
		expect(() =>
			evolutionBaselineWriterTestApi.isPriorProvenanceOnlyFailure({
				status: "failed",
				pass: false,
				contract_issues: ["mutation-baseline-git-commit-not-ancestor"],
			}),
		).toThrow("Benchmark input contains unrelated contract issues");
	});

	test("allows an explicit pending evolution calibration without measurement", () => {
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: "evolution-status-contract",
			scenario_version: "1.1.0",
			pack_id: "evolution-core",
			result_schema: "1.0.0",
			oracle: "normalized-envelope-and-threshold-check",
			thresholds: { max_duration_ms: 4000 },
			baseline_id: "evolution-core-v2",
			deterministic_metrics: {},
		};
		const baseline: Baseline = {
			schema_version: "1.0.0",
			baseline_id: "evolution-core-v2",
			pack_id: "evolution-core",
			calibration_status: "pending",
			calibration_reason: "calibrate-from-a-commit-already-on-main",
		};

		expect(validateBenchmarkProvenance(undefined, scenario, baseline)).toEqual(
			[],
		);
	});
});
