import { describe, expect, test } from "bun:test";
import {
	beginHotPathMeasurement,
	countHotPathOperation,
	HOT_PATH_COUNTER_CAP,
	HOT_PATH_DURATION_MS_CAP,
	HOT_PATH_OUTPUT_BYTES_CAP,
	readHotPathCountersForTests,
	readHotPathMeasurementsForTests,
	resetHotPathCountersForTests,
} from "../services/hot-path/instrumentation";

describe("hot-path instrumentation", () => {
	test("caps process-local operation counters and bounded measurements", () => {
		resetHotPathCountersForTests();
		for (let index = 0; index <= HOT_PATH_COUNTER_CAP; index += 1) {
			countHotPathOperation("status.health");
			for (const operation of ["status", "start", "done", "close"] as const) {
				beginHotPathMeasurement(operation)(
					"x".repeat(HOT_PATH_OUTPUT_BYTES_CAP + 1),
				);
			}
		}

		expect(readHotPathCountersForTests()["status.health"]).toBe(
			HOT_PATH_COUNTER_CAP,
		);
		for (const operation of ["status", "start", "done", "close"] as const) {
			const measurement = readHotPathMeasurementsForTests()[operation];
			expect(measurement.calls).toBe(HOT_PATH_COUNTER_CAP);
			expect(measurement.duration_ms).toBeLessThanOrEqual(
				HOT_PATH_COUNTER_CAP * HOT_PATH_DURATION_MS_CAP,
			);
			expect(measurement.output_bytes).toBe(
				HOT_PATH_COUNTER_CAP * HOT_PATH_OUTPUT_BYTES_CAP,
			);
		}
	});
});
