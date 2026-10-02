import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	CLI_MICRO_THRESHOLDS,
	collectCliMicroThresholdNotes,
	resolveCliMicroInvocation,
	runCliMicroBenchmark,
} from "../services/benchmark/cli-micro";
import { TRUSTED_BUN_CONFIG_PATH } from "../services/benchmark/trusted-bun";

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
			args: ["--no-env-file", `--config=${TRUSTED_BUN_CONFIG_PATH}`, mainPath],
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

	test("accounts for stdout and stderr and keeps 5k output diagnostic", () => {
		const root = mkdtempSync(join(tmpdir(), "cli-micro-stderr-"));
		try {
			const scriptPath = join(root, "emit-output.js");
			writeFileSync(
				scriptPath,
				"process.stdout.write('x'); process.stderr.write('y');",
				"utf8",
			);
			const results = runCliMicroBenchmark(
				root,
				{
					max_wall_clock_ms: 60_000,
					max_output_tokens: 1,
				},
				{
					command: process.execPath,
					args: [scriptPath],
				},
			);
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
