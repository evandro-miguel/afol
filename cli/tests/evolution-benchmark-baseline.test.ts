import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolutionBaselineWriterTestApi } from "../dev/update-evolution-benchmark-baseline";
import { collectProfileCompatibilityNotes } from "../validate/command";
import {
	validateBenchmarkProvenance,
	validatePendingBaselineContract,
} from "../validate/registry";
import type { Baseline, Scenario } from "../validate/types";

describe("evolution benchmark baseline refresh", () => {
	test("checks clean inputs with the supported Git CLI", () => {
		const repoRoot = mkdtempSync(join(tmpdir(), "afol-evolution-git-"));
		try {
			const initialized = spawnSync("git", ["init", "--quiet"], {
				cwd: repoRoot,
				shell: false,
			});
			expect(initialized.status).toBe(0);
			expect(() =>
				evolutionBaselineWriterTestApi.assertCleanInputs(repoRoot),
			).not.toThrow();
		} finally {
			rmSync(repoRoot, { recursive: true, force: true });
		}
	});

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

	test("accepts only the exact pending-calibration incompatibility shape", () => {
		const valid = {
			status: "incompatible",
			pass: false,
			notes: [
				"expected-exit-honored:0",
				"baseline-incompatible:calibration-pending:calibrate-from-a-commit-already-on-main",
			],
		};
		expect(
			evolutionBaselineWriterTestApi.isPendingCalibrationResult(valid),
		).toBe(true);
		expect(
			evolutionBaselineWriterTestApi.isPendingCalibrationResult({
				...valid,
				notes: [...valid.notes, "profile-incompatible:os"],
			}),
		).toBe(false);
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
			execution_source: "builtin",
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
		expect(
			validateBenchmarkProvenance(undefined, scenario, {
				...baseline,
				baseline_id: "wrong-baseline",
				pack_id: "state-projection",
			}),
		).toEqual([
			"benchmark-provenance-mismatch:evolution-core:evolution-status-contract:baseline_id",
			"benchmark-provenance-mismatch:evolution-core:evolution-status-contract:pack_id",
		]);

		const { calibration_reason: _calibrationReason, ...baselineWithoutReason } =
			baseline;
		expect(
			validatePendingBaselineContract(
				baselineWithoutReason,
				"evolution-core-baseline",
			),
		).toEqual(["evolution-core-baseline-calibration-reason-required"]);
		expect(
			validatePendingBaselineContract(
				{ ...baseline, calibration_reason: "pending-calibration" },
				"evolution-core-baseline",
			),
		).toEqual(["evolution-core-baseline-calibration-reason-placeholder"]);
		expect(
			validatePendingBaselineContract(
				{ ...baseline, calibration_reason: "invalid reason" },
				"evolution-core-baseline",
			),
		).toEqual(["evolution-core-baseline-calibration-reason-format-invalid"]);
		expect(
			validatePendingBaselineContract(
				{ ...baseline, git_commit: "0123456789ab" },
				"evolution-core-baseline",
			),
		).toEqual(["evolution-core-baseline-pending-observed-field:git_commit"]);
	});

	test("reports pending non-mutation baselines as incompatible", () => {
		const scenario = {
			schema_version: "1.0.0",
			scenario_id: "state-export",
			scenario_version: "1.0.0",
			pack_id: "state-projection",
			result_schema: "1.0.0",
			oracle: "normalized-envelope-and-threshold-check",
			thresholds: {},
			baseline_id: "state-projection-v1",
			deterministic_metrics: {},
			execution_source: "builtin",
		} satisfies Scenario;
		const baseline = {
			schema_version: "1.0.0",
			baseline_id: "state-projection-v1",
			pack_id: "state-projection",
			calibration_status: "pending",
			calibration_reason: "public-source-checkout-requires-runtime-project",
		} satisfies Baseline;

		expect(
			collectProfileCompatibilityNotes(scenario, baseline, undefined, null),
		).toEqual([
			"baseline-incompatible:calibration-pending:public-source-checkout-requires-runtime-project",
		]);
	});
});
