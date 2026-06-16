import { describe, expect, test } from "bun:test";
import {
	parseQuickTaskArgs,
	runQuickTaskCommand,
} from "../commands/quick-task";
import { agentOperationContext } from "../core/operation-context";

describe("quick-task parseQuickTaskArgs", () => {
	test("parses theme and defaults", () => {
		const parsed = parseQuickTaskArgs(["alpha"]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.json).toBe(false);
		expect(parsed.command).toBe("quick-task");
		expect(parsed.result).toBe("passed");
		expect(parsed.metadata).toEqual({});
		expect(parsed.artifact).toBeUndefined();
		expect(parsed.note).toBeUndefined();
	});

	test("parses --json flag", () => {
		const parsed = parseQuickTaskArgs(["alpha", "--json"]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.json).toBe(true);
	});

	test("parses -j shorthand", () => {
		const parsed = parseQuickTaskArgs(["alpha", "-j"]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.json).toBe(true);
	});

	test("parses metadata flags", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--feature-id",
			"F-01",
			"--parent-spec",
			"SPEC-001",
			"--task",
			"implement foo",
		]);
		expect(parsed.theme).toBe("alpha");
		expect(parsed.metadata.featureId).toBe("F-01");
		expect(parsed.metadata.parentSpec).toBe("SPEC-001");
		expect(parsed.metadata.task).toBe("implement foo");
	});

	test("parses --command and --artifact and --note", () => {
		const parsed = parseQuickTaskArgs([
			"alpha",
			"--command",
			"bun test",
			"--artifact",
			"dist/out",
			"--note",
			"first run",
		]);
		expect(parsed.command).toBe("bun test");
		expect(parsed.artifact).toBe("dist/out");
		expect(parsed.note).toBe("first run");
	});

	test("throws on missing theme", () => {
		expect(() => parseQuickTaskArgs([])).toThrow("Missing theme");
	});

	test("throws on missing --feature-id value", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--feature-id"])).toThrow(
			"Missing value for --feature-id",
		);
	});

	test("throws on missing --command value", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--command"])).toThrow(
			"Missing value for --command",
		);
	});

	test("throws on --result that is not passed", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--result", "failed"])).toThrow(
			"quick-task requires --result passed",
		);
	});

	test("throws on unknown argument", () => {
		expect(() => parseQuickTaskArgs(["alpha", "--bogus"])).toThrow(
			"Unknown quick-task argument",
		);
	});

	test("happy path parses all options", () => {
		const parsed = parseQuickTaskArgs([
			"my-theme",
			"--json",
			"--feature-id",
			"F-42",
			"--parent-spec",
			"SPEC-X",
			"--task",
			"run tests",
			"--command",
			"echo ok",
			"--result",
			"passed",
			"--artifact",
			"dist/result.json",
			"--note",
			"smoke check",
		]);
		expect(parsed.theme).toBe("my-theme");
		expect(parsed.json).toBe(true);
		expect(parsed.command).toBe("echo ok");
		expect(parsed.result).toBe("passed");
		expect(parsed.metadata.featureId).toBe("F-42");
		expect(parsed.metadata.parentSpec).toBe("SPEC-X");
		expect(parsed.metadata.task).toBe("run tests");
		expect(parsed.artifact).toBe("dist/result.json");
		expect(parsed.note).toBe("smoke check");
	});

	test("happy path --result passed is valid", () => {
		const parsed = parseQuickTaskArgs(["beta", "--result", "passed"]);
		expect(parsed.theme).toBe("beta");
		expect(parsed.result).toBe("passed");
	});

	test("happy path -j shorthand with metadata", () => {
		const parsed = parseQuickTaskArgs([
			"gamma",
			"-j",
			"--feature-id",
			"F-10",
			"--command",
			"ls",
		]);
		expect(parsed.theme).toBe("gamma");
		expect(parsed.json).toBe(true);
		expect(parsed.command).toBe("ls");
		expect(parsed.metadata.featureId).toBe("F-10");
	});
});

describe("quick-task runQuickTaskCommand", () => {
	test("denies restricted agent callers before filesystem mutation", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha"],
			"/tmp/nonexistent",
			agentOperationContext(),
		);
		expect(exitCode).toBe(2);
	});

	test("returns non-zero when theme is missing", async () => {
		// The command exits before touching the filesystem when parse fails
		const exitCode = await runQuickTaskCommand([], "/tmp/nonexistent");
		expect(exitCode).toBe(2);
	});

	test("returns non-zero for invalid --result", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha", "--result", "failed"],
			"/tmp/nonexistent",
		);
		expect(exitCode).toBe(2);
	});

	test("returns non-zero for unknown flag", async () => {
		const exitCode = await runQuickTaskCommand(
			["alpha", "--bogus"],
			"/tmp/nonexistent",
		);
		expect(exitCode).toBe(2);
	});
});
