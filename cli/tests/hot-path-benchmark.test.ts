import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	declaredHotPathArgs,
	runHotPathScenario,
} from "../validate/hot-path-benchmark";
import type {
	HotPathScenarioConfig,
	Scenario,
} from "../validate/types";

function runScenario(config: HotPathScenarioConfig) {
	const root = mkdtempSync(join(tmpdir(), "f32-hot-path-test-"));
	try {
		const command =
			config.operation === "status"
				? config.derived_path === "health"
					? "afol status --health --json"
					: config.derived_path === "catchup"
						? "afol status --catchup --session fixture"
						: "afol status --json"
				: config.operation === "done"
					? "afol done T-01 --test-shell true --json"
					: `afol ${config.operation} --json`;
		const scenario: Scenario = {
			schema_version: "1.0.0",
			scenario_id: `f32-test-${config.operation}-${config.mode}`,
			scenario_version: "1.0.0",
			pack_id: "workbench-parity",
			command,
			result_schema: "1.0.0",
			oracle: "f32-hot-path-test",
			thresholds: {},
			baseline_id: "workbench-parity-v1",
			deterministic_metrics: { duration_ms: 0 },
			implementation_status: "implemented",
			runner: "hot-path",
			hot_path: {
				...config,
				...(config.mode === "explicit-derived" && config.operation !== "status"
					? { recovery_command: "afol local-state rebuild --json" }
					: {}),
			},
		};
		return runHotPathScenario(root, scenario, {
			sampleCount: 1,
			warmupCount: 0,
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("F-32 hot-path benchmark runner", () => {
	test("executes lifecycle catalog argv without synthesizing --session", () => {
		const session = "fixture-session";
		expect(
			declaredHotPathArgs(
				{ operation: "start", mode: "default" },
				"afol start T-01 --json",
				session,
			),
		).toEqual(["start", "T-01", "--json"]);
		expect(
			declaredHotPathArgs(
				{ operation: "done", mode: "default" },
				"afol done T-01 --test-shell true --json",
				session,
			),
		).toEqual(["done", "T-01", "--test-shell", "true", "--json"]);
		expect(
			declaredHotPathArgs(
				{ operation: "close", mode: "default" },
				"afol close --json",
				session,
			),
		).toEqual(["close", "--json"]);
	});

	test.each(["status", "start", "done", "close"] as const)(
		"default %s records no derived work or telemetry",
		(operation) => {
			const result = runScenario({ operation, mode: "default" });
			expect(result.passed).toBe(true);
			expect(result.metrics.derived_work_calls).toBe(0);
			expect(result.metrics.telemetry_append_count).toBe(0);
			expect(result.metrics.instrumented_duration_ms).toBeGreaterThan(0);
			if (operation !== "status") {
				expect(result.metrics.canonical_write_count).toBeGreaterThan(0);
			}
		},
	);

	test.each(["status", "start", "done", "close"] as const)(
		"explicit-derived %s reports derived work",
		(operation) => {
			const derived_path = operation === "status" ? "health" : "rebuild";
			const result = runScenario({
				operation,
				mode: "explicit-derived",
				derived_path,
			});
			expect(result.passed).toBe(true);
			expect(result.metrics.derived_work_calls).toBeGreaterThan(0);
			expect(result.metrics.telemetry_append_count).toBe(0);
			expect(result.metrics.instrumented_duration_ms).toBeGreaterThan(0);
		},
	);
});
