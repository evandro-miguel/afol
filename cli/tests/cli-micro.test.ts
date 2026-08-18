import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	CLI_MICRO_THRESHOLDS,
	collectCliMicroThresholdNotes,
	resolveCliMicroInvocation,
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
			`threshold-exceeded:max_output_tokens:${CLI_MICRO_THRESHOLDS.max_output_tokens + 1}>${CLI_MICRO_THRESHOLDS.max_output_tokens}`,
		]);
	});

	test("marks successful commands as failed when their output exceeds a threshold", () => {
		const results = runCliMicroBenchmark(
			process.cwd(),
			{
				max_wall_clock_ms: 60_000,
				max_output_tokens: 0,
			},
			{
				command: process.execPath,
				args: ["-e", "process.stdout.write('x')"],
			},
		);

		expect(results).toHaveLength(7);
		expect(results.every((result) => result.status === "failed")).toBe(true);
		const allResultsExceededOutputThreshold = results.every((result) =>
			result.notes.some((note) =>
				note.startsWith("threshold-exceeded:max_output_tokens:"),
			),
		);
		expect(allResultsExceededOutputThreshold).toBe(true);
	});

	test("self-invokes through the source entrypoint outside compiled builds", () => {
		const mainPath = resolve(process.cwd(), "cli", "main.ts");
		const invocation = resolveCliMicroInvocation(mainPath, "/fixture/bun");
		expect(invocation).toEqual({
			command: "/fixture/bun",
			args: [mainPath],
		});
	});

	test("self-invokes through the running executable in compiled builds", () => {
		expect(
			resolveCliMicroInvocation(
				"B:/~BUN/root/print-bun-main.exe",
				"D:/tools/bin/afol.exe",
			),
		).toEqual({ command: "D:/tools/bin/afol.exe", args: [] });
	});
});
