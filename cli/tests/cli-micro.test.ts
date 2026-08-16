import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	CLI_MICRO_THRESHOLDS,
	collectCliMicroThresholdNotes,
	runCliMicroBenchmark,
} from "../services/benchmark/cli-micro";

describe("CLI micro benchmark thresholds", () => {
	test("reports output and duration threshold breaches", () => {
		expect(
			collectCliMicroThresholdNotes(
				CLI_MICRO_THRESHOLDS.max_wall_clock_ms + 1,
				CLI_MICRO_THRESHOLDS.max_output_tokens + 1,
			),
		).toEqual([
			`threshold-exceeded:max_wall_clock_ms:${CLI_MICRO_THRESHOLDS.max_wall_clock_ms + 1}>${CLI_MICRO_THRESHOLDS.max_wall_clock_ms}`,
			`token-rule:non-ideal(>5k):${CLI_MICRO_THRESHOLDS.max_output_tokens + 1}tokens`,
			`threshold-exceeded:max_output_tokens:${CLI_MICRO_THRESHOLDS.max_output_tokens + 1}>${CLI_MICRO_THRESHOLDS.max_output_tokens}`,
		]);
	});

	test("marks successful commands as failed when their output exceeds a threshold", () => {
		const tempRoot = join(process.cwd(), ".afol", "tmp", "tests");
		mkdirSync(tempRoot, { recursive: true });
		const root = mkdtempSync(join(tempRoot, "cli-micro-"));
		try {
			const afolPath = join(root, "afol");
			writeFileSync(afolPath, "#!/bin/sh\nprintf x\n", "utf8");
			chmodSync(afolPath, 0o755);

			const results = runCliMicroBenchmark(root, {
				max_wall_clock_ms: 60_000,
				max_output_tokens: 0,
			});

			expect(results).toHaveLength(7);
			expect(results.every((result) => result.status === "failed")).toBe(true);
			const allResultsExceededOutputThreshold = results.every((result) =>
				result.notes.some((note) =>
					note.startsWith("threshold-exceeded:max_output_tokens:"),
				),
			);
			expect(allResultsExceededOutputThreshold).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accounts for stdout and stderr and keeps 5k output diagnostic", () => {
		const tempRoot = join(process.cwd(), ".afol", "tmp", "tests");
		mkdirSync(tempRoot, { recursive: true });
		const root = mkdtempSync(join(tempRoot, "cli-micro-stderr-"));
		try {
			const afolPath = join(root, "afol");
			writeFileSync(afolPath, "#!/bin/sh\nprintf x\nprintf y >&2\n", "utf8");
			chmodSync(afolPath, 0o755);

			const results = runCliMicroBenchmark(root, {
				max_wall_clock_ms: 60_000,
				max_output_tokens: 1,
			});
			expect(results.every((result) => result.output_bytes === 2)).toBe(true);
			expect(
				results.every((result) => result.estimated_output_tokens === 1),
			).toBe(true);
			expect(
				collectCliMicroThresholdNotes(0, 5_001).some((note) =>
					note.startsWith("token-rule:non-ideal(>5k):"),
				),
			).toBe(true);
			expect(collectCliMicroThresholdNotes(0, 5_001)).not.toContainEqual(
				"threshold-exceeded:max_output_tokens:5001>5000",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
