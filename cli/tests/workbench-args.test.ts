import { describe, expect, test } from "bun:test";
import {
	parseCloseArgs,
	parseDoneArgs,
	parseNewArgs,
	parseSessionTaskArgs,
} from "../commands/workbench/args";

describe("workbench parseNewArgs", () => {
	test("preserves repeated --task values in order", () => {
		const parsed = parseNewArgs([
			"alpha",
			"--task",
			"first task",
			"--task",
			"second task",
		]);

		expect(parsed.theme).toBe("alpha");
		expect(parsed.metadata.task).toBe("first task");
		expect(parsed.metadata.tasks).toEqual(["first task", "second task"]);
		expect(parsed.json).toBe(false);
	});

	test("rejects research-only and no-plan modes", () => {
		expect(() => parseNewArgs(["alpha", "--research"])).toThrow(
			"does not support research-only or no-plan sessions",
		);
		expect(() => parseNewArgs(["alpha", "--no-plan"])).toThrow(
			"does not support research-only or no-plan sessions",
		);
	});
});

describe("workbench parseCloseArgs", () => {
	test("requires allow-no-report to carry a reason", () => {
		expect(() =>
			parseCloseArgs(
				["--session", "260530_2256_cli-native", "--reason", "why"],
				process.cwd(),
			),
		).toThrow("Missing --allow-no-report for close reason.");
		expect(() =>
			parseCloseArgs(
				["--session", "260530_2256_cli-native", "--allow-no-report"],
				process.cwd(),
			),
		).toThrow("Missing --reason for close allow-no-report.");

		const parsed = parseCloseArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"--allow-no-report",
				"--reason",
				"research-only session",
			],
			process.cwd(),
		);

		expect(parsed.session).toBe("260530_2256_cli-native");
		expect(parsed.allowNoReport).toBe(true);
		expect(parsed.reason).toBe("research-only session");
		expect(parsed.summary).toBe("");
		expect(parsed.json).toBe(false);
	});

	test("accepts close summary short flag", () => {
		const parsed = parseCloseArgs(
			["--session", "260530_2256_cli-native", "-m", "verified close"],
			process.cwd(),
		);
		expect(parsed.summary).toBe("verified close");
	});
});

describe("workbench parseSessionTaskArgs", () => {
	test("supports --brief shorthand", () => {
		const parsed = parseSessionTaskArgs(
			["--brief", "--session", "260530_2256_cli-native", "--task-id", "T-01"],
			"start",
			process.cwd(),
		);

		expect(parsed.brief).toBe(true);
		expect(parsed.briefMode).toBe("compact");
		expect(parsed.compact).toBe(false);
		expect(parsed.json).toBe(false);
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});

	test("supports --brief full", () => {
		const parsed = parseSessionTaskArgs(
			[
				"--brief",
				"full",
				"--session",
				"260530_2256_cli-native",
				"--task-id",
				"T-01",
			],
			"start",
			process.cwd(),
		);

		expect(parsed.brief).toBe(true);
		expect(parsed.briefMode).toBe("full");
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});
});

describe("parseDoneArgs", () => {
	test("supports --test-shell", () => {
		const parsed = parseDoneArgs(
			[
				"--session",
				"260530_2256_cli-native",
				"--task-id",
				"T-01",
				"--test-shell",
				"npm run lint && npm run test",
			],
			process.cwd(),
		);

		expect(parsed.testCommand).toBeNull();
		expect(parsed.testShellCommand).toBe("npm run lint && npm run test");
		expect(parsed.taskId).toBe("T-01");
		expect(parsed.session).toBe("260530_2256_cli-native");
	});

	test("rejects --test and --test-shell together", () => {
		expect(() =>
			parseDoneArgs(
				[
					"--session",
					"260530_2256_cli-native",
					"--task-id",
					"T-01",
					"--test",
					"bun test",
					"--test-shell",
					"bun lint",
				],
				process.cwd(),
			),
		).toThrow("Cannot use both --test and --test-shell in done.");
	});
});
