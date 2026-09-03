import { describe, expect, test } from "bun:test";
import { evolutionBaselineWriterTestApi } from "../dev/update-evolution-benchmark-baseline";

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
});
